/** Cross-origin browser lane using the actual @vega/astro bridge source, not a protocol double.
 * Set VEGA_ASTRO_ROOT to the reviewed Astro checkout and build its fixture first (`pnpm build`
 * there writes `fixtures/basic/dist/inline-preview/index.html`). The memory backend exercises the
 * real form save/version path; it does not certify PocketBase or the encrypted-token service.
 *
 * The fixture mirrors the showcase «Inicio» page (portada / texto / galería, same field names and
 * widgets). Each annotated value is a `__VEGA_INLINE__<block>__<field>__` placeholder: this file
 * fills it with the latest draft the CMS sent to `/token`, which is exactly what a preview route
 * renders. Input (keyboard, IME through CDP, paste through the system clipboard) is real browser
 * input into the real bridge inside a cross-origin iframe.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { webkit, type CDPSession, type FrameLocator, type Page } from '@playwright/test';
import { expect, loginAsDemo, preparePage, test } from './fixtures';
import { createVisualSite } from './visual-site';

const astroRoot = process.env.VEGA_ASTRO_ROOT;
const SITE = 'https://inline-astro.example';
const CMS = `http://localhost:${process.env.VEGA_E2E_PORT ?? 4173}`;
const escape = (value: string) =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

/** Seed values of `SECCIONES_RECORDS` (`src/lib/session/demo-seed.ts`), per block and field. */
const SEED: Record<string, Record<string, string>> = {
	seccion_1: {
		heading: 'Escribe. Publica. Olvídate del resto.',
		subtitulo: 'Un CMS editor-first sobre tu propio PocketBase.'
	},
	seccion_2: {
		heading: 'Tu contenido, en tu servidor',
		texto: 'Sin cuentas de terceros ni exportaciones a medianoche: los datos ya son tuyos.'
	},
	seccion_3: {
		heading: 'Se adapta a tu modelo',
		pie: 'Capturas del editor visual, la lista y la ficha de un registro.'
	}
};

interface InlineSite {
	/** Token requests so far (each one is a preview refresh). */
	tokenRequests(): number;
	/** The latest value of a block field the CMS sent (draft or saved). */
	value(block: string, field: string): string | undefined;
	/** Holds every token answer until the returned function is called: the page keeps showing what
	 *  it showed, whatever the draft says meanwhile. */
	holdTokens(): () => void;
}

/** Page record values of `pagina_1` in the showcase seed, painted outside the blocks root. */
const RECORD_SEED: Record<string, string> = { title: 'Inicio', description: '' };

/** Inline Markdown of the fixture's «site»: links and strong emphasis, HTML-escaped first. */
const inlineMarkdown = (source: string) =>
	escape(source)
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

/**
 * Serves the built fixture from another origin, filled with the latest draft Vega sent. With
 * `markdown`, `seccion_2.texto` is painted as Markdown paragraphs annotated with their source
 * ranges by the real `@vega/astro/markdown-source` (the site's «parser» here splits paragraphs
 * on blank lines, and the same tokens give the ranges, as a real site must do).
 */
async function installSite(page: Page, { markdown = false } = {}): Promise<InlineSite> {
	const fixture = readFileSync(
		join(astroRoot!, 'fixtures/basic/dist/inline-preview/index.html'),
		'utf8'
	).replaceAll('http://localhost:4173', CMS);
	const source = markdown
		? ((await import(join(astroRoot!, 'packages/astro/src/markdown-source.ts'))) as {
				markVegaMarkdownTokens(field: string, value: string, tokens: object[]): number;
				withVegaSource(html: string, token: object): string;
			})
		: null;
	const renderMarkdown = (value: string, attributes: string) => {
		const tokens = value
			.split(/(\n{2,})/)
			.filter((raw) => raw !== '')
			.map((raw) => ({ type: /^\n+$/.test(raw) ? 'space' : 'paragraph', raw }));
		source!.markVegaMarkdownTokens('texto', value, tokens);
		return tokens
			.filter((token) => token.type === 'paragraph')
			.map((token) =>
				source!.withVegaSource(
					`<p class="body"${attributes}>${inlineMarkdown(token.raw)}</p>`,
					token
				)
			)
			.join('');
	};
	const values = structuredClone(SEED);
	const record = { ...RECORD_SEED };
	let held: Promise<void> | null = null;
	let tokens = 0;
	await page.route(`${SITE}/**`, async (route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') {
			await route.fulfill({
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': CMS,
					'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept'
				}
			});
			return;
		}
		const pathname = new URL(request.url()).pathname;
		if (pathname.endsWith('/token')) {
			tokens++;
			if (held) await held;
			const payload = request.postDataJSON();
			for (const [name, value] of Object.entries(payload.draft?.record?.fields ?? {}))
				if (name in record) record[name] = typeof value === 'string' ? value : '';
			for (const block of payload.draft?.blocks ?? []) {
				const target = values[block.id];
				if (!target) continue;
				const data =
					typeof block.fields?.datos === 'string'
						? JSON.parse(block.fields.datos)
						: (block.fields?.datos ?? {});
				for (const field of Object.keys(target)) {
					const value = block.fields?.[field] ?? data?.[field];
					if (typeof value === 'string') target[field] = value;
				}
			}
			await route.fulfill({
				contentType: 'application/json',
				headers: { 'Access-Control-Allow-Origin': CMS },
				body: JSON.stringify({
					url: `${SITE}/preview`,
					postToken: 'fixture-body-token',
					expiresAt: new Date(Date.now() + 300_000).toISOString()
				})
			});
			return;
		}
		if (pathname.startsWith('/_astro/') && !pathname.includes('..')) {
			await route.fulfill({
				contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
				body: readFileSync(join(astroRoot!, 'fixtures/basic/dist', pathname))
			});
			return;
		}
		const html = (
			source
				? fixture.replace(
						/<p class="body" data-vega-field="texto"([^>]*)>__VEGA_INLINE__seccion_2__texto__<\/p>/,
						(_match, attributes: string) => renderMarkdown(values.seccion_2.texto, attributes)
					)
				: fixture
		)
			.replace(/__VEGA_INLINE__(\w+?)__(\w+?)__/g, (_match, block, field) =>
				escape(values[block]?.[field] ?? '')
			)
			.replace(/__VEGA_RECORD__(\w+?)__/g, (_match, field) => escape(record[field] ?? ''));
		await route.fulfill({
			contentType: 'text/html',
			headers: { 'Content-Security-Policy': `frame-ancestors ${CMS}` },
			body: html
		});
	});
	await page.addInitScript((url) => {
		(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = url;
	}, `${SITE}/api/preview`);
	return {
		tokenRequests: () => tokens,
		value: (block, field) => values[block]?.[field],
		holdTokens() {
			let release!: () => void;
			held = new Promise((resolve) => (release = resolve));
			return () => {
				held = null;
				release();
			};
		}
	};
}

