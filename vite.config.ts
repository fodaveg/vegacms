import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// P8·F2: versión y rango de servidor PocketBase soportado, hormeados en tiempo de build desde
// `package.json` (fuente de verdad ÚNICA — nunca dupliques estos literales). Se lee con
// `readFileSync` + `JSON.parse` en vez de `import ... with { type: 'json' }` para no depender de
// import attributes en el config de Vite; `node:fs` ya es parte del entorno de Node del propio
// `vite.config.ts`.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
	version: string;
	vega: { pocketbaseServer: string };
};

export default defineConfig({
	// Expone los dos globals declarados en `src/app.d.ts` y consumidos por `src/lib/version.ts`.
	define: {
		__VEGA_VERSION__: JSON.stringify(pkg.version),
		__VEGA_PB_SERVER_RANGE__: JSON.stringify(pkg.vega.pocketbaseServer)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA estática: sin servidor, así que hace falta un fallback para las rutas que
			// el cliente resuelve tras cargar (ver src/routes/+layout.ts: ssr = false).
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.dom.{test,spec}.{js,ts}']
				}
			},
			// Proyecto `dom` (F5-g): módulos que manipulan el DOM real (`focus-target.ts`, la
			// resolución de foco de a11y) pero no montan componentes Svelte — jsdom basta, sin el
			// coste de un entorno de componente completo. Convención de nombre `*.dom.test.ts`
			// (distinta de `*.svelte.test.ts`, reservado para tests de runas/componentes) para que
			// ambos proyectos se repartan los ficheros sin solaparse.
			{
				extends: './vite.config.ts',
				test: {
					name: 'dom',
					environment: 'jsdom',
					include: ['src/**/*.dom.{test,spec}.{js,ts}']
				}
			},
			// Proyecto `component` (Fase P6·6e): el primer uso REAL de `*.svelte.test.ts` (la
			// convención ya estaba reservada, ver el comentario de `dom` arriba, pero hasta 6e
			// ningún test montaba un componente Svelte de verdad — todo era lógica pura o e2e
			// Playwright). Monta componentes con `mount()`/`unmount()` de Svelte 5 (sin librería
			// nueva: ambas ya las exporta el propio paquete `svelte`) para cubrir un caso que ni la
			// lógica pura ni Playwright pueden ejercitar (L-P6.9: el ÚNICO shell real publica
			// `ctx.mediaPicker` SIEMPRE, así que "sin picker" no tiene ninguna ruta observable en
			// e2e — solo un montaje aislado con un `VegaAppContext` de mentira lo cubre). `resolve.
			// conditions: ['browser']` es OBLIGATORIO: sin él, Vite resuelve `svelte` a su build de
			// SERVIDOR (SSR) bajo Vitest/Node, y `mount()` lanza `lifecycle_function_unavailable`
			// ("mount(...) is not available on the server") — mismo fix que usa la plantilla
			// oficial de SvelteKit+Vitest para testing de componentes.
			{
				extends: './vite.config.ts',
				resolve: { conditions: ['browser'] },
				test: {
					name: 'component',
					environment: 'jsdom',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
