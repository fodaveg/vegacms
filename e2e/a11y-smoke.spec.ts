/**
 * Suite B.16 (§7 del contrato P3, §4.3): humo de a11y del chrome — foco visible, `aria-current`
 * en el item activo, navegación por teclado de la sidebar, y el overlay móvil con foco atrapado.
 */
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
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					)
			);
			await page.keyboard.press('Home');
			for (let i = 0; i < bounds[0]; i++) await page.keyboard.press('ArrowRight');
			for (let i = 0; i < Math.abs(bounds[1] - bounds[0]); i++)
				await page.keyboard.press(bounds[1] > bounds[0] ? 'Shift+ArrowRight' : 'Shift+ArrowLeft');
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