const frameOf = (page: Page) => page.frameLocator('.vega-visual-frame');
const field = (frame: FrameLocator, block: string, name: string) =>
	frame.locator(`[data-vega-block-id="${block}"] [data-vega-field="${name}"]`);
/** The selected block's form in the inspector (all forms stay mounted, only one is visible). */
const inspector = (page: Page) => page.locator('.vega-inspector-body:not([hidden])');
const inspectorControl = (page: Page, name: string) =>
	inspector(page).locator(`[data-field="${name}"] :is(input, textarea)`);

async function openEditor(page: Page): Promise<InlineSite> {
	const site = await installSite(page);
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto('/c/paginas/pagina_1/visual');
	// v2 negotiated: the real bridge makes annotated leaf text keyboard-focusable only then.
	await expect(field(frameOf(page), 'seccion_2', 'heading')).toHaveAttribute('tabindex', '0');
	return site;
}

/** End-of-text caret. `End` and `Meta+End` do not move a caret in Chromium on macOS (they scroll),
 *  so the test places it through the Selection API; everything typed afterwards is real input. */
const caretToEnd = (node: ReturnType<typeof field>) =>
	node.evaluate((element) => {
		const range = element.ownerDocument.createRange();
		range.selectNodeContents(element);
		range.collapse(false);
		const selection = element.ownerDocument.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
	});

/** Double click, then the caret at the end so typed text is deterministic. */
async function startEditing(page: Page, block: string, name: string) {
	const node = field(frameOf(page), block, name);
	await node.dblclick();
	await expect(node).toHaveAttribute('contenteditable', 'plaintext-only');
	await caretToEnd(node);
	return node;
}

/** Computed colour of a Vega token in the CMS document (what Vega sends as `appearance`). */
const cmsColour = (page: Page, token: string) =>
	page.evaluate((name) => {
		const probe = document.createElement('span');
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const colour = getComputedStyle(probe).color;
		probe.remove();
		return colour;
	}, token);

async function backToForm(page: Page): Promise<void> {
	await page.getByRole('link', { name: /Volver al formulario|Campos de página/ }).click();
	await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
}

