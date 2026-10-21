<script lang="ts">
	/**
	 * `AppShell.svelte` (§1/§3.3/§4.2 del contrato P3, Fase 2b): carcasa COMPLETA — `Topbar` +
	 * `Sidebar` + `<main>`. Cada pieza del chrome (logout, densidad, conexión, nav) lee su propio
	 * contexto (`VegaAppContext`/`SessionStore`); este componente solo orquesta el estado de "la
	 * sidebar está abierta como overlay en móvil" (`sidebarOpen`), que Topbar/Sidebar no pueden
	 * poseer cada una por su cuenta porque el hamburguesa que la abre vive en una y el panel que
	 * la muestra en la otra.
	 *
	 * **Plegado de escritorio (`sidebarCollapsed`, petición de David tras usar el editor visual en
	 * prod) — un estado DISTINTO de `sidebarOpen`, a propósito**: `sidebarOpen` es el cajón móvil
	 * (por debajo del punto de colapso estructural, §4.2); `sidebarCollapsed` es "la sidebar no
	 * ocupa ancho en escritorio", y solo tiene efecto POR ENCIMA de ese mismo punto (ver el CSS de
	 * `Sidebar.svelte`, que lo aplica dentro de su propio `@media (min-width: 769px)`) — mezclar
	 * los dos en una sola bandera habría hecho que plegar en escritorio y luego achicar la ventana
	 * dejara el cajón móvil "ya plegado", sin overlay que abrir. Mismo reparto de dueño único que
	 * `sidebarOpen`: vive aquí porque el botón que lo cambia (`Topbar.svelte`) y el panel que lo
	 * aplica (`Sidebar.svelte`) tampoco pueden compartirlo entre sí. Se inicializa leyendo la
	 * preferencia guardada (`theme/apply.ts#readSidebarCollapsed`, mismo mecanismo que la
	 * densidad — ver su cabecera) y cada toggle manual la persiste de vuelta. Al entrar al editor
	 * visual se pliega temporalmente sin escribir esa preferencia; al salir se restaura la última
	 * elección manual, incluso si se cambió durante la edición.
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
	import type { Snippet } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { readSidebarCollapsed, setSidebarCollapsed } from '$lib/theme/apply';
	import Topbar from './Topbar.svelte';
	import Sidebar from './Sidebar.svelte';
	import GlobalBanner from './GlobalBanner.svelte';
	import UpdateBanner from './UpdateBanner.svelte';

	/**
	 * `onpresence`: avisa a `+layout.svelte` de si la carcasa está montada, para que NO pinte su
	 * pila de banners fija cuando la carcasa ya lleva la suya EN EL FLUJO (ver `.vega-banner-stack`
	 * abajo). Sin carcasa (pantallas de error globales, login) sigue valiendo la pila fija.
	 */
	let { children, onpresence }: { children: Snippet; onpresence?: (present: boolean) => void } =
		$props();

	$effect(() => {
		onpresence?.(true);
		return () => onpresence?.(false);
	});

	const ctx = getVegaContext();
	let mainEl: HTMLElement | null = null;
	function skipToContent(event: MouseEvent): void {
		event.preventDefault();
		mainEl?.focus();
	}

	let sidebarOpen = $state(false);
	let manualSidebarCollapsed = readSidebarCollapsed();
	// La restauración de sesión/modelo puede montar la carcasa después de la navegación inicial:
	// esa entrada directa ya tiene ruta, aunque no llegue otro evento afterNavigate.
	let visualRoute = page.route.id === '/c/[type]/[id]/visual';
	let sidebarCollapsed = $state(visualRoute ? true : manualSidebarCollapsed);

	afterNavigate(({ to }) => {
		sidebarOpen = false;
		const nextVisualRoute = to?.route.id === '/c/[type]/[id]/visual';
		if (nextVisualRoute !== visualRoute) {
			visualRoute = nextVisualRoute;
			sidebarCollapsed = visualRoute ? true : manualSidebarCollapsed;
		}
	});

	function toggleSidebarCollapsed(): void {
		sidebarCollapsed = !sidebarCollapsed;
		manualSidebarCollapsed = sidebarCollapsed;
		setSidebarCollapsed(sidebarCollapsed);
	}

	/**
	 * Cristal de verdad en Inicio (lámina `inicio-v2.html`): la barra (con su pila de banners) se
	 * superpone y el scroll de `.vega-main` arranca en lo alto de la ventana, así el contenido
	 * pasa POR DEBAJO de la barra translúcida y el menú lateral flota a su lado. Solo en `/`: las
	 * fichas y el editor visual pegan su propia barra (`EditTopBar`, `position: sticky; top: 0`)
	 * al borde de `.vega-main`, que tiene que seguir empezando bajo la barra. El alto real de la
	 * barra (una o dos filas, banners) se mide y viaja como `--vega-chrome-h`.
	 */
	const overlayChrome = $derived(page.route.id === '/');
	let chromeHeight = $state(0);
	let chromeEl = $state<HTMLElement | null>(null);

	// Medida del cromo superpuesto. Sin `ResizeObserver` (jsdom) se queda el alto de la barra
	// del tema como respaldo (`var(--topbar-h)` en el CSS).
	$effect(() => {
		if (!overlayChrome || !chromeEl || typeof ResizeObserver === 'undefined') return;
		const el = chromeEl;
		const observer = new ResizeObserver(() => (chromeHeight = el.offsetHeight));
		observer.observe(el);
		chromeHeight = el.offsetHeight;
		return () => observer.disconnect();
	});
</script>

