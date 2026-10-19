/**
 * Suite B.16 (§7 del contrato P3, §4.3): humo de a11y del chrome — foco visible, `aria-current`
 * en el item activo, navegación por teclado de la sidebar, y el overlay móvil con foco atrapado.
 */
import type { Page } from '@playwright/test';
import { THEMES } from '../src/lib/themes/themes.generated';
import { createVisualSite } from './visual-site';
import { expect, loginAsDemo, openSiteInfoFromSidebar, test, waitForHome } from './fixtures';

test('la sidebar es navegable por teclado y el item activo lleva aria-current', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);

	// Desde la portada (lote 12) el login ya no salta al singleton: se abre con un clic, y el
	// item queda activo.
	await openSiteInfoFromSidebar(page);
	const singletonLink = page.getByRole('link', { name: 'Información del sitio' });
	await expect(singletonLink).toHaveAttribute('aria-current', 'page');

	await singletonLink.focus();
	await expect(singletonLink).toBeFocused();

	// Tab recorre los items de la sidebar en orden (§7.B.16): del singleton al primer item del
	// grupo "Contenido", y de ahí al segundo.
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Entradas' })).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Páginas' })).toBeFocused();
});

test('el elemento enfocado tiene un contorno de foco visible', async ({ page }) => {
	await loginAsDemo(page);
	await waitForHome(page);

	// Ajuste de la Fase 3a: `.focus()` programático por sí solo ya NO basta aquí. Desde que
	// `/c/site_info` es una ruta real (`c/[type]/+page.svelte`), la transición tras el login deja
	// de ser el hard reload de documento que había antes de esta fase (ver la cabecera de
	// `e2e/fixtures.ts`) — la navegación es 100% SPA, así que la modalidad de entrada del
	// navegador sigue "ratón" (heredada del click en "Entrar" de `loginAsDemo`) en vez de
	// resetearse por una recarga. Chromium entonces NO pinta `:focus-visible` para un `.focus()`
	// de script bajo esa modalidad — comportamiento correcto de la pseudo-clase, no un bug del
	// shell. Un `Tab` real de teclado (como haría un usuario real) SÍ marca la modalidad como
	// teclado, igual que ya hace `la sidebar es navegable por teclado…` más arriba.
	const singletonLink = page.getByRole('link', { name: 'Información del sitio' });
	await singletonLink.focus();
	await page.keyboard.press('Tab');

	// Acotado al menú: en «Inicio» la tarjeta de pendientes «Entradas en borrador» también es un
	// enlace cuyo nombre contiene «Entradas».
	const entradas = page
		.getByRole('navigation', { name: 'Navegación principal' })
		.getByRole('link', { name: 'Entradas' });
	await expect(entradas).toBeFocused();

	const outlineStyle = await entradas.evaluate((el) => getComputedStyle(el).outlineStyle);
	expect(outlineStyle).not.toBe('none');
});

test('overlay móvil: la hamburguesa abre la sidebar con foco atrapado y Esc la cierra', async ({
	page
}) => {
	// Por debajo del punto de colapso estructural (768px, Sidebar.svelte/Topbar.svelte).
	await page.setViewportSize({ width: 375, height: 700 });
	await loginAsDemo(page);
	await waitForHome(page);

	const menuButton = page.getByRole('button', { name: 'Abrir navegación' });
	await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

	await menuButton.click();

	const sidebarNav = page.locator('#vega-sidebar');
	await expect(sidebarNav).toHaveClass(/vega-sidebar-open/);
	const closeButton = page.getByRole('button', { name: 'Cerrar', exact: true });
	// Al abrir, el foco se mueve al primer elemento navegable del panel (§4.3).
	await expect(closeButton).toBeFocused();

	// Foco atrapado: Shift+Tab desde el primer focusable (el botón cerrar) envuelve al ÚLTIMO
	// del panel (Ajustes) en vez de escapar de la sidebar.
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('link', { name: 'Ajustes' })).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(sidebarNav).not.toHaveClass(/vega-sidebar-open/);
	// El foco vuelve a quien abrió el overlay.
	await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeFocused();
});

