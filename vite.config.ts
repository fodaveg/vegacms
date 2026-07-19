import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
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