test.describe('actual Astro inline bridge', () => {
	test.skip(!astroRoot, 'Requires VEGA_ASTRO_ROOT pointing to the reviewed @vega/astro checkout');

	test('one click selects, a double click opens the text; the inspector mirrors it; Enter applies', async ({
		page
	}) => {
		const site = await openEditor(page);
		const frame = frameOf(page);
		const heading = field(frame, 'seccion_2', 'heading');

		await heading.click();
		await expect(inspector(page)).toHaveAttribute('data-block-id', 'seccion_2');
		await page.waitForTimeout(400); // a single click must never start typing
		await expect(heading).not.toHaveAttribute('contenteditable');

		await heading.dblclick();
		await expect(heading).toHaveAttribute('contenteditable', 'plaintext-only');
		// Vega's own orange, sent in `editField.appearance`, never the system Highlight.
		const outline = await heading.evaluate((node) => {
			const style = getComputedStyle(node);
			return { colour: style.outlineColor, style: style.outlineStyle, caret: style.caretColor };
		});
		expect(outline.style).toBe('solid');
		expect(outline.colour).toBe(await cmsColour(page, '--v-ol-inline'));
		expect(outline.caret).toBe(outline.colour);
		// Nothing pre-selected: the caret is collapsed where the author double-clicked.
		expect(await heading.evaluate((node) => node.ownerDocument.getSelection()?.isCollapsed)).toBe(
			true
		);
		const hint = page.locator('.vega-visual-inline-hint');
		await expect(hint).toContainText('Título');
		await expect(hint).toContainText('escribiendo en la página');

		const control = inspectorControl(page, 'heading');
		await expect(control).toBeEnabled();
		await expect(inspector(page).locator('[data-field="heading"]')).toContainText('en la página');

		await caretToEnd(heading);
		const before = site.tokenRequests();
		await page.keyboard.type(' propio');
		await expect(control).toHaveValue('Tu contenido, en tu servidor propio');
		await page.waitForTimeout(650); // past the preview debounce: no DOM replacement while typing
		expect(site.tokenRequests()).toBe(before);
		expect(
			await heading.evaluate((node) => ({
				text: node.textContent,
				focused: node.ownerDocument.activeElement === node
			}))
		).toEqual({ text: 'Tu contenido, en tu servidor propio', focused: true });

		await page.keyboard.press('Enter');
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(hint).toHaveCount(0);
		await expect(control).toHaveValue('Tu contenido, en tu servidor propio');
		await expect(page.locator('.vega-visual-dirty')).toBeVisible();
		// Applying refreshes the canvas once, from the draft: the page keeps the new text.
		await expect.poll(() => site.tokenRequests()).toBeGreaterThan(before);
		await expect(heading).toHaveText('Tu contenido, en tu servidor propio');
	});

	test('Escape cancels and restores the page and the inspector', async ({ page }) => {
		await openEditor(page);
		const heading = await startEditing(page, 'seccion_1', 'heading');
		await page.keyboard.type(' — borrador');
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			'Escribe. Publica. Olvídate del resto. — borrador'
		);
		await page.keyboard.press('Escape');
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(heading).toHaveText('Escribe. Publica. Olvídate del resto.');
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			'Escribe. Publica. Olvídate del resto.'
		);
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
	});

	test('a textarea takes Enter as a line break and applies on Cmd/Ctrl+Enter; text applies on Enter', async ({
		page
	}) => {
		await openEditor(page);
		const body = await startEditing(page, 'seccion_2', 'texto');
		// The hint names the applying key of a textarea (⌘⏎ on Apple, Ctrl ⏎ elsewhere).
		const hint = page.locator('.vega-visual-inline-hint');
		await expect(hint).toContainText(/(⌘|Ctrl )⏎\s*aplicar/);
		await page.keyboard.press('Enter');
		await page.keyboard.type('Segunda línea.');
		await expect(body).toHaveAttribute('contenteditable', 'plaintext-only');
		await expect(inspectorControl(page, 'texto')).toHaveValue(
			`${SEED.seccion_2.texto}\nSegunda línea.`
		);
		await page.keyboard.press('ControlOrMeta+Enter');
		await expect(body).not.toHaveAttribute('contenteditable');
		await expect(inspectorControl(page, 'texto')).toHaveValue(
			`${SEED.seccion_2.texto}\nSegunda línea.`
		);
		// After the refresh from the draft, the site renders the break (`white-space: pre-line`).
		await expect
			.poll(() => body.evaluate((node) => (node as HTMLElement).innerText))
			.toBe(`${SEED.seccion_2.texto}\nSegunda línea.`);
		// A single-line field never gets a break: Enter (and Shift+Enter) applies.
		const heading = await startEditing(page, 'seccion_2', 'heading');
		await expect(hint).toContainText(/⏎\s*aplicar/);
		await expect(hint).not.toContainText(/(⌘|Ctrl )⏎/);
		await page.keyboard.press('Shift+Enter');
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(inspectorControl(page, 'heading')).toHaveValue(SEED.seccion_2.heading);
	});

	test('the outline hugs the text and the hint pushes the next content instead of covering it', async ({
		page
	}) => {
		await openEditor(page);
		const frame = frameOf(page);
		const heading = field(frame, 'seccion_2', 'heading');
		const next = field(frame, 'seccion_2', 'texto');
		const box = (node: ReturnType<typeof field>) =>
			node.evaluate((element) => {
				const { left, right, top, bottom, width } = element.getBoundingClientRect();
				const range = element.ownerDocument.createRange();
				range.selectNodeContents(element);
				return { left, right, top, bottom, width, text: range.getBoundingClientRect().width };
			});
		const before = await box(heading);
		const nextBefore = await box(next);
		await startEditing(page, 'seccion_2', 'heading');
		const editing = await box(heading);
		// The box shrinks to the text (a few pixels of slack for the caret), the text does not move.
		expect(editing.width).toBeLessThan(before.width);
		expect(editing.width - editing.text).toBeLessThan(8);
		expect(Math.abs(editing.left - before.left)).toBeLessThan(1);
		// The tint is Vega's translucent token, computed in the CMS and sent in `appearance.soft`.
		expect(await heading.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
			await page.evaluate(() => {
				const probe = document.createElement('span');
				probe.style.backgroundColor = 'var(--v-ol-inline-tint)';
				document.body.append(probe);
				const colour = getComputedStyle(probe).backgroundColor;
				probe.remove();
				return colour;
			})
		);
		// The hint (screen coordinates) ends above the next text, which moved down to make room.
		const hint = await page.locator('.vega-visual-inline-hint').boundingBox();
		const frameBox = await page.locator('.vega-visual-frame').boundingBox();
		const zoom = await page
			.locator('.vega-visual-frame')
			.evaluate((el) => el.getBoundingClientRect().width / (el as HTMLIFrameElement).offsetWidth);
		const nextEditing = await box(next);
		expect(nextEditing.top).toBeGreaterThan(nextBefore.top);
		expect(hint!.y + hint!.height).toBeLessThanOrEqual(frameBox!.y + nextEditing.top * zoom);
		expect(hint!.y).toBeGreaterThan(frameBox!.y + editing.bottom * zoom);
		await page.keyboard.press('Escape');
		await expect(heading).not.toHaveAttribute('contenteditable');
		expect((await box(heading)).width).toBe(before.width);
		expect((await box(next)).top).toBe(nextBefore.top);
	});

	test('pasting HTML from the system clipboard inserts plain text', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: CMS });
		await openEditor(page);
		await page.evaluate(async () => {
			await navigator.clipboard.write([
				new ClipboardItem({
					'text/html': new Blob(['<b>Negrita</b> <a href="https://x.test">enlace</a>'], {
						type: 'text/html'
					}),
					'text/plain': new Blob([' Negrita enlace'], { type: 'text/plain' })
				})
			]);
		});
		const heading = await startEditing(page, 'seccion_3', 'heading');
		await page.keyboard.press('ControlOrMeta+v');
		await expect(heading).toHaveText(`${SEED.seccion_3.heading} Negrita enlace`);
		await expect(heading.locator('b, a')).toHaveCount(0);
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			`${SEED.seccion_3.heading} Negrita enlace`
		);
		await page.keyboard.press('Escape');
	});

	test('IME through CDP: Save during composition persists the final committed text', async ({
		page
	}) => {
		await openEditor(page);
		const cdp: CDPSession = await page.context().newCDPSession(page);
		const heading = await startEditing(page, 'seccion_1', 'heading');
		await page.keyboard.type(' ');
		await cdp.send('Input.imeSetComposition', {
			text: 'へんしゅう',
			selectionStart: 5,
			selectionEnd: 5
		});
		await expect(heading).toContainText('へんしゅう');
		// Save from the block form (the sheet's Guardar) while the composition is open; the click must
		// not steal the caret here, so it is dispatched without moving focus (a mouse click is covered
		// below). It goes through the same final-value request as Cmd/Ctrl+S.
		await inspector(page)
			.locator('.vega-block-save-button')
			.evaluate((button) => (button as HTMLElement).click());
		await page.waitForTimeout(2100); // outlives the initial acknowledgement timeout
		await expect(heading).toHaveAttribute('contenteditable', 'plaintext-only');
		await expect(page.locator('.vega-visual-dirty')).toBeVisible(); // nothing saved mid-word
		await cdp.send('Input.insertText', { text: '編集' });
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		await backToForm(page);
		const saved = page.locator('[data-field="heading"] :is(input, textarea)').first();
		await expect(saved).toHaveValue(`${SEED.seccion_1.heading} 編集`);
	});

	test('IME through CDP: a mouse click on Save mid-composition saves exactly what the page shows', async ({
		page
	}) => {
		await openEditor(page);
		const cdp = await page.context().newCDPSession(page);
		const heading = await startEditing(page, 'seccion_1', 'heading');
		await page.keyboard.type(' ');
		await cdp.send('Input.imeSetComposition', { text: 'かな', selectionStart: 2, selectionEnd: 2 });
		await expect(heading).toContainText('かな');
		await inspector(page).locator('.vega-block-save-button').click();
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		const shown = (await heading.textContent()) ?? '';
		await backToForm(page);
		await expect(page.locator('[data-field="heading"] :is(input, textarea)').first()).toHaveValue(
			shown
		);
	});

	test('Save persists across reopening the editor; Discard returns to the saved text', async ({
		page
	}) => {
		const site = await openEditor(page);
		const heading = await startEditing(page, 'seccion_2', 'heading');
		await page.keyboard.type(' (guardado)');
		await page.keyboard.press('Enter');
		const before = site.tokenRequests();
		await inspector(page).locator('.vega-block-save-button').click();
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		// The saved page is what the preview route serves from now on. This double has no backend of
		// its own, so it learns it from the post-save refresh (a real route reads PocketBase).
		await expect.poll(() => site.tokenRequests()).toBeGreaterThan(before);
		await backToForm(page);
		await expect(page.locator('.vega-block-title').nth(1)).toHaveText(
			'Tu contenido, en tu servidor (guardado)'
		);
		// Reopen the editor: a new frame load, a new token, the saved text on the page.
		await page.goBack();
		await expect(heading).toHaveText('Tu contenido, en tu servidor (guardado)');
		// And the form behind the canvas reads it from the backend, not from the double.
		await heading.click();
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			'Tu contenido, en tu servidor (guardado)'
		);

		await startEditing(page, 'seccion_2', 'heading');
		await page.keyboard.type(' y más');
		await page.keyboard.press('Enter');
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			'Tu contenido, en tu servidor (guardado) y más'
		);
		await inspector(page).getByRole('button', { name: 'Descartar' }).click();
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			'Tu contenido, en tu servidor (guardado)'
		);
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		await expect(heading).toHaveText('Tu contenido, en tu servidor (guardado)');
	});

	test('Cmd/Ctrl+S with the focus left in the frame after Enter saves, like the shortcut in Vega', async ({
		page
	}) => {
		// fodaveg QA (21 Oct 2026): keys pressed in a cross-origin frame never reach Vega; the
		// bridge posts `save-shortcut` and Vega saves the open card.
		await openEditor(page);
		const heading = await startEditing(page, 'seccion_2', 'heading');
		await page.keyboard.type(' (atajo)');
		await page.keyboard.press('Enter');
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(page.locator('.vega-visual-dirty')).toBeVisible();
		// The focus is still inside the site's document.
		expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
		// And another, clean block is now the open one: Cmd+S still saves every pending block
		// (decision of 21 Oct 2026; before, it saved only the open card and did nothing here).
		await field(frameOf(page), 'seccion_1', 'heading').click();
		await expect(inspector(page)).toHaveAttribute('data-block-id', 'seccion_1');
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		await backToForm(page);
		await expect(page.locator('.vega-block-title').nth(1)).toHaveText(
			'Tu contenido, en tu servidor (atajo)'
		);
	});

	test('typing in the inspector during a page edit takes over without losing either text', async ({
		page
	}) => {
		await openEditor(page);
		const heading = await startEditing(page, 'seccion_2', 'heading');
		await page.keyboard.type(' A');
		const control = inspectorControl(page, 'heading');
		await expect(control).toHaveValue('Tu contenido, en tu servidor A');
		await control.click();
		await control.evaluate((input) => {
			const element = input as HTMLInputElement;
			element.setSelectionRange(element.value.length, element.value.length);
		});
		await page.keyboard.type('B');
		await expect(control).toHaveValue('Tu contenido, en tu servidor AB');
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(inspector(page).locator('.vega-field-inline-status')).toHaveCount(0);
		await expect(heading).toHaveText('Tu contenido, en tu servidor AB');
	});

	test('a click on another block applies the edit to the draft and selects that block', async ({
		page
	}) => {
		await openEditor(page);
		const heading = await startEditing(page, 'seccion_1', 'heading');
		await page.keyboard.type('!');
		await field(frameOf(page), 'seccion_3', 'pie').click();
		await expect(heading).not.toHaveAttribute('contenteditable');
		await expect(inspector(page)).toHaveAttribute('data-block-id', 'seccion_3');
		await expect(page.locator('.vega-visual-dirty')).toBeVisible();
		await expect(heading).toHaveText(`${SEED.seccion_1.heading}!`);
	});
});

