<script lang="ts">
	/**
	 * `AppShell.svelte` (§1/§3.3/§4.2 del contrato P3, Fase 2b): carcasa COMPLETA — `Topbar` +
	 * `Sidebar` + `<main>`. Cada pieza del chrome (logout, densidad, conexión, nav) lee su propio
	 * contexto (`VegaAppContext`/`SessionStore`); este componente solo orquesta el estado de "la
	 * sidebar está abierta como overlay en móvil" (`sidebarOpen`), que Topbar/Sidebar no pueden
	 * poseer cada una por su cuenta porque el hamburguesa que la abre vive en una y el panel que
	 * la muestra en la otra.
	 *
	 * Responsive (§4.2): en escritorio la sidebar es una columna fija; por debajo del punto de
	 * colapso estructural (fijado en `Sidebar.svelte`/`Topbar.svelte`) se convierte en un overlay
	 * con foco atrapado (`Sidebar.svelte`, §4.3). Cierra sola tras cualquier navegación
	 * (`afterNavigate`) para no dejar el overlay abierto tapando la vista nueva.
	 *
	 * El `id` de la raíz (`vega-app-shell`) es la costura que usa `ReloginModal.svelte` (Fase 2c,
	 * montado FUERA de este árbol, en `+layout.svelte`) para marcar TODA la carcasa `inert`
	 * mientras el overlay de re-login es obligatorio (§4.3): ese componente no es hijo de este, así
	 * que no puede recibir la bandera por prop como hace `sidebarOpen` con `<main>` más abajo.
	 */
	import { afterNavigate } from '$app/navigation';
	import Topbar from './Topbar.svelte';
	import Sidebar from './Sidebar.svelte';

	let { children } = $props();

	let sidebarOpen = $state(false);

	afterNavigate(() => {
		sidebarOpen = false;
	});
</script>

<div class="vega-shell" id="vega-app-shell">
	<Topbar {sidebarOpen} onToggleSidebar={() => (sidebarOpen = !sidebarOpen)} />

	<div class="vega-body">
		<Sidebar open={sidebarOpen} onClose={() => (sidebarOpen = false)} />

		<!-- Mientras la sidebar es overlay modal en móvil (`sidebarOpen`), el contenido de fondo se
		     marca `inert`: refuerza el trap de foco de teclado impidiendo que un lector de pantalla
		     en modo virtual navegue al `<main>` de detrás (§4.3). En escritorio `sidebarOpen` es
		     siempre falso, así que `<main>` nunca queda inerte. -->
		<main class="vega-main" inert={sidebarOpen}>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.vega-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.vega-body {
		display: flex;
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.vega-main {
		flex: 1;
		min-width: 0;
		padding: var(--vega-space-gutter);
		overflow-y: auto;
	}
</style>
