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
	 *
	 * **R6 del rediseño C2 — REVERTIDO (decisión de David, 2026-07-19)**: el mockup «cabina»
	 * proponía un MARCO exterior (tarjeta flotante redondeada, con borde/sombra, `max-width` y aire
	 * perimetral) envolviendo toda la app. David lo descartó tras la primera integración: la app va
	 * FULL-BLEED a pantalla completa en TODOS los tamaños. `.vega-shell` (raíz) apila Topbar + body
	 * y ocupa el viewport entero; no hay tarjeta intermedia. (Los marcos INTERNOS del contenido —
	 * la tarjeta del listado `.vega-list-card` (R4) y las fichas del editor `.vega-fsection` (R7) —
	 * se conservan: el descarte es solo del marco EXTERIOR.)
	 *
	 * INVARIANTE (bug ya arreglado, NO regresionar): `.vega-shell` usa `height: 100dvh` (fallback
	 * `100vh`), NUNCA `min-height` — ver el comentario de esa regla. Como columna `flex`, la Topbar
	 * toma su altura intrínseca y `.vega-body` (`flex: 1`, `min-height: 0`) el resto, así que el
	 * scroll sigue siendo INTERNO (`.vega-main`/`Sidebar`), nunca del documento.
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
		/* Lienzo de fondo: queda cubierto por Topbar + sidebar + `.vega-main`, pero se pinta por
		   si alguna sub-región no llenara del todo (inocuo). R6 (marco «cabina») REVERTIDO: ya no
		   hay tarjeta flotante ni aire perimetral — la app ocupa el viewport entero. */
		background: var(--bg);
		/* Altura ACOTADA al viewport (no `min-height`): así `.vega-body` y sus hijos quedan
		   confinados a la ventana y el scroll ocurre DENTRO de `.vega-main` (que ya tiene
		   `overflow-y: auto`) y de la sidebar (`overflow-y: auto`) por separado — la topbar
		   queda fija y el bloque `margin-top: auto` de la sidebar (Medios/Ajustes) siempre cae
		   dentro de la ventana. Con `min-height` un listado alto estiraba el documento entero,
		   la sidebar crecía con él y el bloque inferior se iba fuera de la vista.
		   `100dvh` (con fallback `100vh`) evita el salto por la barra dinámica del navegador móvil. */
		height: 100vh;
		height: 100dvh;
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
		/* El área de contenido es el "papel" (`--paper`) sobre el que FLOTAN las tarjetas
		   (listado/ficha), con aire lateral generoso. Padding del mockup: 1.75/2/2.5rem. */
		padding: 1.75rem 2rem 2.5rem;
		background: var(--paper);
		overflow-y: auto;
	}
</style>