/** Lote A: comportamiento de teclado y regiones vivas, sin atribuir un anuncio de lector real. */
for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 }
]) {
	test(`saltar al contenido es el primer Tab visible y enfoca main tras navegar (${viewport.width})`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await loginAsDemo(page);
		await waitForHome(page);
		await page.goto('/');
		await waitForHome(page);
		const skip = page.getByRole('link', { name: 'Saltar al contenido', exact: true });
		await expect(skip).not.toBeInViewport();
		await page.keyboard.press('Tab');
		await expect(skip).toBeFocused();
		await expect(skip).toBeInViewport();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('main')).toBeFocused();
		await page.keyboard.press('Tab');
		expect(await page.getByRole('main').evaluate((el) => el.contains(document.activeElement))).toBe(
			true
		);
		await page
			.getByRole('main')
			.getByRole('button', { name: 'Nuevo: Entrada', exact: true })
			.click();
		await page.waitForURL('**/c/posts/new');
		await skip.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('main')).toBeFocused();
		await expect(page.getByRole('heading', { name: 'Nuevo: Entrada', exact: true })).toBeVisible();
	});
}

test('barra richtext: una entrada Tab, flechas entre botones y selector final con teclas nativas', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);
	await page.goto('/c/posts/new');
	const field = page.locator('[data-field="content"]'),
		toolbar = field.getByRole('toolbar'),
		editor = field.getByRole('textbox');
	const bold = toolbar.getByRole('button', { name: 'Negrita', exact: true }),
		italic = toolbar.getByRole('button', { name: 'Cursiva', exact: true }),
		select = toolbar.getByRole('combobox');
	await expect(bold).toBeEnabled();
	expect(
		await toolbar
			.locator('button,select')
			.evaluateAll(
				(els) =>
					els.filter((e) => !(e as HTMLButtonElement).disabled && (e as HTMLElement).tabIndex === 0)
						.length
			)
	).toBe(1);
	await editor.fill('Texto de teclado');
	await page.keyboard.press('Shift+Tab');
	await expect(bold).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(italic).toBeFocused();
	await page.keyboard.press('Home');
	await expect(bold).toBeFocused();
	await page.keyboard.press('End');
	await expect(select).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(editor).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(bold).toBeFocused();
	// El select conserva la selección nativa, no se interpreta como navegación de herramientas.
	await page.keyboard.press('End');
	await page.keyboard.press('ArrowDown');
	await expect(select).toHaveValue('1');
	await expect(editor.locator('h1')).toHaveText('Texto de teclado');
	await select.focus();
	await page.keyboard.press('Home');
	await expect(select).toHaveValue('paragraph');
	await expect(editor.locator('p').first()).toHaveText('Texto de teclado');
	await expect(editor.locator('h1')).toHaveCount(0);
});

test('abrir y cancelar enlace e imagen con teclado conserva texto, cursor y selección', async ({
	page
}) => {
	await loginAsDemo(page, { seedMedia: true });
	await waitForHome(page);
	await page.goto('/c/posts/new');
	const field = page.locator('[data-field="content"]'),
		toolbar = field.getByRole('toolbar'),
		editor = field.locator('[contenteditable=true][role=textbox]');
	await expect(toolbar.getByRole('button', { name: 'Negrita', exact: true })).toBeEnabled();
	await editor.fill('Texto seleccionado para conservar');
	// TipTap publica su instancia en el DOM: observar update distingue selección de edición.
	await editor.evaluate((el) => {
		const instance = (el as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
		el.setAttribute('data-document-updates', '0');
		let updates = 0;
		instance.on('update', () => el.setAttribute('data-document-updates', String(++updates)));
	});
	for (const bounds of [
		[0, 5],
		[6, 6],
		[5, 0]
	]) {
		const before = await editor.innerHTML();
		for (const [tool, dialogName] of [
			['Enlace', 'Enlace'],
			['Imagen', 'Elegir de la biblioteca']
		]) {
			await editor.focus();
			// Prepara sólo el rango nativo: Home puede competir con el foco diferido de TipTap.
			// La barra recibe esa selección DOM y se recorre/activa/cancela con teclado real.
			await editor.evaluate((el, [anchor, head]) => {
				const text = el.querySelector('p')?.firstChild;
				const selection = el.ownerDocument.getSelection();
				if (!text || text.nodeType !== Node.TEXT_NODE || !selection)
					throw new Error('El texto de prueba debe estar listo para seleccionar');
				selection.setBaseAndExtent(text, anchor, text, head);
			}, bounds);
			await expect
				.poll(() =>
					page.evaluate(() => {
						const selection = getSelection();
						return [selection?.anchorOffset, selection?.focusOffset];
					})
				)
				.toEqual(bounds);
			await page.keyboard.press('Shift+Tab');
			await expect(toolbar.getByRole('button', { name: 'Negrita', exact: true })).toBeFocused();
			for (let i = 0; i < 12; i++) {
				if (
					await toolbar
						.getByRole('button', { name: tool, exact: true })
						.evaluate((el) => el === document.activeElement)
				)
					break;
				await page.keyboard.press('ArrowRight');
			}
			await expect(toolbar.getByRole('button', { name: tool, exact: true })).toBeFocused();
			await page.keyboard.press('Enter');
			await expect(page.getByRole('dialog', { name: dialogName, exact: true })).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(page.getByRole('dialog')).toHaveCount(0);
			await expect(editor).toBeFocused();
			await expect
				.poll(() => page.evaluate(() => getSelection()?.toString()))
				.toBe(bounds[0] === bounds[1] ? '' : 'Texto');
			await expect
				.poll(() =>
					page.evaluate(() => {
						const selection = getSelection();
						return [selection?.anchorOffset, selection?.focusOffset];
					})
				)
				.toEqual(bounds);
			expect(await editor.innerHTML()).toBe(before);
			await expect(editor).toHaveAttribute('data-document-updates', '0');
		}
	}
});

test('el primer Guardado actualiza la región polite preexistente sin crear un alert', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);
	const polite = page.locator('.vega-toast-region[aria-live="polite"]');
	await expect(polite).toBeAttached();
	await expect(polite).toHaveText('');
	await page.goto('/c/posts/new');
	await page
		.getByRole('textbox', { name: 'Título', exact: true })
		.fill('Primer aviso con región preparada');
	// La carga dura anterior monta la región de esta nueva página antes de emitir el aviso.
	const mounted = await polite.elementHandle();
	expect(mounted).not.toBeNull();
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(polite).toContainText('Guardado.');
	expect(await mounted!.evaluate((el) => el.isConnected)).toBe(true);
	await expect(polite).not.toHaveAttribute('role', 'alert');
	await expect(page.locator('.vega-toast-region[role="alert"]')).toHaveCount(0);
	await mounted?.dispose();
});

