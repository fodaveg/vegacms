/**
 * Suite B (§7 del contrato P3, §2.3/§3.4, Fase 2c): toasts reales y banner global de transporte
 * a MITAD de sesión.
 *
 * `/c/site_info/new` (el destino de la resolución de singleton del índice, ver `demo-seed.ts`) es
 * ruta real desde la Fase 3a (`c/[type]/new/+page.svelte`): la navegación hasta ahí es una
 * transición SPA normal. (Antes de esa fase era un *hard reload* de documento, al no existir
 * todavía el fichero de ruta — ver `e2e/fixtures.ts`.) Cada test sigue esperando a que un elemento
 * del shell esté visible ANTES de inyectar ningún flag por `page.evaluate`, por higiene general
 * frente a cualquier navegación todavía en vuelo (ya no imprescindible para esta ruta concreta,
 * pero inofensivo y consistente con el resto de la suite).
 */
import { expect, loginAsDemo, test } from './fixtures';

/** Ganchos de demo/e2e de `src/lib/session/backend.ts` y `src/routes/+layout.svelte` — Playwright
 *  corre en un runtime Node aparte de Vite y no resuelve `src/app.d.ts`, así que se tipan aquí. */
interface VegaTestWindow extends Window {
	__VEGA_FORCE_NETWORK_ERROR__?: boolean;
	__VEGA_FORCE_EXPIRE__?: boolean;
	__VEGA_TEST_TOAST__?: (
		message: string,
		opts?: { kind?: 'success' | 'error' | 'info'; timeoutMs?: number }
	) => void;
}

/** Aterriza en `/c/site_info/new` y espera a que el shell (ya recargado) esté estable. */
async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await expect(page.getByRole('link', { name: 'Información del sitio' })).toBeVisible();
}

test.describe('toasts', () => {
	test('un toast de error persiste hasta descartarlo', async ({ page }) => {
		await loginAndSettle(page);

		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_TEST_TOAST__?.('Algo falló de verdad', {
				kind: 'error'
			});
		});

		const toast = page.getByText('Algo falló de verdad');
		await expect(toast).toBeVisible();

		// Sigue visible pasado un rato (§2.3: 'error' es persistente, sin `timeoutMs` por defecto).
		await page.waitForTimeout(1200);
		await expect(toast).toBeVisible();

		await page
			.locator('.vega-toast', { hasText: 'Algo falló de verdad' })
			.getByRole('button', { name: 'Descartar aviso' })
			.click();
		await expect(toast).toHaveCount(0);
	});

	test('un toast de éxito se autodescarta', async ({ page }) => {
		await loginAndSettle(page);

		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_TEST_TOAST__?.('Guardado', {
				kind: 'success',
				timeoutMs: 300
			});
		});

		const toast = page.getByText('Guardado');
		await expect(toast).toBeVisible();
		await expect(toast).toHaveCount(0, { timeout: 2000 });
	});
});

test.describe('banner de red a mitad de sesión', () => {
	test('un fallo de red tras el arranque muestra el banner reintentable sin desmontar el shell', async ({
		page
	}) => {
		await loginAndSettle(page);

		// Fallo de transporte a MITAD de sesión (no en arranque): re-clicar el item singleton ya
		// activo dispara `nav.toSingleton()` -> `port.list()`, que el flag forzado hace fallar.
		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_FORCE_NETWORK_ERROR__ = true;
		});
		await page.getByRole('link', { name: 'Información del sitio' }).click();

		const banner = page.getByRole('alert').filter({ hasText: 'Sin conexión con el backend' });
		await expect(banner).toBeVisible();

		// El shell sigue montado: la sidebar y el logout siguen ahí, la ruta no cambió.
		await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Entradas' })).toBeVisible();
		await expect(page).toHaveURL(/\/c\/site_info\/new$/);

		// `ConnectionStatus` refleja "sin conexión".
		await expect(page.locator('.vega-connection-status')).toHaveAttribute(
			'data-state',
			'disconnected'
		);

		// Recuperada la red, "Reintentar" limpia el banner y vuelve a "Conectado".
		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_FORCE_NETWORK_ERROR__ = false;
		});
		await banner.getByRole('button', { name: 'Reintentar' }).click();

		await expect(banner).toHaveCount(0);
		await expect(page.locator('.vega-connection-status')).toHaveAttribute(
			'data-state',
			'connected'
		);
	});

	test('regresión: un reintento que cae en auth-expired NO deja el banner ni la conexión colgados', async ({
		page
	}) => {
		// Reproduce el 🔴 de la review de 2c: si la sonda del retry (`listContentTypes`) falla con un
		// `kind` ≠ 'network' (aquí `auth-expired`), el banner NO debe pintar ese mensaje (§2.3:
		// auth-expired solo va al overlay) ni `ConnectionStatus` quedar clavado en "Reintentando…".
		await loginAndSettle(page);

		// 1) Fallo de red a mitad de sesión → banner de red + estado 'disconnected'.
		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_FORCE_NETWORK_ERROR__ = true;
		});
		await page.getByRole('link', { name: 'Información del sitio' }).click();
		const netBanner = page.getByRole('alert').filter({ hasText: 'Sin conexión con el backend' });
		await expect(netBanner).toBeVisible();

		// 2) La red "vuelve" pero la sesión ha caducado: la próxima operación (la sonda del retry)
		//    fallará con auth-expired en vez de con network.
		await page.evaluate(() => {
			const w = window as unknown as VegaTestWindow;
			w.__VEGA_FORCE_NETWORK_ERROR__ = false;
			w.__VEGA_FORCE_EXPIRE__ = true;
		});
		await netBanner.getByRole('button', { name: 'Reintentar' }).click();

		// El auth-expired se enruta SOLO al overlay de re-login…
		await expect(page.getByRole('dialog', { name: 'Tu sesión ha caducado' })).toBeVisible();
		// …el banner de transporte queda limpio (no pinta el mensaje de sesión caducada)…
		await expect(page.getByRole('alert').filter({ hasText: 'caducado' })).toHaveCount(0);
		await expect(netBanner).toHaveCount(0);
		// …y `ConnectionStatus` NO se queda atascado en 'retrying' (vuelve a 'connected').
		await expect(page.locator('.vega-connection-status')).toHaveAttribute(
			'data-state',
			'connected'
		);
	});

	test('el banner es descartable sin reintentar', async ({ page }) => {
		await loginAndSettle(page);

		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_FORCE_NETWORK_ERROR__ = true;
		});
		await page.getByRole('link', { name: 'Información del sitio' }).click();

		const banner = page.getByRole('alert').filter({ hasText: 'Sin conexión con el backend' });
		await expect(banner).toBeVisible();

		await banner.getByRole('button', { name: 'Cerrar' }).click();
		await expect(banner).toHaveCount(0);
	});
});
