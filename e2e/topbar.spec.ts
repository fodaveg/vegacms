/**
 * Suite R1 del rediseño C2 ("cabina con aire"): wordmark con punto de acento, buscador global
 * centrado (atajo `/`, visual/sin backend todavía) y avatar con la inicial de la sesión.
 */
import { expect, loginAsDemo, openSiteInfoFromSidebar, test, waitForHome } from './fixtures';

test('el wordmark del sitio pinta el isotipo de Vega junto al nombre', async ({ page }) => {
	await loginAsDemo(page);
	await waitForHome(page);

	const site = page.locator('.vega-topbar-site');
	await expect(site).toBeVisible();
	await expect(site.locator('.vega-logo')).toBeVisible();
	// L9: el texto procede de `site.name` en el manifiesto, no de un literal del shell.
	await expect(site).toContainText('Vega Demo');
	await expect(site).toHaveAttribute('title', 'Vega Demo');
});

test('la marca de la barra es un enlace «Inicio» a la portada (lote 12, lámina 1, estado 1.7)', async ({
	page
}) => {
	await loginAsDemo(page);
	// El login ya aterriza en la portada: para ver que la marca NAVEGA, primero se sale de ella.
	await waitForHome(page);
	await openSiteInfoFromSidebar(page);

	// Acotada a la barra superior: en la portada, «Lo último que editaste» puede tener un
	// registro titulado «Inicio» (una página, por ejemplo), y su enlace casaría también.
	const brand = page
		.locator('header.vega-topbar')
		.getByRole('link', { name: 'Inicio', exact: true });
	await expect(brand).toHaveAttribute('href', /\/$/);
	await brand.click();
	await waitForHome(page);
	await expect(page).not.toHaveURL(/\/c\/site_info\/new$/);
});

test('el atajo "/" enfoca el buscador global salvo dentro de un campo editable', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);

	// Desde `#lote-shell` la caja es un `combobox` (patrón APG: tiene panel de resultados con
	// `aria-expanded`/`aria-activedescendant`), ya no un `searchbox` a secas.
	const search = page.getByRole('combobox', { name: 'Búsqueda global' });
	await expect(search).not.toBeFocused();

	await page.keyboard.press('/');
	await expect(search).toBeFocused();

	// Con el foco YA dentro de un campo editable (el propio buscador), "/" se escribe con
	// normalidad — el guard de `isEditableTarget` no le roba el carácter al campo activo.
	await page.keyboard.type('a/b');
	await expect(search).toHaveValue('a/b');
});

test('el avatar muestra la inicial de la sesión de demo', async ({ page }) => {
	await loginAsDemo(page);
	await waitForHome(page);

	// Credenciales de demo: demo@vega.dev (ver `fixtures.ts`).
	await expect(page.getByRole('img', { name: 'Sesión de demo@vega.dev' })).toHaveText('D');
});

test.describe('chip de usuario → menú "Ajustes" (#l12-ux, item 3)', () => {
	test('cerrado por defecto; un click lo abre y navega a /settings al elegir "Ajustes"', async ({
		page
	}) => {
		await loginAsDemo(page);
		await waitForHome(page);

		const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
		const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');
		await expect(menu).toBeHidden();

		await trigger.click();
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect(menu).toBeVisible();

		await page.getByRole('menuitem', { name: 'Ajustes' }).click();
		await page.waitForURL('**/settings');
		await expect(menu).toBeHidden();
	});

	test('Escape cierra el menú y devuelve el foco al chip', async ({ page }) => {
		await loginAsDemo(page);
		await waitForHome(page);

		const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
		await trigger.click();
		await expect(page.getByRole('menu', { name: 'Menú de cuenta' })).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('menu', { name: 'Menú de cuenta' })).toBeHidden();
		await expect(trigger).toBeFocused();
	});

	test('un click fuera del menú lo cierra', async ({ page }) => {
		await loginAsDemo(page);
		await waitForHome(page);

		const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
		await trigger.click();
		await expect(page.getByRole('menu', { name: 'Menú de cuenta' })).toBeVisible();

		// Un punto neutro de la barra (la pastilla de conexión no es interactiva): la marca ya es
		// un enlace a la portada y navegaría, así que no sirve de «fuera» inocuo.
		await page.locator('.vega-connection-status').click();
		await expect(page.getByRole('menu', { name: 'Menú de cuenta' })).toBeHidden();
	});

	test('tabular fuera del menú lo cierra (el foco no queda colgado)', async ({ page }) => {
		await loginAsDemo(page);
		await waitForHome(page);

		const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
		await trigger.click();
		const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
		await expect(menu).toBeVisible();

		// Tab: el foco recorre por orden las entradas del menú (Cómoda, Compacta y «Ajustes»,
		// desde el lote 12) → sigue abierto mientras el foco esté dentro.
		await page.keyboard.press('Tab');
		await expect(menu.getByRole('menuitemradio', { name: 'Cómoda' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(menu.getByRole('menuitemradio', { name: 'Compacta' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.getByRole('menuitem', { name: 'Ajustes' })).toBeFocused();
		await expect(menu).toBeVisible();

		// Tab de nuevo: el foco sale del popover → se cierra (patrón menu button).
		await page.keyboard.press('Tab');
		await expect(menu).toBeHidden();
	});

	test('"Cerrar sesión" sigue siendo su propio botón, siempre visible (no se movió al menú)', async ({
		page
	}) => {
		await loginAsDemo(page);
		await waitForHome(page);

		await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
	});
});
