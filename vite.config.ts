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
			}
		]
	}
});