type ContrastCase = {
	selector: string;
	kind: 'text' | 'placeholder' | 'border' | 'outline' | 'icon';
	state: string;
};

/** Lee la cascada del consumidor y compone transparencias en sRGB; los fondos arbitrarios no se inventan. */
async function contrastMatrix(page: Page, cases: ContrastCase[]) {
	const rows = await page.evaluate(
		({ themes, cases }) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d', { willReadFrequently: true })!;
			function rgba(css: string): number[] {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = css;
				context.fillRect(0, 0, 1, 1);
				return [...context.getImageData(0, 0, 1, 1).data].map((v, i) => (i === 3 ? v / 255 : v));
			}
			function over(front: number[], back: number[]): number[] {
				const alpha = front[3] + back[3] * (1 - front[3]);
				return [
					...front
						.slice(0, 3)
						.map((v, i) => (v * front[3] + back[i] * back[3] * (1 - front[3])) / alpha),
					alpha
				];
			}
			function background(start: Element | null): number[] {
				for (let node = start; node; node = node.parentElement) {
					if (Number(getComputedStyle(node).opacity) !== 1)
						throw new Error(`opacidad de grupo en ${node.className}`);
				}
				const layers: number[][] = [];
				for (let node = start; node; node = node.parentElement) {
					const style = getComputedStyle(node);
					if (style.backgroundImage !== 'none')
						throw new Error(`fondo con imagen/gradiente en ${node.className}`);
					if (Number(style.opacity) !== 1)
						throw new Error(`opacidad de grupo en ${node.className}`);
					const color = rgba(style.backgroundColor);
					layers.push(color);
					if (color[3] === 1) break;
				}
				return layers.reverse().reduce((back, front) => over(front, back), [255, 255, 255, 1]);
			}
			function luminance(rgb: number[]) {
				const linear = rgb.slice(0, 3).map((value) => {
					const c = value / 255;
					return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			}
			function ratio(a: number[], b: number[]) {
				const x = luminance(a),
					y = luminance(b);
				return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
			}
			const before = { ...document.documentElement.dataset };
			const settle = document.createElement('style');
			settle.textContent =
				'*,*::before,*::after{transition:none!important;animation:none!important}';
			document.head.append(settle);
			const rows = [];
			for (const theme of themes)
				for (const mode of ['light', 'dark'])
					for (const density of ['comfortable', 'compact']) {
						Object.assign(document.documentElement.dataset, {
							theme,
							mode,
							density
						});
						for (const sample of cases) {
							const base = {
								route: location.pathname,
								...sample,
								theme,
								mode,
								density,
								threshold: ['text', 'placeholder'].includes(sample.kind) ? 4.5 : 3
							};
							try {
								const el = [...document.querySelectorAll<HTMLElement>(sample.selector)].find(
									(node) =>
										node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'
								);
								if (!el) throw new Error('consumidor no visible');
								el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
								const style = getComputedStyle(el);
								const pseudo =
									sample.kind === 'placeholder' ? getComputedStyle(el, '::placeholder') : style;
								if (
									sample.kind === 'placeholder' &&
									(!el.matches(':placeholder-shown') || !el.getAttribute('placeholder')?.trim())
								)
									throw new Error('placeholder no visible');
								if (Number(style.opacity) !== 1 || Number(pseudo.opacity) !== 1)
									throw new Error('opacidad efectiva distinta de 1');
								const own =
										sample.kind === 'outline' && parseFloat(style.outlineOffset) >= 0
											? background(el.parentElement)
											: background(el),
									outer = ['outline', 'border'].includes(sample.kind)
										? background(el.parentElement)
										: own;
								let foreground = rgba(pseudo.color),
									backgrounds = [own];
								let clipped = false;
								if (sample.kind === 'border') {
									const edge = ['Top', 'Right', 'Bottom', 'Left'].find(
										(edge) =>
											parseFloat(style.getPropertyValue(`border-${edge.toLowerCase()}-width`)) >=
												1 && style.getPropertyValue(`border-${edge.toLowerCase()}-style`) !== 'none'
									);
									if (!edge) throw new Error('borde ausente');
									foreground = rgba(style.getPropertyValue(`border-${edge.toLowerCase()}-color`));
									backgrounds = [own, outer];
								}
								if (sample.kind === 'outline') {
									if (parseFloat(style.outlineWidth) < 2 || style.outlineStyle === 'none')
										throw new Error('foco de 2px ausente');
									foreground = rgba(style.outlineColor);
									backgrounds = [parseFloat(style.outlineOffset) < 0 ? own : outer];
									const rect = el.getBoundingClientRect(),
										gap = Math.max(
											0,
											parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
										);
									for (
										let ancestor = el.parentElement;
										ancestor;
										ancestor = ancestor.parentElement
									) {
										const a = ancestor.getBoundingClientRect(),
											css = getComputedStyle(ancestor);
										if (
											/(hidden|clip|auto|scroll)/.test(css.overflowX) &&
											(rect.left - gap < a.left - 0.5 || rect.right + gap > a.right + 0.5)
										)
											clipped = true;
										if (
											/(hidden|clip|auto|scroll)/.test(css.overflowY) &&
											(rect.top - gap < a.top - 0.5 || rect.bottom + gap > a.bottom + 0.5)
										)
											clipped = true;
									}
								}
								const ratios = backgrounds.map((bg) => ratio(over(foreground, bg), bg));
								rows.push({
									...base,
									foreground,
									backgrounds,
									ratios,
									ratio: Math.min(...ratios),
									clipped,
									outlineWidth: style.outlineWidth,
									outlineOffset: style.outlineOffset,
									unresolved: null
								});
							} catch (error) {
								rows.push({ ...base, ratio: null, unresolved: String(error) });
							}
						}
					}
			Object.assign(document.documentElement.dataset, before);
			settle.remove();
			return rows;
		},
		{ themes: THEMES.map((theme) => theme.id), cases }
	);
	// El halo del lienzo es un gradiente real: muestreamos el raster contiguo, no sus tokens.
	const original = await page.evaluate(() => {
		const style = document.createElement('style');
		style.id = 'vega-contrast-raster-settle';
		style.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
		document.head.append(style);
		return { ...document.documentElement.dataset };
	});
	for (const row of rows.filter((row) => row.unresolved?.includes('imagen/gradiente'))) {
		await page.evaluate(
			({ theme, mode, density }) =>
				Object.assign(document.documentElement.dataset, { theme, mode, density }),
			row
		);
		const control = page.locator(row.selector).first();
		await control.scrollIntoViewIfNeeded();
		const paint = await control.evaluate((el, kind) => {
			const css = getComputedStyle(el),
				rect = el.getBoundingClientRect();
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d')!;
			context.fillStyle = kind === 'outline' ? css.outlineColor : css.borderTopColor;
			context.fillRect(0, 0, 1, 1);
			const foreground = [...context.getImageData(0, 0, 1, 1).data];
			foreground[3] /= 255;
			if (foreground[3] !== 1) throw new Error('el caso raster requiere tinta opaca');
			let clipped = false;
			if (kind === 'outline') {
				if (parseFloat(css.outlineWidth) < 2 || css.outlineStyle === 'none')
					throw new Error('foco ausente en caso raster');
				const gap = Math.max(0, parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset));
				for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
					const a = ancestor.getBoundingClientRect(),
						style = getComputedStyle(ancestor);
					if (
						/(hidden|clip|auto|scroll)/.test(style.overflowX) &&
						(rect.left - gap < a.left - 0.5 || rect.right + gap > a.right + 0.5)
					)
						clipped = true;
					if (
						/(hidden|clip|auto|scroll)/.test(style.overflowY) &&
						(rect.top - gap < a.top - 0.5 || rect.bottom + gap > a.bottom + 0.5)
					)
						clipped = true;
				}
			}
			return {
				foreground,
				clipped,
				points:
					kind === 'outline'
						? [
								[
									rect.left + rect.width / 2,
									rect.top - parseFloat(css.outlineOffset) - parseFloat(css.outlineWidth) - 2
								]
							]
						: [
								[rect.left + rect.width / 2, rect.top + 3],
								[rect.left + rect.width / 2, rect.top - 6]
							]
			};
		}, row.kind);
		const screenshot = await page.screenshot({ animations: 'disabled' });
		const backgrounds = await page.evaluate(
			async ({ png, points }) => {
				const image = new Image();
				image.src = `data:image/png;base64,${png}`;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d', { willReadFrequently: true })!;
				context.drawImage(image, 0, 0);
				return points.map(([x, y]) => {
					const pixel = [...context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
					pixel[3] /= 255;
					return pixel;
				});
			},
			{ png: screenshot.toString('base64'), points: paint.points }
		);
		const luminance = (rgb: number[]) =>
			rgb
				.slice(0, 3)
				.map((v) => {
					const c = v / 255;
					return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
				})
				.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
		const ratios = backgrounds.map((background) => {
			const a = luminance(paint.foreground),
				b = luminance(background);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		});
		Object.assign(row, {
			foreground: paint.foreground,
			clipped: paint.clipped,
			backgrounds,
			ratios,
			ratio: Math.min(...ratios),
			unresolved: null,
			rasterized: true,
			points: paint.points
		});
	}
	await page.evaluate(
		(dataset) => Object.assign(document.documentElement.dataset, dataset),
		original
	);
	return rows;
}

