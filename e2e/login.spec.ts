/**
 * Suite B.8 (§7 del contrato P3): login ok / credenciales malas / sin red, contra el adaptador
 * `memory` sembrado (`e2e/fixtures.ts`).
 */
import { DEMO_EMAIL, DEMO_PASSWORD, expect, test } from './fixtures';

test.describe('login', () => {
	test('credenciales correctas entra y muestra el shell autenticado', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Correo electrónico').fill(DEMO_EMAIL);
		await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
		await page.getByRole('button', { name: 'Entrar' }).click();

		await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
		// Semilla de demo enriquecida (Fase 2b, §3.3): el índice resuelve al primer `NavItem` del
		// primer grupo -- aquí el singleton "Información del sitio" del grupo anónimo, sin
		// registros seed -- y navega directo a su creación.
		await page.waitForURL('**/c/site_info/new');
		await expect(page.getByRole('link', { name: 'Entradas' })).toBeVisible();
	});

	test('credenciales incorrectas muestra mensaje neutro y se queda en /login', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Correo electrónico').fill(DEMO_EMAIL);
		await page.getByLabel('Contraseña').fill('password-incorrecta');
		await page.getByRole('button', { name: 'Entrar' }).click();

		await expect(page.getByRole('alert')).toHaveText('Credenciales no válidas.');
		await expect(page).toHaveURL('/login');
	});

	test('sin red muestra un mensaje reintentable', async ({ page }) => {
		await page.goto('/login');
		// Espera a que el formulario esté visible (arranque/`restoreSession()` ya resuelto) ANTES
		// de forzar el flag: si no, hay una carrera y el flag podría alcanzar todavía al
		// `restoreSession()` de arranque, disparando la pantalla global de "sin conexión" en vez
		// del banner inline de ESTE login que el test quiere ejercitar.
		await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_NETWORK_ERROR__?: boolean }
			).__VEGA_FORCE_NETWORK_ERROR__ = true;
		});
		await page.getByLabel('Correo electrónico').fill(DEMO_EMAIL);
		await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
		await page.getByRole('button', { name: 'Entrar' }).click();

		await expect(page.getByRole('alert')).toHaveText('Sin conexión con el backend.');
		// El propio botón sigue disponible como reintento (§3.1.2: no se pierde el formulario).
		await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
	});
});

test.describe('indicador de servidor (#l12-ux, item 1)', () => {
	test('en modo demo (adaptador memory) no hay indicador: sin un PocketBase real que mostrar', async ({
		page
	}) => {
		await page.goto('/login');
		await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

		// `resolveDisplayBackendUrl()` devuelve `null` con el adaptador `memory` (ver
		// `backend.ts`/`backend.dom.test.ts`): la ausencia del indicador es el comportamiento
		// CORRECTO aquí, no un olvido — mostrar una URL en modo demo sería un dato inventado.
		await expect(page.locator('[data-testid="login-server-indicator"]')).toHaveCount(0);
	});
});

test.describe('arranque sin red (casos límite §6.7)', () => {
	test('backend caído al arrancar muestra pantalla honesta con Reintentar', async ({ page }) => {
		await page.addInitScript(() => {
			(
				window as unknown as { __VEGA_FORCE_NETWORK_ERROR__?: boolean }
			).__VEGA_FORCE_NETWORK_ERROR__ = true;
		});
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Sin conexión con el backend' })).toBeVisible();
		const retry = page.getByRole('button', { name: 'Reintentar' });
		await expect(retry).toBeVisible();

		// Reintentar con la red "recuperada" resuelve a /login (sin sesión, arranque limpio).
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_NETWORK_ERROR__?: boolean }
			).__VEGA_FORCE_NETWORK_ERROR__ = false;
		});
		await retry.click();
		await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
		await expect(page).toHaveURL('/login');
	});
});
