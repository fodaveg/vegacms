/**
 * Fixture compartida de la suite de shell (§7.B del contrato P3): fuerza el adaptador `memory`
 * sembrado (ver `src/lib/session/backend.ts`) en TODA página de TODO test, vía
 * `page.addInitScript` (corre antes de que el bundle de la app arranque, sin recompilar). Ningún
 * test de esta suite toca un PocketBase real.
 *
 * Las credenciales replican `src/lib/session/demo-seed.ts`: Playwright corre en un runtime Node
 * aparte de Vite y no resuelve el alias `$lib`, así que se duplican aquí a propósito. Mantenlas
 * en sincronía si cambia la semilla.
 *
 * ## Fidelidad del fallback SPA en `vite preview` (status 200 vs 404)
 *
 * Desde la Fase 2b la semilla de demo trae tipos de contenido reales (§3.3 del contrato: nav
 * literal + resolución de singleton), así que el propio índice (`/+page.svelte`) navegaba solo a
 * rutas como `/c/site_info/new` que, ANTES de la Fase 3a, eran 404 intencionados (sin fichero de
 * ruta todavía). `adapter-static` está configurado con `fallback: 'index.html'`
 * (`vite.config.ts`) para que un host real reescriba cualquier ruta desconocida a la SPA (D-P3.1).
 *
 * `vite preview` (el servidor de esta suite, `playwright.config.ts`) sirve el shell de
 * `build/index.html` para rutas desconocidas — Chromium lo renderiza y la SPA arranca —, pero lo
 * hace con **status HTTP 404** en vez de 200. La intercepción de abajo reescribe ese 404→200 para
 * que el status observado coincida con el de un host bien configurado (nginx/Netlify con
 * rewrite→200). Es fidelidad, no un rescate: el comportamiento observable de la app es el mismo
 * con o sin ella (verificado empíricamente).
 *
 * **Fase 3a**: `/c/[type]`, `/c/[type]/new`, `/c/[type]/[id]` y `/media` ya son ficheros de ruta
 * reales — la intercepción queda INERTE para ellas (esas peticiones de documento llegan con
 * status 200 nativo de `vite preview`, `response.status() !== 404`, así que el `route.fulfill`
 * de más abajo nunca se alcanza). Sigue siendo necesaria para `/settings` (Fase 3b, aún sin
 * fichero de ruta) y para cualquier deep-link futuro sin ruta todavía. Efecto colateral notado:
 * como consecuencia, la transición post-login a `/c/site_info/new` (semilla de demo) pasó de ser
 * un hard reload de documento a una navegación SPA pura — ver el comentario de
 * `e2e/a11y-smoke.spec.ts` ("contorno de foco visible") para el ajuste que esto obligó.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

export const DEMO_EMAIL = 'demo@vega.dev';
export const DEMO_PASSWORD = 'vega-demo';

/** Clave de `localStorage` del marcador de sesión de demo (ver `session/backend.ts`). */
export const DEMO_SESSION_MARKER_KEY = 'vega.demoSession.v1';

const INDEX_HTML_PATH = fileURLToPath(new URL('../build/index.html', import.meta.url));

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			(window as unknown as { __VEGA_ADAPTER__?: string }).__VEGA_ADAPTER__ = 'memory';
		});

		// Ver cabecera: emula el fallback SPA de un host real para que una navegación de
		// documento a una ruta aún no implementada (Fase 3) no abandone la app.
		await page.route('**/*', async (route) => {
			const request = route.request();
			if (request.resourceType() !== 'document') {
				await route.continue();
				return;
			}
			const url = new URL(request.url());
			if (url.pathname === '/' || url.pathname === '/login') {
				await route.continue();
				return;
			}
			const response = await route.fetch();
			if (response.status() !== 404) {
				await route.fulfill({ response });
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: readFileSync(INDEX_HTML_PATH, 'utf-8')
			});
		});

		await use(page);
	}
});

export { expect };

/**
 * Login vía UI con las credenciales de demo; deja la página ya autenticada.
 *
 * `opts.seedMedia` (Fase P6·6b): fija `window.__VEGA_SEED_MEDIA__ = true` ANTES de navegar a
 * `/login` (mismo momento que el flag `__VEGA_ADAPTER__` de la fixture `page` de arriba: un
 * `addInitScript` corre antes de que el bundle arranque, así que llega a tiempo para la
 * PRIMERA construcción del `BackendPort`, `session/backend.ts`) — el adaptador `memory` arranca
 * entonces con `DEMO_SEED_WITH_MEDIA` (la colección `vega_media` YA creada, con assets) en vez
 * de `DEMO_SEED`. Ausente/`false` = comportamiento previo, usado por el resto de la suite.
 *
 * `opts.editorMode` (lote L6c): mismo mecanismo, fija `window.__VEGA_FORCE_EDITOR_CAPABILITIES__
 * = true` — el `BackendPort` resultante lleva `capabilities.schemaDiscovery`/`schemaBootstrap` en
 * `false`, simulando una sesión de rol editor (ver `withEditorCapabilities`, `session/backend.ts`)
 * sin montar un PocketBase real. Ausente/`false` = comportamiento previo (capabilities de
 * superuser).
 */
export async function loginAsDemo(
	page: import('@playwright/test').Page,
	opts?: { seedMedia?: boolean; editorMode?: boolean }
): Promise<void> {
	if (opts?.seedMedia) {
		await page.addInitScript(() => {
			(window as unknown as { __VEGA_SEED_MEDIA__?: boolean }).__VEGA_SEED_MEDIA__ = true;
		});
	}
	if (opts?.editorMode) {
		await page.addInitScript(() => {
			(
				window as unknown as { __VEGA_FORCE_EDITOR_CAPABILITIES__?: boolean }
			).__VEGA_FORCE_EDITOR_CAPABILITIES__ = true;
		});
	}
	await page.goto('/login');
	await page.getByLabel('Correo electrónico').fill(DEMO_EMAIL);
	await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
	await page.getByRole('button', { name: 'Entrar' }).click();
	await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}