<div
	class="vega-shell"
	class:vega-shell--overlay={overlayChrome}
	id="vega-app-shell"
	style:--vega-chrome-h={overlayChrome && chromeHeight > 0 ? `${chromeHeight}px` : undefined}
>
	<a class="vega-skip-link" href="#vega-main-content" onclick={skipToContent}
		>{ctx.t('shell.skipToContent')}</a
	>
	<div class="vega-chrome" bind:this={chromeEl}>
		<Topbar
			{sidebarOpen}
			onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
			{sidebarCollapsed}
			onToggleCollapse={toggleSidebarCollapsed}
		/>

		<!-- Pila de banners EN EL FLUJO (bajo la barra): EMPUJA el contenido en vez de tapar el
		     título/recuento/botones del listado, como hacía la pila `position: fixed`. Vacía (sin
		     banner activo) mide 0, así que no mueve nada. -->
		<div class="vega-banner-stack">
			<GlobalBanner />
			<UpdateBanner />
		</div>
	</div>

	<div class="vega-body">
		<Sidebar
			open={sidebarOpen}
			onClose={() => (sidebarOpen = false)}
			collapsed={sidebarCollapsed}
		/>

		<!-- Mientras la sidebar es overlay modal en móvil (`sidebarOpen`), el contenido de fondo se
		     marca `inert`: refuerza el trap de foco de teclado impidiendo que un lector de pantalla
		     en modo virtual navegue al `<main>` de detrás (§4.3). En escritorio `sidebarOpen` es
		     siempre falso, así que `<main>` nunca queda inerte. -->
		<main
			class="vega-main"
			id="vega-main-content"
			tabindex="-1"
			bind:this={mainEl}
			inert={sidebarOpen}
		>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.vega-skip-link {
		position: fixed;
		z-index: 80;
		top: 0.5rem;
		left: 0.5rem;
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		min-width: 44px;
		min-height: 44px;
		max-width: calc(100% - 1rem);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font-weight: 600;
		overflow-wrap: anywhere;
		transform: translateY(calc(-100% - 1rem));
	}
	.vega-skip-link:focus {
		transform: none;
		outline-color: var(--ink);
	}
	.vega-main:focus-visible {
		outline-color: var(--ink);
		outline-offset: -2px;
	}

	.vega-shell {
		position: relative;
		display: flex;
		flex-direction: column;
		/* Lienzo de la lámina Inicio v2: el fondo con el halo radial de marca detrás de TODA la
		   página (barra, menú y contenido son transparentes o de cristal encima), sin el corte
		   duro que daba pintarlo solo en `.vega-main`. R6 (marco «cabina») REVERTIDO: ya no hay
		   tarjeta flotante ni aire perimetral — la app ocupa el viewport entero. */
		background-color: var(--bg);
		background-image: var(--halo);
		background-repeat: no-repeat;
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

	.vega-chrome {
		position: relative;
		z-index: 5;
		flex-shrink: 0;
	}

	.vega-banner-stack {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.vega-body {
		display: flex;
		flex: 1;
		min-height: 0;
		position: relative;
		gap: var(--sp-3);
		padding: var(--sp-3);
	}

	/* Inicio: la barra flota sobre el área de scroll (ver `overlayChrome`). */
	.vega-shell--overlay .vega-chrome {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}

	.vega-shell--overlay .vega-body {
		padding-top: 0;
	}

	.vega-shell--overlay .vega-body > :global(.vega-sidebar) {
		margin-top: calc(var(--vega-chrome-h, var(--topbar-h)) + var(--sp-3));
	}

	.vega-shell--overlay .vega-main {
		padding-top: calc(var(--vega-chrome-h, var(--topbar-h)) + var(--sp-6));
		scroll-padding-top: var(--vega-chrome-h, var(--topbar-h));
	}

	.vega-main {
		flex: 1;
		min-width: 0;
		/* El área de contenido es el "papel" (`--paper`) sobre el que FLOTAN las tarjetas
		   (listado/ficha), con aire lateral generoso. Padding del mockup: 1.75/2/2.5rem.
		   ENRIQUECIDO (mockups aquelarre-*.html): `--halo` como segunda capa de fondo — una
		   atmósfera radial MUY tenue de la marca, `background-attachment: fixed` (no se desplaza
		   con el scroll interno de `.vega-main`). En paletas planas (brasa) el motor resuelve
		   `--halo` a `none` y queda el `--paper` liso de siempre, degradado limpio. */
		padding: var(--sp-6) var(--sp-6) var(--sp-12);
		/* Contenedor de los hijos `position:absolute` (los `.vega-visually-hidden`, popovers…): sin
		   esto su bloque contenedor es el documento y los que caen al fondo del contenido (a miles de
		   px dentro del scroll de `.vega-main`) estiran el documento (`scrollHeight` 1308 sobre 844 en
		   Ajustes a 390 px) → SEGUNDO scroll anidado, un hueco gris al final y la barra de Guardar
		   fuera de la vista. El único scroll es el de `.vega-main`. Transparente: el lienzo y su
		   halo los pinta `.vega-shell`. */
		position: relative;
		overflow-y: auto;
	}

	@media (max-width: 768px) {
		.vega-body {
			padding: 0;
		}
		.vega-main {
			padding: var(--sp-4);
		}
		/* Inicio móvil (lámina `.content`): 20/16/40 bajo la barra superpuesta. */
		.vega-shell--overlay .vega-main {
			padding: calc(var(--vega-chrome-h, var(--topbar-h)) + var(--sp-5)) var(--sp-4) var(--sp-10);
		}
		.vega-shell--overlay .vega-body > :global(.vega-sidebar) {
			margin-top: 0;
		}
	}
</style>