/** Turns `secciones.texto` (the «Texto» section body) into a Markdown field, the way an editor
 *  would: in Settings, then back to the visual editor through the app (the memory backend lives
 *  in the page, so a reload would forget the manifest). */
async function openWithMarkdownBody(page: Page): Promise<InlineSite> {
	const site = await installSite(page, { markdown: true });
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto('/settings');
	const manifestInput = page.locator('#manifest-editor-textarea');
	await expect(manifestInput).toBeVisible();
	const manifest = JSON.parse(await manifestInput.inputValue());
	manifest.collections.secciones.fields.texto.widget = 'markdown';
	await manifestInput.fill(JSON.stringify(manifest, null, 2));
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByText('Manifiesto guardado.', { exact: true })).toBeVisible();
	await page.locator('a[href="/c/paginas"]').first().click();
	await page.locator('a[href="/c/paginas/pagina_1"]').first().click();
	await page.getByRole('button', { name: 'Editor visual', exact: true }).click();
	await expect(page).toHaveURL(/\/c\/paginas\/pagina_1\/visual$/);
	return site;
}

test.describe('page fields, Markdown paragraphs and the edit hint (spec of 22 Oct 2026)', () => {
	test.skip(!astroRoot, 'Requires VEGA_ASTRO_ROOT pointing to the reviewed @vega/astro checkout');

	test('A: the page title outside the blocks is edited in place, mirrored in «Campos de la página» and saved to the record', async ({
		page
	}) => {
		const site = await openEditor(page);
		const frame = frameOf(page);
		const title = frame.locator('[data-vega-record-field="title"]');
		// C: Vega listed it as editable, so it carries the hint and a thin outline under the pointer.
		await expect(title).toHaveAttribute('title', 'Doble clic para editar');
		await expect(title).toHaveAttribute('tabindex', '0');
		await title.hover();
		await expect
			.poll(() => title.evaluate((node) => getComputedStyle(node).outlineStyle))
			.toBe('dashed');
		// The chrome around the page (not from the record) shows nothing.
		await expect(frame.locator('.snav')).not.toHaveAttribute('title');

		await title.dblclick();
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await caretToEnd(title);
		await page.keyboard.type(' de Vega');
		const card = page.locator('.vega-page-fields');
		await expect(card).toBeVisible();
		const control = card.locator('[data-field="title"] :is(input, textarea)');
		await expect(control).toHaveValue('Inicio de Vega');
		await expect(card.locator('[data-field="title"]')).toContainText('en la página');
		// The path of the page is never offered in this card.
		await expect(card.locator('[data-field="path"]')).toHaveCount(0);
		const hint = page.locator('.vega-visual-inline-hint');
		await expect(hint).toContainText('Título');
		const before = site.tokenRequests();
		await page.keyboard.press('Enter');
		await expect(title).not.toHaveAttribute('contenteditable');
		await expect(title).toHaveText('Inicio de Vega');
		// Applying refreshes the canvas once, with the record draft in the token.
		await expect.poll(() => site.tokenRequests()).toBeGreaterThan(before);
		await expect(card.locator('.vega-block-save-button')).toBeEnabled();
		// Cmd/Ctrl+S with the focus left in the frame saves the page record too.
		await page.keyboard.press('ControlOrMeta+s');
		await expect(card.locator('.vega-block-save-button')).toBeDisabled();
		await expect(page.locator('h1[aria-current="page"]')).toHaveText('Inicio de Vega');
		await backToForm(page);
		await expect(page.locator('#vega-field-title')).toHaveValue('Inicio de Vega');
	});

	test('A: Escape restores the page title and the card; Enter/F2 on the focused title opens it', async ({
		page
	}) => {
		await openEditor(page);
		const title = frameOf(page).locator('[data-vega-record-field="title"]');
		await expect(title).toHaveAttribute('tabindex', '0');
		await title.focus();
		await page.keyboard.press('F2');
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await page.keyboard.type('Otra cosa');
		const control = page.locator('.vega-page-fields [data-field="title"] :is(input, textarea)');
		await expect(control).toHaveValue('InicioOtra cosa');
		await page.keyboard.press('Escape');
		await expect(title).not.toHaveAttribute('contenteditable');
		await expect(title).toHaveText('Inicio');
		await expect(control).toHaveValue('Inicio');
		await expect(page.locator('.vega-page-fields .vega-block-save-button')).toBeDisabled();
	});

	test('B: a Markdown paragraph is edited as its own source; only that range of the field changes', async ({
		page
	}) => {
		const site = await openWithMarkdownBody(page);
		const frame = frameOf(page);
		const paragraphs = frame.locator('[data-vega-block-id="seccion_2"] [data-vega-source-range]');
		await expect(paragraphs).toHaveCount(1);
		await expect(paragraphs.first()).toHaveAttribute('title', 'Doble clic para editar');
		// The plain-text annotation is gone: the field is Markdown now, edited by ranges.
		await paragraphs.first().dblclick();
		await expect(paragraphs.first()).toHaveAttribute('contenteditable', 'plaintext-only');
		await caretToEnd(paragraphs.first());
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Segundo con [enlace](/precios).');
		await page.keyboard.press('ControlOrMeta+Enter');
		// The refreshed page renders two paragraphs, each with its own range.
		await expect(paragraphs).toHaveCount(2);
		await expect(paragraphs.nth(1).locator('a')).toHaveAttribute('href', '/precios');
		const first = `${SEED.seccion_2.texto}\n\nSegundo con [enlace](/precios).`;
		expect(site.value('seccion_2', 'texto')).toBe(first);
		// The inspector shows the whole field, as the draft holds it.
		await expect(inspectorControl(page, 'texto')).toHaveValue(first);

		// The second paragraph shows its Markdown, link included, as plain text.
		await paragraphs.nth(1).dblclick();
		await expect(paragraphs.nth(1)).toHaveAttribute('contenteditable', 'plaintext-only');
		await expect(paragraphs.nth(1)).toHaveText('Segundo con [enlace](/precios).');
		await caretToEnd(paragraphs.nth(1));
		await page.keyboard.type(' **Fin**');
		await page.keyboard.press('ControlOrMeta+Enter');
		await expect(paragraphs.nth(1).locator('strong')).toHaveText('Fin');
		// Byte for byte: the first paragraph and the separator are untouched.
		expect(site.value('seccion_2', 'texto')).toBe(`${first} **Fin**`);
		await expect(paragraphs.first()).toHaveText(SEED.seccion_2.texto);
	});

	test('B: a range painted from a text that changed since is never applied; Vega says so and refreshes', async ({
		page
	}) => {
		const site = await openWithMarkdownBody(page);
		const frame = frameOf(page);
		const paragraph = frame.locator('[data-vega-block-id="seccion_2"] [data-vega-source-range]');
		await expect(paragraph).toHaveAttribute('title', 'Doble clic para editar');
		await paragraph.click();
		await expect(inspector(page)).toHaveAttribute('data-block-id', 'seccion_2');
		// The page keeps showing the old text: every refresh is held at the site.
		const release = site.holdTokens();
		// The inspector's Markdown field is its raw source (a textarea): change it there.
		await inspectorControl(page, 'texto').fill(`${SEED.seccion_2.texto} Cambiado en la ficha.`);
		await paragraph.dblclick();
		await expect(page.locator('.vega-visual-inline-state[role="alert"]')).toContainText(
			'La página aún no muestra el último texto'
		);
		await page.waitForTimeout(400);
		await expect(paragraph).not.toHaveAttribute('contenteditable');
		release();
		// Once the page shows the draft again, the paragraph opens normally.
		await expect(paragraph).toContainText('Cambiado en la ficha.');
		await paragraph.dblclick();
		await expect(paragraph).toHaveAttribute('contenteditable', 'plaintext-only');
		await page.keyboard.press('Escape');
	});
});