/** Matriz del DOM sobre las 42 combinaciones, ambas densidades y estados con teclado real. */
test('UX12: foco, placeholders, campos, iconos y texto activo conservan contraste en contexto', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const rows: Awaited<ReturnType<typeof contrastMatrix>> = [];
	const measure = async (cases: ContrastCase[]) =>
		rows.push(...(await contrastMatrix(page, cases)));
	async function tabTo(selector: string) {
		const control = page.locator(selector).first();
		await control.focus();
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab');
		await expect(control).toBeFocused();
	}

	await page.goto('/login');
	await tabTo('#login-email');
	await measure([
		{ selector: '#login-email', kind: 'border', state: 'habilitado' },
		{ selector: '#login-email', kind: 'outline', state: 'Tab' }
	]);
	await loginAsDemo(page, { seedMedia: true });
	await waitForHome(page);
	await tabTo('.vega-search input');
	await measure([
		{
			selector: '.vega-search input',
			kind: 'placeholder',
			state: 'vacío habilitado'
		},
		{ selector: '.vega-search', kind: 'border', state: 'habilitado' },
		{ selector: '.vega-search', kind: 'outline', state: 'Tab en input' },
		{ selector: '.vega-search > svg', kind: 'icon', state: 'habilitado' }
	]);
	await page.locator('.vega-search input').fill('Vega');
	await expect(page.locator('.vega-search-hit').first()).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await measure([
		{
			selector: '.vega-search-hit[aria-selected=true]',
			kind: 'text',
			state: 'ArrowDown seleccionado'
		},
		{
			selector: '.vega-search-hit[aria-selected=true] .vega-search-hit-status',
			kind: 'text',
			state: 'metadatos seleccionados'
		}
	]);
	await page.keyboard.press('Escape');

	await page
		.getByRole('navigation', { name: 'Navegación principal' })
		.getByRole('link', { name: 'Entradas' })
		.click();
	await tabTo('.vega-list-search input');
	await measure([
		{
			selector: '.vega-list-search input',
			kind: 'placeholder',
			state: 'vacío habilitado'
		},
		{ selector: '.vega-list-search', kind: 'border', state: 'habilitado' },
		{ selector: '.vega-list-search', kind: 'outline', state: 'Tab en input' },
		{ selector: '.vega-list-search > svg', kind: 'icon', state: 'habilitado' }
	]);

	// Fixture mediante el editor admitido por el producto, con placeholders realmente visibles.
	await page.locator('a[href="/settings"]').first().click();
	const manifestEditor = page.getByRole('textbox', {
		name: 'JSON del manifiesto'
	});
	const manifest = JSON.parse(await manifestEditor.inputValue());
	manifest.collections.posts.editorRail = true;
	for (const field of ['title', 'website', 'contactEmail', 'body', 'summary']) {
		manifest.collections.posts.fields[field] = {
			...manifest.collections.posts.fields[field],
			placeholder: `Ejemplo de ${field}`
		};
	}
	await manifestEditor.fill(JSON.stringify(manifest, null, 2));
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Guardado.');
	await page
		.getByRole('navigation', { name: 'Navegación principal' })
		.getByRole('link', { name: 'Entradas' })
		.click();
	await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
	await page.locator('.vega-rail a').first().hover();
	await measure([
		{ selector: '.vega-rail a:hover .vega-rail-meta', kind: 'text', state: 'hover active' }
	]);
	await page.locator('a[href="/c/posts"]').first().click();
	await page.locator('.vega-list-new-button').click();
	await expect(page.locator('.vega-widget-richtext .tiptap')).toBeVisible();
	await page.locator('.vega-widget-text').evaluate((el) => el.blur());
	await measure([
		...['Text', 'Email', 'Url', 'Datetime', 'Textarea', 'Select'].map((widget) => ({
			selector: `.vega-widget-${widget.toLowerCase()}`,
			kind: 'border' as const,
			state: 'habilitado'
		})),
		{
			selector: '.vega-markdown-workbench',
			kind: 'border',
			state: 'habilitado'
		},
		{ selector: '.vega-widget-richtext', kind: 'border', state: 'habilitado' },
		...['title', 'website', 'contactEmail', 'body', 'summary'].map((field) => ({
			selector: `[data-field=${field}] :is(input,textarea)`,
			kind: 'placeholder' as const,
			state: 'vacío habilitado'
		}))
	]);
	await tabTo('.vega-widget-text');
	await measure([{ selector: '.vega-widget-text', kind: 'outline', state: 'Tab' }]);
	await tabTo('.vega-widget-richtext .tiptap');
	await measure([
		{
			selector: '.vega-widget-richtext',
			kind: 'outline',
			state: 'Tab en contenteditable'
		}
	]);

	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	await expect(page.locator('[data-media-item]')).toHaveCount(3);
	await tabTo('.vega-media-search input');
	await measure([
		{
			selector: '.vega-media-search input',
			kind: 'placeholder',
			state: 'vacío habilitado'
		},
		{ selector: '.vega-media-search', kind: 'border', state: 'habilitado' },
		{ selector: '.vega-media-search', kind: 'outline', state: 'Tab en input' },
		{ selector: '.vega-media-search > svg', kind: 'icon', state: 'habilitado' },
		{
			selector: '.vega-media-type-chip[aria-pressed=true]',
			kind: 'text',
			state: 'filtro seleccionado'
		}
	]);
	await page.locator('[data-media-item=media_2]').click();
	await tabTo('.vega-media-detail-field input[type=text]');
	await measure([
		{
			selector: '.vega-media-detail-field input[type=text]',
			kind: 'border',
			state: 'habilitado'
		},
		{
			selector: '.vega-media-detail-field input[type=text]',
			kind: 'outline',
			state: 'Tab'
		},
		{
			selector: '.vega-media-tag button',
			kind: 'icon',
			state: 'quitar etiqueta habilitado'
		}
	]);
	await page.locator('.vega-media-detail-dialog').evaluate((root) => {
		const grand = document.createElement('div');
		grand.id = 'contrast-opacity-probe';
		grand.style.opacity = '0.5';
		const wrapper = document.createElement('div');
		wrapper.style.background = 'white';
		const input = document.createElement('input');
		input.id = 'contrast-opacity-input';
		input.value = 'Prueba';
		input.style.background = 'white';
		wrapper.append(input);
		grand.append(wrapper);
		root.append(grand);
	});
	const negative = await contrastMatrix(page, [
		{ selector: '#contrast-opacity-input', kind: 'text', state: 'negativo abuelo opacity .5' }
	]);
	expect(negative.every((row) => row.unresolved?.includes('opacidad de grupo'))).toBe(true);
	await page.locator('#contrast-opacity-probe').evaluate((el) => el.remove());
	await testInfo.attach('contrast-instrument-negative.json', {
		body: JSON.stringify(negative, null, 2),
		contentType: 'application/json'
	});
	await testInfo.attach('contrast-dom-21x2x2.json', {
		body: JSON.stringify(rows, null, 2),
		contentType: 'application/json'
	});
	await page.screenshot({
		path: testInfo.outputPath('contrast-media-light.png')
	});
	await page.evaluate(() => (document.documentElement.dataset.mode = 'dark'));
	await page.screenshot({
		path: testInfo.outputPath('contrast-media-dark.png')
	});
	const failures = rows.filter(
		(row) => row.unresolved || row.ratio! < row.threshold || ('clipped' in row && row.clipped)
	);
	expect(failures).toEqual([]);
});

