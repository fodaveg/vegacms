/**
 * Suite B.9 (§7 del contrato P3): `restoreSession` tras recarga (token válido mantiene sesión;
 * token caducado → /login) y logout, contra el adaptador `memory` sembrado (`e2e/fixtures.ts`).
 *
 * Con la semilla enriquecida (Fase 2b), el índice ya no se queda en `/`: resuelve el singleton
 * del grupo anónimo y navega a `/c/site_info/new` (ver `login.spec.ts`). Cada test espera ese
 * destino ANTES de recargar/tocar `localStorage`/hacer logout, para no correr contra esa
 * navegación todavía en vuelo (`e2e/fixtures.ts` ya emula el fallback SPA para que no sea una
 * navegación real fuera de la app, pero sigue siendo una transición asíncrona).
 */
import { DEMO_SESSION_MARKER_KEY, expect, loginAsDemo, test } from './fixtures';

test('recarga con sesión válida mantiene autenticado', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	await page.reload();

	await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
	await expect(page).toHaveURL(/\/c\/site_info\/new$/);
});

test('recarga con el marcador de sesión caducado vuelve a /login', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

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
	await page.waitForURL('**/c/site_info/new');

	await page.getByRole('button', { name: 'Cerrar sesión' }).click();

	await expect(page).toHaveURL('/login');
	await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