/** [label, initial value, caret offset, actions, expected value]. An action is `Enter`, `paste:<text>`
 *  or text typed with the keyboard. */
const LINE_BREAK_CASES: [string, string, number, string[], string][] = [
	['Enter at the start', 'abc', 0, ['Enter'], '\nabc'],
	['Enter at the start, then X', 'abc', 0, ['Enter', 'X'], '\nXabc'],
	['Enter at the start of a middle line', 'ab\ncd\nef', 3, ['Enter'], 'ab\n\ncd\nef'],
	['Enter in the middle of a line', 'abcdef', 3, ['Enter'], 'abc\ndef'],
	['Enter at the end', 'abc', 3, ['Enter'], 'abc\n'],
	['two Enters and X at the end', 'abc', 3, ['Enter', 'Enter', 'X'], 'abc\n\nX'],
	['multi-line paste', 'abc', 1, ['paste:x\r\ny\n'], 'ax\ny\nbc'],
	['empty field: Enter and X', '', 0, ['Enter', 'X'], '\nX']
];

for (const browserName of ['chromium', 'webkit'] as const) {
	test.describe(`line breaks typed in the page, ${browserName} (review of 22 Oct 2026)`, () => {
		test.skip(!astroRoot, 'Requires VEGA_ASTRO_ROOT pointing to the reviewed @vega/astro checkout');

		test('the value the draft gets is exactly what the field shows', async ({
			page: chromiumPage
		}, testInfo) => {
			// The project only runs Chromium (and `browserName` cannot be set per describe): WebKit is
			// launched here, with the project's own base URL and locale.
			const engine = browserName === 'webkit' ? await webkit.launch() : null;
			const page = engine
				? await engine.newPage({ baseURL: testInfo.project.use.baseURL, locale: 'es-ES' })
				: chromiumPage;
			try {
				if (engine) await preparePage(page);
				await lineBreakCases(page);
			} finally {
				await engine?.close();
			}
		});
	});
}

