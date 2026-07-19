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
	 * **R6 del rediseño C2 — marco "cabina"** (mockup `.shell`, decisión de David: SÍ incluirlo):
	 * `.vega-shell` (raíz) pasa a ser el LIENZO `--bg` a pantalla completa; `.vega-cabin` (nuevo,
	 * envuelve Topbar+body) es la tarjeta flotante — redondeada, con borde y `--shadow-card`,
	 * centrada a `max-width: 1320px`. En escritorio `.vega-shell` reserva aire alrededor
	 * (`padding`) y centra `.vega-cabin` con `justify-content`; por debajo del punto de colapso
	 * ESTRUCTURAL (768px, mismo que `Sidebar.svelte`/`Topbar.svelte`) la cabina vuelve a
	 * FULL-BLEED (sin marco, sin max-width — mockup §responsive), igual que en móvil no hay
	 * espacio de sobra que gastar en marco.
	 *
	 * INVARIANTE (bug ya arreglado, NO regresionar): `.vega-shell` sigue usando `height: 100dvh`
	 * (fallback `100vh`), NUNCA `min-height` — ver el comentario de esa regla. Aquí solo se le
	 * añade `padding`/centrado; la altura fija en sí no se toca. `.vega-cabin` no declara su
	 * propia altura: como hijo `flex` de `.vega-shell` (fila) hereda el alto disponible por
	 * `align-items: stretch` (default), así que el scroll sigue siendo INTERNO (`.vega-main`/
	 * `Sidebar`), nunca del documento.
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
	<div class="vega-cabin">
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
</div>

<style>
	.vega-shell {
		display: flex;
		justify-content: center;
		/* `border-box`: el `padding` de escritorio (ver media query, más abajo) tiene que caber
		   DENTRO de `height: 100dvh`, no sumarse a ella — si no, la tarjeta desbordaría el
		   viewport por `2 × padding` y el invariante de abajo (scroll solo interno) se rompería
		   por la puerta de atrás. Sin reset global de `box-sizing` en el proyecto: se fija aquí. */
		box-sizing: border-box;
		/* Lienzo de la cabina (R6): el mockup pinta `--bg` detrás de la tarjeta flotante. */
		background: var(--bg);
		/* Altura ACOTADA al viewport (no `min-height`): así `.vega-cabin`/`.vega-body` y sus hijos
		   quedan confinados a la ventana y el scroll ocurre DENTRO de `.vega-main` (que ya tiene
		   `overflow-y: auto`) y de la sidebar (`overflow-y: auto`) por separado — la topbar
		   queda fija y el bloque `margin-top: auto` de la sidebar (Medios/Ajustes) siempre cae
		   dentro de la ventana. Con `min-height` un listado alto estiraba el documento entero,
		   la sidebar crecía con él y el bloque inferior se iba fuera de la vista.
		   `100dvh` (con fallback `100vh`) evita el salto por la barra dinámica del navegador móvil. */
		height: 100vh;
		height: 100dvh;
	}

	.vega-cabin {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 1320px;
		min-width: 0;
		/* Fix code-review (lote-1, 🟢): sin `border-box` el `border:1px` se suma POR FUERA de
		   `max-width` (content-box por defecto, sin reset global — mismo motivo que `.vega-shell`
		   más arriba) y la tarjeta desborda ~2px. No afecta al invariante de altura de
		   `.vega-shell` (esa regla no se toca). */
		box-sizing: border-box;
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: var(--shadow-card);
		overflow: hidden;
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
		/* Cabina C2 (mockup `vega-propuesta-C2-cabina-con-aire`): el área de contenido es el
		   "papel" (`--paper`) sobre el que FLOTAN las tarjetas (listado/ficha), con aire lateral
		   generoso — no el lienzo `--bg` a ras. Padding del mockup: 1.75/2/2.5rem. */
		padding: 1.75rem 2rem 2.5rem;
		background: var(--paper);
		overflow-y: auto;
	}

	/* Escritorio: el aire alrededor de la tarjeta flotante (R6). Mismo punto de colapso
	   ESTRUCTURAL (768px) que `Sidebar.svelte`/`Topbar.svelte`/`ConnectionStatus.svelte` (§4.2) —
	   por encima de él hay sidebar fija Y marco cabina; por debajo, ambos ceden a full-bleed. */
	@media (min-width: 769px) {
		.vega-shell {
			padding: var(--vega-space-gutter);
		}
	}

	/* Móvil: full-bleed (mockup §responsive, `.shell` a `grid-template-columns: 1fr` sin marco) —
	   sin aire perimetral que robarle a la pantalla, sin cantos redondeados/sombra que corten
	   contenido cerca del borde. */
	@media (max-width: 768px) {
		.vega-cabin {
			max-width: none;
			border: 0;
			border-radius: 0;
			box-shadow: none;
		}
	}
</style>
