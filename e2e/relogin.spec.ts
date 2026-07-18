/**
 * Suite B.10 parcial (§7 del contrato P3, §3.1.3/§3.1.4, D-P3.2-a): overlay de re-login NO
 * DESTRUCTIVO por expiración de sesión. Forzado con `window.__VEGA_FORCE_EXPIRE__` (gancho de
 * e2e confinado al adaptador `memory`, ver `src/lib/session/backend.ts`), que simula EXACTAMENTE
 * lo que hace `memory` cuando el TTL real de una sesión expira: notifica `onAuthChange('expired')`
 * y hace fallar la siguiente `list`/`listContentTypes` con `VegaError.authExpired()`.
 *
 * El disparador real dentro del alcance de esta fase (sin tocar `/settings`/`/c/[type]*`, fuera
 * de alcance de 2c) es re-clicar el item de nav singleton ya activo: `NavItem.svelte` llama a
 * `ctx.nav.toSingleton()` sin comprobar si la ruta ya es esa, así que dispara un `port.list()`
 * real de vuelta.
 *
 * `/c/site_info/new` es ruta real desde la Fase 3a (ver cabecera de `feedback.spec.ts`): llegar
 * ahí es una transición SPA. Cada test sigue esperando a que el shell esté visible ANTES de
 * inyectar el flag forzado, por higiene frente a cualquier navegación en vuelo.
 */
import { expect, loginAsDemo, test } from './fixtures';

/** Ver `feedback.spec.ts`: mismo motivo para tipar aquí en vez de importar `src/app.d.ts`. */
interface VegaTestWindow extends Window {
	__VEGA_FORCE_EXPIRE__?: boolean;
}

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await expect(page.getByRole('link', { name: 'Información del sitio' })).toBeVisible();
}

async function forceExpireOnNextOperation(page: import('@playwright/test').Page): Promise<void> {
	await page.evaluate(() => {
		(window as unknown as VegaTestWindow).__VEGA_FORCE_EXPIRE__ = true;
	});
}

test('la sesión caducada muestra el overlay de re-login SOBRE la vista actual, sin navegar a /login', async ({
	page
}) => {
	await loginAndSettle(page);

	await forceExpireOnNextOperation(page);
	// Re-clic en el item singleton ya activo: dispara `nav.toSingleton()` -> `port.list()`, que el
	// gancho forzado hace fallar con `auth-expired` (ver cabecera).
	await page.getByRole('link', { name: 'Información del sitio' }).click();

	const dialog = page.getByRole('dialog', { name: 'Tu sesión ha caducado' });
	await expect(dialog).toBeVisible();

	// La ruta NO cambió a /login: el overlay TAPA, no reemplaza (P3-L5).
	await expect(page).toHaveURL(/\/c\/site_info\/new$/);
	// El shell de debajo sigue en el DOM (no se desmontó), solo queda inerte.
	await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeAttached();
});

test('el foco queda atrapado en el overlay y Esc NO lo cierra', async ({ page }) => {
	await loginAndSettle(page);

	await forceExpireOnNextOperation(page);
	await page.getByRole('link', { name: 'Información del sitio' }).click();

	const dialog = page.getByRole('dialog', { name: 'Tu sesión ha caducado' });
	await expect(dialog).toBeVisible();

	// Al abrirse, el foco se mueve al primer campo (§4.3).
	const emailField = page.getByLabel('Correo electrónico');
	await expect(emailField).toBeFocused();

	// Esc NO cierra el diálogo (a diferencia del overlay de sidebar, 2b): es obligatorio.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();

	// Foco atrapado: Tab desde el último elemento (el botón "Reautenticar") envuelve al primero.
	await page.getByLabel('Contraseña').fill('lo-que-sea');
	await page.getByRole('button', { name: 'Reautenticar' }).focus();
	await page.keyboard.press('Tab');
	await expect(emailField).toBeFocused();
});

test('reautenticar con éxito descarta el overlay y conserva la vista', async ({ page }) => {
	await loginAndSettle(page);

	await forceExpireOnNextOperation(page);
	await page.getByRole('link', { name: 'Información del sitio' }).click();

	const dialog = page.getByRole('dialog', { name: 'Tu sesión ha caducado' });
	await expect(dialog).toBeVisible();

	await page.getByLabel('Correo electrónico').fill('demo@vega.dev');
	await page.getByLabel('Contraseña').fill('vega-demo');
	await page.getByRole('button', { name: 'Reautenticar' }).click();

	await expect(dialog).not.toBeVisible();
	// Sigue en la misma vista, sin haber pasado por /login.
	await expect(page).toHaveURL(/\/c\/site_info\/new$/);
	await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
});

test('credenciales incorrectas en el overlay muestran el mismo mensaje neutro que /login', async ({
	page
}) => {
	await loginAndSettle(page);

	await forceExpireOnNextOperation(page);
	await page.getByRole('link', { name: 'Información del sitio' }).click();

	const dialog = page.getByRole('dialog', { name: 'Tu sesión ha caducado' });
	await expect(dialog).toBeVisible();

	await page.getByLabel('Correo electrónico').fill('demo@vega.dev');
	await page.getByLabel('Contraseña').fill('password-incorrecta');
	await page.getByRole('button', { name: 'Reautenticar' }).click();

	await expect(dialog.getByRole('alert')).toHaveText('Credenciales no válidas.');
	// El overlay sigue abierto: no se pierde nada, el usuario puede reintentar.
	await expect(dialog).toBeVisible();
});
