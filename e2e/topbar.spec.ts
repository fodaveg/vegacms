/**
 * Suite R1 del rediseño C2 ("cabina con aire"): wordmark con punto de acento, buscador global
 * centrado (atajo `/`, visual/sin backend todavía) y avatar con la inicial de la sesión.
 */
import { expect, loginAsDemo, test } from './fixtures';

test('el wordmark del sitio pinta el punto de acento junto al nombre', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const site = page.locator('.vega-topbar-site');
	await expect(site).toBeVisible();
	await expect(site.locator('.vega-topbar-dot')).toBeVisible();
});

test('el atajo "/" enfoca el buscador global salvo dentro de un campo editable', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const search = page.getByRole('searchbox', { name: 'Búsqueda global' });
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
	await page.waitForURL('**/c/site_info/new');

	// Credenciales de demo: demo@vega.dev (ver `fixtures.ts`).
	await expect(page.getByRole('img', { name: 'Sesión de demo@vega.dev' })).toHaveText('D');
});