async function lineBreakCases(page: Page): Promise<void> {
	{
		{
			const site = await openEditor(page);
			const node = field(frameOf(page), 'seccion_2', 'texto');
			await node.click();
			const control = inspectorControl(page, 'texto');
			for (const [label, initial, caret, actions, expected] of LINE_BREAK_CASES) {
				await test.step(label, async () => {
					await control.fill(initial);
					// The page shows the draft before the edit starts (no refresh can land mid-edit).
					await expect.poll(() => node.evaluate((el) => el.textContent)).toBe(initial);
					await node.focus();
					await page.keyboard.press('F2');
					await expect(node).toHaveAttribute('contenteditable', 'plaintext-only');
					await node.evaluate((el, offset) => {
						const range = el.ownerDocument.createRange();
						range.setStart(el.firstChild ?? el, offset);
						range.collapse(true);
						el.ownerDocument.getSelection()!.removeAllRanges();
						el.ownerDocument.getSelection()!.addRange(range);
					}, caret);
					for (const action of actions) {
						if (action === 'Enter') await page.keyboard.press('Enter');
						else if (action.startsWith('paste:'))
							await node.evaluate((el, text) => {
								const data = new DataTransfer();
								data.setData('text/plain', text);
								el.dispatchEvent(
									new ClipboardEvent('paste', {
										clipboardData: data,
										bubbles: true,
										cancelable: true
									})
								);
							}, action.slice('paste:'.length));
						else await page.keyboard.type(action);
					}
					await expect(control).toHaveValue(expected);
					// What the field shows: one text node with exactly that, no <div> lines.
					expect(
						await node.evaluate((el) => ({
							text: el.textContent,
							blocks: el.querySelectorAll('div, p').length
						}))
					).toEqual({ text: expected, blocks: 0 });
					await page.keyboard.press('Escape');
					await expect(control).toHaveValue(initial);
				});
			}
			// Applied, the refreshed page renders the same value.
			await control.fill('uno');
			await expect.poll(() => node.evaluate((el) => el.textContent)).toBe('uno');
			await node.focus();
			await page.keyboard.press('F2');
			await expect(node).toHaveAttribute('contenteditable', 'plaintext-only');
			await page.keyboard.press('Enter');
			await page.keyboard.press('Enter');
			await page.keyboard.type('dos');
			const before = site.tokenRequests();
			await page.keyboard.press('ControlOrMeta+Enter');
			await expect(control).toHaveValue('uno\n\ndos');
			await expect.poll(() => site.tokenRequests()).toBeGreaterThan(before);
			await expect.poll(() => site.value('seccion_2', 'texto')).toBe('uno\n\ndos');
			await expect.poll(() => node.evaluate((el) => el.textContent)).toBe('uno\n\ndos');
		}
	}
}

