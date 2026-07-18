/**
 * Infra de e2e de Vega (§7.B del contrato P3, entregable de esta fase — L7: única dependencia
 * nueva permitida, `@playwright/test` como devDependency). Corre Chromium contra la build
 * ESTÁTICA real (`vite build` + `vite preview`, no el servidor de desarrollo): es lo que P8
 * termina distribuyendo, así que es lo que vale la pena comprobar de punta a punta.
 *
 * Adaptador: NO se fija por variable de entorno de build. Cada test fuerza el adaptador `memory`
 * sembrado en runtime vía `window.__VEGA_ADAPTER__` (ver `e2e/fixtures.ts` y la cabecera de
 * `src/lib/session/backend.ts`), así la build que se sirve es la build normal, sin bifurcar CI.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		// `resolveLocale()` (§2.5) cae a `navigator.language` sin `site.locale` (login, y el
		// índice de la semilla de demo no lo fija): fija el locale del navegador a español para
		// que la suite (con aserciones en español) sea determinista sin importar el locale del
		// sistema donde corra.
		locale: 'es-ES'
	},
	webServer: {
		command: `pnpm exec vite build && pnpm exec vite preview --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
