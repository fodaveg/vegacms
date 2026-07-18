/**
 * Suite B.16 (§7 del contrato P3, §4.3): humo de a11y del chrome — foco visible, `aria-current`
 * en el item activo, navegación por teclado de la sidebar, y el overlay móvil con foco atrapado.
 */
import { expect, loginAsDemo, test } from './fixtures';

test('la sidebar es navegable por teclado y el item activo lleva aria-current', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	// La resolución de singleton del índice deja "Información del sitio" activo sin haber hecho
	// click en la sidebar.
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
	await page.waitForURL('**/c/site_info/new');

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

	const entradas = page.getByRole('link', { name: 'Entradas' });
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
	await page.waitForURL('**/c/site_info/new');

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