/** Fails the first `count` downloads of the app chunk whose source contains `marker`. */
async function failChunk(page: Page, marker: string, count = 1): Promise<() => number> {
	let failed = 0;
	await page.route(/\/_app\/immutable\/(nodes|chunks)\/.*\.js$/, async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		if (body.includes(marker) && failed < count) {
			failed++;
			await route.abort('failed');
			return;
		}
		await route.fulfill({ response, body });
	});
	return () => failed;
}

test.describe('page fields in the bar and on failures (review of 22 Oct 2026)', () => {
	test.skip(!astroRoot, 'Requires VEGA_ASTRO_ROOT pointing to the reviewed @vega/astro checkout');

	test('unsaved page fields are pending in the bar, in the publish confirmation, and their save error offers Retry', async ({
		page
	}) => {
		await openEditor(page);
		const title = frameOf(page).locator('[data-vega-record-field="title"]');
		await expect(title).toHaveAttribute('tabindex', '0');
		await title.dblclick();
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await caretToEnd(title);
		await page.keyboard.type(' nueva');
		await page.keyboard.press('Enter');
		await expect(page.locator('.vega-visual-dirty')).toHaveText('Campos de la página sin guardar');
		// The pending list opens the page card.
		await page.locator('.vega-visual-pending summary').click();
		await page.getByRole('button', { name: 'Abrir los campos de la página' }).click();
		await expect(page.locator('.vega-page-fields')).toBeVisible();
		// Publishing asks first, naming the page fields.
		const group = page.getByRole('group', { name: 'Estado de la página' });
		await group.getByRole('button', { name: 'Marcar como publicada', exact: true }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Antes de publicar', exact: true });
		await expect(confirm).toBeVisible();
		await expect(confirm).toContainText('«Campos de la página»');
		await page.keyboard.press('Escape');
		await expect(confirm).toHaveCount(0);
		// A save that fails (someone else saved the page meanwhile) is said in the bar, with Retry.
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_CONCURRENT_WRITE__?: { data: Record<string, unknown> } }
			).__VEGA_CONCURRENT_WRITE__ = { data: { title: 'Otra persona' } };
		});
		await page.locator('.vega-page-fields .vega-block-save-button').click();
		const error = page.locator('.vega-visual-savestate--err');
		await expect(error).toContainText('No se pudo guardar «Campos de la página»');
		const retry = page.locator('.vega-visual-retry', { hasText: 'Reintentar' });
		await expect(retry).toBeVisible();
		// The card says why (conflict) and resolving it there clears the bar.
		await page
			.locator('.vega-page-fields')
			.getByRole('button', { name: 'Guardar igualmente' })
			.click();
		await expect(error).toHaveCount(0);
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
	});

	test('a block text opened with F2 while the page card is visible takes the card and the save', async ({
		page
	}) => {
		await openEditor(page);
		const title = frameOf(page).locator('[data-vega-record-field="title"]');
		await expect(title).toHaveAttribute('tabindex', '0');
		await title.dblclick();
		await page.keyboard.press('Escape');
		await expect(page.locator('.vega-page-fields')).toBeVisible();
		const heading = field(frameOf(page), 'seccion_2', 'heading');
		await heading.focus();
		await page.keyboard.press('F2');
		await expect(heading).toHaveAttribute('contenteditable', 'plaintext-only');
		await expect(page.locator('.vega-page-fields')).toBeHidden();
		await expect(inspector(page)).toHaveAttribute('data-block-id', 'seccion_2');
		await caretToEnd(heading);
		await page.keyboard.type(' (F2)');
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		await expect(inspectorControl(page, 'heading')).toHaveValue(
			'Tu contenido, en tu servidor (F2)'
		);
	});

	test('while the status control downloads, its place in the bar is kept', async ({ page }) => {
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route(/\/_app\/immutable\/chunks\/.*\.js$/, async (route) => {
			const response = await route.fetch();
			const body = await response.text();
			if (body.includes('vega-visual-publish--bar')) await held;
			await route.fulfill({ response, body });
		});
		await openEditor(page);
		const slot = page.locator('.vega-visual-publish-slot');
		await expect(slot).toHaveCount(1);
		expect((await slot.boundingBox())?.height).toBe(30);
		release();
		await expect(slot).toHaveCount(0);
		await expect(
			page
				.getByRole('group', { name: 'Estado de la página' })
				.getByRole('button', { name: 'Marcar como publicada', exact: true })
		).toBeVisible();
	});

	test('if the status control cannot be downloaded, the bar says so and Reload brings it', async ({
		page
	}) => {
		const failed = await failChunk(page, 'vega-visual-publish--bar');
		await openEditor(page);
		const retry = page.getByRole('button', { name: 'No se pudo cargar el estado. Recargar' });
		await expect(retry).toBeVisible();
		expect(failed()).toBe(1);
		// The space it takes while loading is reserved; here the error took it.
		await expect(page.locator('.vega-visual-publish-slot')).toHaveCount(0);
		// The same URL would fail again from the browser's module map: reloading fetches it anew.
		await retry.click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1\/visual$/);
		await expect(
			page
				.getByRole('group', { name: 'Estado de la página' })
				.getByRole('button', { name: 'Marcar como publicada', exact: true })
		).toBeVisible();
	});

	test('if the page card cannot be downloaded, blocks stay editable and a double click on the title says why', async ({
		page
	}) => {
		const failed = await failChunk(page, 'vega-page-fields');
		await openEditor(page);
		// `editable` did not wait for the card: block texts and the title carry the hint.
		await expect(field(frameOf(page), 'seccion_2', 'heading')).toHaveAttribute(
			'title',
			'Doble clic para editar'
		);
		const title = frameOf(page).locator('[data-vega-record-field="title"]');
		await expect(title).toHaveAttribute('title', 'Doble clic para editar');
		await title.dblclick();
		await expect(page.locator('.vega-visual-inline-state[role="alert"]')).toContainText(
			'No se pudo cargar la ficha de los campos de la página'
		);
		await expect(title).not.toHaveAttribute('contenteditable');
		expect(failed()).toBe(1);
		// The blocks were not switched off with it.
		const heading = field(frameOf(page), 'seccion_2', 'heading');
		await heading.dblclick();
		await expect(heading).toHaveAttribute('contenteditable', 'plaintext-only');
		await page.keyboard.press('Escape');
		// After reloading (as the notice says), the card downloads and the title edits.
		await page.reload();
		await expect(title).toHaveAttribute('tabindex', '0');
		await title.dblclick();
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await expect(page.locator('.vega-page-fields')).toBeVisible();
		await page.keyboard.press('Escape');
	});
});

