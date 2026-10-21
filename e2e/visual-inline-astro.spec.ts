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
import type { CDPSession, FrameLocator, Page } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';
import { createVisualSite } from './visual-site';

const astroRoot = process.env.VEGA_ASTRO_ROOT;
const SITE = 'https://inline-astro.example';
const CMS = 'http://localhost:4173';
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
}

/** Serves the built fixture from another origin, filled with the latest draft Vega sent. */
async function installSite(page: Page): Promise<InlineSite> {
	const fixture = readFileSync(
		join(astroRoot!, 'fixtures/basic/dist/inline-preview/index.html'),
		'utf8'
	);
	const values = structuredClone(SEED);
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
			const payload = request.postDataJSON();
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
		await route.fulfill({
			contentType: 'text/html',
			headers: { 'Content-Security-Policy': `frame-ancestors ${CMS}` },
			body: fixture.replace(/__VEGA_INLINE__(\w+?)__(\w+?)__/g, (_match, block, field) =>
				escape(values[block]?.[field] ?? '')
			)
		});
	});
	await page.addInitScript((url) => {
		(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = url;
	}, `${SITE}/api/preview`);
	return { tokenRequests: () => tokens };
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
		await expect(hint).toContainText(/(?<![⌘ ])⏎\s*aplicar/);
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
