/**
 * Suite B.9 (§7 del contrato P3): `restoreSession` tras recarga (token válido mantiene sesión;
 * token caducado → /login) y logout, contra el adaptador `memory` sembrado (`e2e/fixtures.ts`).
 *
 * Desde la portada (lote 12) el login aterriza en `/` y pinta «Inicio» (ver `login.spec.ts`).
 * Cada test espera esa portada ANTES de recargar/tocar `localStorage`/hacer logout, para no correr
 * contra la carga de sesión y modelo todavía en vuelo.
 */
import {
	DEMO_SESSION_MARKER_KEY,
	expect,
	loginAsDemo,
	openSiteInfoFromSidebar,
	test,
	waitForHome
} from './fixtures';

test('recarga con sesión válida mantiene autenticado', async ({ page }) => {
	await loginAsDemo(page);
	await waitForHome(page);
	// Recarga en una ruta de dentro, no en la portada: así también se comprueba que la recarga
	// conserva la ruta y no devuelve a `/`.
	await openSiteInfoFromSidebar(page);

	await page.reload();

	await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
	await expect(page).toHaveURL(/\/c\/site_info\/new$/);
});

test('recarga con el marcador de sesión caducado vuelve a /login', async ({ page }) => {
	await loginAsDemo(page);
	await waitForHome(page);

	// El adaptador `memory` no persiste nada por diseño; la envoltura de demo de `backend.ts`
	// simula la caducidad manipulando su propio marcador (ver cabecera de ese módulo).
	await page.evaluate((key) => {
		localStorage.setItem(
			key,
			JSON.stringify({ expiresAt: new Date(Date.now() - 1000).toISOString() })
		);
	}, DEMO_SESSION_MARKER_KEY);

	await page.reload();

	await expect(page).toHaveURL('/login');
	await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('logout vuelve a /login', async ({ page }) => {
	await loginAsDemo(page);
	await waitForHome(page);

	await page.getByRole('button', { name: 'Cerrar sesión' }).click();

	await expect(page).toHaveURL('/login');
	await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