test('UX12: árbol, inspector y overlay miden los 21 temas en ambos modos y densidades', async ({
	page
}, testInfo) => {
	const site = createVisualSite({
		collection: 'paginas',
		id: 'pagina_1',
		blocks: [
			{
				id: 'seccion_1',
				type: 'seccion',
				text: 'Escribe. Publica. Olvídate del resto.'
			},
			{
				id: 'seccion_2',
				type: 'seccion',
				text: 'Tu contenido, en tu servidor'
			},
			{ id: 'seccion_3', type: 'seccion', text: 'Se adapta a tu modelo' }
		]
	});
	await site.install(page);
	await page.addInitScript((url) => {
		(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = url;
	}, site.previewApiUrl);
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto('/c/paginas/pagina_1/visual');
	await expect(page.locator('.vega-visual-status-text')).toContainText('Conectado');
	const structure = page.getByRole('button', { name: 'Estructura', exact: true });
	await expect(structure).toHaveAttribute('aria-expanded', 'false');
	// El lienzo abre el inspector; «Estructura» carga el árbol sin cambiar esa selección.
	await page
		.frameLocator('iframe.vega-visual-frame')
		.locator('[data-vega-block-id=seccion_1]')
		.click();
	await expect(
		page.locator('.vega-inspector-body:not([hidden]) .vega-widget-text').first()
	).toBeVisible();
	await structure.click();
	await expect(structure).toHaveAttribute('aria-expanded', 'true');
	await expect(page.locator('.vega-tree-row')).toHaveCount(3);
	await expect(
		page.locator('.vega-visual-overlay-toolbar-btn:not(:disabled)').first()
	).toBeVisible();
	const selected = page.locator('.vega-tree-row--selected');
	await selected.focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(selected).toBeFocused();
	const rows = await contrastMatrix(page, [
		{
			selector: '.vega-tree-row--selected',
			kind: 'text',
			state: 'seleccionado accent-soft'
		},
		{
			selector: '.vega-tree-row--selected',
			kind: 'outline',
			state: 'Tab seleccionado'
		},
		{
			selector: '.vega-tree-action:not(:disabled)',
			kind: 'icon',
			state: 'habilitado'
		},
		{
			selector: '.vega-inspector-body:not([hidden]) .vega-widget-text',
			kind: 'border',
			state: 'inspector habilitado'
		},
		{
			selector: '.vega-visual-overlay-toolbar-btn:not(:disabled)',
			kind: 'icon',
			state: 'overlay sobre fondo opaco'
		}
	]);
	await page.locator('.vega-tree-row').nth(1).hover();
	rows.push(
		...(await contrastMatrix(page, [
			{ selector: '.vega-tree-row:hover', kind: 'text', state: 'hover active' }
		]))
	);
	await testInfo.attach('contrast-visual-21x2x2.json', {
		body: JSON.stringify(rows, null, 2),
		contentType: 'application/json'
	});
	expect(
		rows.filter(
			(row) => row.unresolved || row.ratio! < row.threshold || ('clipped' in row && row.clipped)
		)
	).toEqual([]);
});

/** La barra pertenece a Vega aunque el bloque del sitio sea más estrecho que sus acciones. */
test.describe('UX12: toolbar táctil sobre bloque estrecho', () => {
	test.use({ hasTouch: true });
	test('conserva objetivos44 y foco en bloques estrechos y extremos a zoom50/75/100', async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width: 901, height: 900 });
		const site = createVisualSite({
			collection: 'paginas',
			id: 'pagina_1',
			blocks: [
				{ id: 'seccion_1', type: 'seccion', text: 'Bloque estrecho' },
				{ id: 'seccion_2', type: 'seccion', text: 'Segundo bloque' },
				{ id: 'seccion_3', type: 'seccion', text: 'Tercer bloque' }
			]
		});
		await site.install(page);
		await page.addInitScript((url) => {
			(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = url;
		}, site.previewApiUrl);
		await loginAsDemo(page, { seedShowcase: true });
		await page.goto('/c/paginas/pagina_1/visual');
		await expect(page.locator('.vega-visual-status-text')).toContainText('Conectado');
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		const frame = page
			.frames()
			.find((frame) => frame.url().includes('vega-visual-site.example/preview'))!;
		await frame.evaluate(() => {
			document.body.style.padding = '0';
			const block = document.querySelector<HTMLElement>('[data-vega-block-id]')!;
			block.style.cssText = 'width:100px;min-height:280px;box-sizing:border-box;margin:0';
			window.dispatchEvent(new Event('resize'));
		});
		await frame.locator('[data-vega-block-id=seccion_1]').click();
		const reports = [];
		for (const width of [1440, 901]) {
			await page.setViewportSize({ width, height: 900 });
			// A 901px el árbol se cierra sobre el lienzo; medir durante esa transición daría hits del árbol.
			await page.locator('.vega-tree-panel').evaluate(async (el) => {
				await Promise.all(el.getAnimations().map((animation) => animation.finished));
			});
			await expect(page.locator('[data-vega-tree-row=seccion_1]')).toHaveAttribute(
				'aria-current',
				'true'
			);
			for (const zoom of ['50', '75', '100']) {
				await page.locator('.vega-visual-zoom-select').selectOption(zoom);
				const boundaryHeight = await page
					.locator('.vega-visual-stage')
					.evaluate((el) => parseFloat((el as HTMLElement).style.height) - 1);
				await frame.evaluate((height) => {
					const last = [...document.querySelectorAll<HTMLElement>('[data-vega-block-id]')].at(-1)!;
					last.style.boxSizing = 'border-box';
					last.style.height = `${height - last.getBoundingClientRect().top}px`;
					last.style.marginBottom = '0';
					window.dispatchEvent(new Event('resize'));
				}, boundaryHeight);
				await expect
					.poll(() =>
						page
							.locator('.vega-visual-overlay-insert')
							.last()
							.evaluate((el) =>
								parseFloat((el as HTMLElement).style.getPropertyValue('--insert-top'))
							)
					)
					.toBeCloseTo(boundaryHeight, 1);
				const toolbar = page.locator('.vega-visual-overlay-toolbar');
				await expect(toolbar).toBeVisible();
				const report = await toolbar.evaluate((el) => {
					const root = el.closest('.vega-visual-overlay-root')!.getBoundingClientRect();
					return [...el.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
						const r = button.getBoundingClientRect();
						const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
						return {
							name: button.getAttribute('aria-label'),
							disabled: button.disabled,
							width: r.width,
							height: r.height,
							clipped:
								r.left < root.left - 0.5 ||
								r.right > Math.min(root.right, innerWidth) + 0.5 ||
								r.top < root.top - 0.5 ||
								r.bottom > Math.min(root.bottom, innerHeight) + 0.5,
							hit: target === button || (target !== null && button.contains(target))
						};
					});
				});
				const ends = page.locator('.vega-visual-overlay-insert');
				for (const index of [0, (await ends.count()) - 1]) {
					const control = ends.nth(index);
					await control.focus();
					await page.keyboard.press('Tab');
					await page.keyboard.press('Shift+Tab');
					await expect(control).toBeFocused();
					const bounds = await control.evaluate((el) => {
						const r = el.getBoundingClientRect(),
							root = el.closest('.vega-visual-overlay-root')!.getBoundingClientRect(),
							css = getComputedStyle(el);
						const gap = parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset);
						const points = [
							[r.left + r.width / 2, r.top + r.height / 2],
							[r.left + r.width / 2, r.top + 2],
							[r.left + r.width / 2, r.bottom - 2]
						];
						return {
							label: el.getAttribute('aria-label'),
							width: r.width,
							height: r.height,
							top: r.top,
							bottom: r.bottom,
							rootTop: root.top,
							rootBottom: root.bottom,
							gap,
							outline: css.outlineStyle,
							hit: points.every(([x, y]) => {
								const target = document.elementFromPoint(x, y);
								return target === el || (target !== null && el.contains(target));
							})
						};
					});
					reports.push({ width, zoom, endpoint: index, bounds });
					expect(bounds.width).toBeGreaterThanOrEqual(43.99);
					expect(bounds.height).toBeGreaterThanOrEqual(43.99);
					expect(bounds.hit).toBe(true);
					expect(bounds.outline).not.toBe('none');
					expect(bounds.top - bounds.gap).toBeGreaterThanOrEqual(bounds.rootTop - 0.5);
					expect(bounds.bottom + bounds.gap).toBeLessThanOrEqual(bounds.rootBottom + 0.5);
				}
				reports.push({
					width,
					zoom,
					discovered: report.length,
					measured: report.filter((row) => !row.disabled).length,
					exclusions: report.filter((row) => row.disabled),
					controls: report
				});
			}
		}
		await testInfo.attach('overlay-narrow-touch.json', {
			body: JSON.stringify(reports, null, 2),
			contentType: 'application/json'
		});
		expect(
			reports.flatMap((state) =>
				('controls' in state ? state.controls : []).filter(
					(row) =>
						!row.disabled && (row.width < 43.99 || row.height < 43.99 || row.clipped || !row.hit)
				)
			)
		).toEqual([]);
	});
});
