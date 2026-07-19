// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		/**
		 * Gancho de pruebas EXCLUSIVO de la demo/e2e (Fase 2c, ver `src/lib/session/backend.ts`
		 * para el mismo criterio de confinamiento): dispara un toast arbitrario desde fuera de la
		 * app, para poder testear `ToastHost.svelte` sin depender de una acción de producto real
		 * que todavía no exista en el alcance de esta fase (P4/P5 traerán disparadores reales).
		 * Solo se define cuando el adaptador es `memory` (`src/routes/+layout.svelte`, `onMount`);
		 * en modo `pocketbase` esta propiedad nunca llega a existir.
		 */
		__VEGA_TEST_TOAST__?: (
			message: string,
			opts?: { kind?: 'success' | 'error' | 'info'; timeoutMs?: number }
		) => void;
	}

	// P8·F2: versión de Vega y rango de servidor PocketBase soportado (fuente de verdad única
	// `package.json`, ver `vite.config.ts`), inyectados por el `define` de Vite en tiempo de
	// build. No los uses directamente: consume `$lib/version.ts`, que los reexporta con tipo.
	const __VEGA_VERSION__: string;
	const __VEGA_PB_SERVER_RANGE__: string;
}

export {};