test.describe('v1 site compatibility', () => {
	test('a v1 site never receives inline editing, even if it asks', async ({ page }) => {
		const site = createVisualSite({
			collection: 'paginas',
			id: 'pagina_1',
			blocks: [
				{ id: 'seccion_1', type: 'portada', text: SEED.seccion_1.heading },
				{ id: 'seccion_2', type: 'texto', text: SEED.seccion_2.heading }
			]
		});
		await site.install(page);
		// Records, in every frame, what the site receives from Vega.
		await page.addInitScript(() => {
			const log: unknown[] = [];
			(window as unknown as { __received: unknown[] }).__received = log;
			window.addEventListener('message', (event) => log.push(event.data));
		});
		await page.addInitScript((url) => {
			(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = url;
		}, site.previewApiUrl);
		await loginAsDemo(page, { seedShowcase: true });
		await page.goto('/c/paginas/pagina_1/visual');
		const frame = frameOf(page);
		const block = frame.locator('[data-vega-block-id="seccion_2"]').first();
		await expect(block).toBeVisible();
		await block.dblclick();
		await expect(inspector(page)).toHaveAttribute('data-block-id', 'seccion_2');
		// A confused v1 site asking for an edit under the v1 envelope is refused.
		await block.evaluate((node, cms) => {
			window.parent.postMessage(
				{
					vega: 'vega-visual-1',
					type: 'select',
					blockId: 'seccion_2',
					field: 'heading',
					intent: 'edit'
				},
				cms
			);
			void node;
		}, CMS);
		await page.waitForTimeout(500);
		const received = (await block.evaluate(
			() => (window as unknown as { __received: Record<string, unknown>[] }).__received
		)) as Record<string, unknown>[];
		expect(received.some((message) => message?.type === 'hello')).toBe(true);
		expect(received.filter((message) => message?.type === 'editField')).toEqual([]);
		expect(received.filter((message) => message?.vega === 'vega-visual-2')).toEqual([]);
		expect(await frame.locator('[contenteditable]').count()).toBe(0);
		await expect(page.locator('.vega-visual-inline-hint')).toHaveCount(0);
	});
});
