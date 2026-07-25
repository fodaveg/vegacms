<script lang="ts">
	/**
	 * `EditTopBar.svelte` (R7/R8 del rediseño C2 «Cabina», mockup final `aquelarre-detalle-post.html`
	 * `.edit-topbar`): la barra PEGAJOSA de acciones que corona tanto el editor de registro
	 * (`RecordForm.svelte`) como el editor del manifiesto (`ManifestEditor.svelte`) — los dos pintan
	 * el MISMO contenedor (contexto a la izquierda + spacer + botones a la derecha), solo cambia lo
	 * que cada uno mete dentro. Extraído aquí para que el marco (sticky, fondo, borde inferior, el
	 * propio spacer) no se duplique entre los dos consumidores — el code-reviewer de lote-2
	 * penalizó justo este tipo de duplicación.
	 *
	 * Deliberadamente TONTO y sin opinión sobre el CONTENIDO: el crumb de `RecordForm` es
	 * enlace-atrás + título de documento + indicadores, el de `ManifestEditor` es texto plano sin
	 * acción — demasiado distintos para forzarlos por props tipadas sin perder fidelidad al mockup.
	 * Por eso el contrato son dos SNIPPETS (`crumb`/`actions`), el mismo idioma de composición que
	 * ya usa `RecordTable.svelte` puertas adentro (su snippet local `cellContent`): este componente
	 * solo pone el contenedor sticky y el `spacer` flexible entre ambos huecos.
	 *
	 * **Fondo OPACO, no decorativo (bug que hay que evitar)**: `position: sticky; top: 0` sin un
	 * fondo que cubra por completo dejaría el contenido ya scrolleado transparentándose DETRÁS de
	 * la barra al hacer scroll. El fondo tiene que ser el MISMO token que pinta la región de
	 * contenido que la contiene — `.vega-main` en `AppShell.svelte` usa `--paper` (el "papel" sobre
	 * el que flotan las fichas/tarjetas de la cabina C2) — así que esta barra usa el mismo token,
	 * nunca `--surface` (el de las propias tarjetas, un tono distinto).
	 *
	 * **`top: 0` y no `var(--topbar-h)` (desviación NECESARIA del mockup)**: el mockup es una página
	 * cuyo scroll es el del DOCUMENTO, con la topbar de la app pegada arriba — de ahí su
	 * `top: var(--topbar-h)`. En la app real el scroll NO es del documento: vive dentro de
	 * `.vega-main` (`overflow-y: auto`, ver `AppShell.svelte`), que ya empieza justo debajo de la
	 * topbar. Un `top: var(--topbar-h)` aquí dejaría la barra flotando 54px por debajo del borde
	 * superior del área visible; `top: 0` es su equivalente exacto en esta caja de scroll.
	 *
	 * **`bleed` (mockup final)**: en el mockup el editor va A SANGRE — la barra ocupa el ancho
	 * completo del lienzo y su hairline inferior llega de borde a borde. En la app eso lo consigue
	 * `RecordForm.svelte` cancelando el padding de `.vega-main` con márgenes negativos; entonces la
	 * barra necesita SU PROPIO padding horizontal (el del mockup) para que su contenido no quede
	 * pegado al borde de la ventana. `ManifestEditor` (que NO va a sangre, sigue dentro del padding
	 * de `.vega-main`) se queda con el default `false` y su aspecto de siempre — de ahí que sea una
	 * prop y no un cambio global.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		/** Contenido a la izquierda del spacer: contexto (atrás, título del documento, indicadores). */
		crumb: Snippet;
		/** Contenido a la derecha del spacer: estado de guardado, enlaces y botones de acción. */
		actions: Snippet;
		/** `true` en un contenedor A SANGRE (ver cabecera): la barra pone su propio padding lateral. */
		bleed?: boolean;
	}

	let { crumb, actions, bleed = false }: Props = $props();
</script>

<div class="vega-edit-top" class:vega-edit-top--bleed={bleed}>
	{@render crumb()}
	<span class="vega-edit-top-spacer"></span>
	{@render actions()}
</div>

<style>
	.vega-edit-top {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 0.4rem 0 1rem;
		border-bottom: 1px solid var(--line);
		/* Aire bajo la barra en el modo NO-a-sangre (`ManifestEditor`), donde el contenido que
		   sigue no trae padding propio. A sangre lo pone la rejilla del editor (ver `--bleed`). */
		margin-bottom: 1.5rem;
		position: sticky;
		/* Ver cabecera (por qué NO `var(--topbar-h)`): el scroll es el de `.vega-main`. */
		top: 0;
		/* Ver cabecera: MISMO token que `.vega-main` (región de contenido que scrollea detrás). */
		background: var(--paper);
		/* Por encima de las tarjetas pegajosas del editor (raíl/aside), que no llevan z-index
		   propio pero sí `position: sticky` — sin esto, un aside alto pasaría por delante. */
		z-index: 9;
	}

	/* A sangre (mockup `.edit-topbar`, ver cabecera): padding propio arriba/abajo y a los lados, y
	   SIN margen inferior — la separación con el contenido la pone ya el padding de la rejilla del
	   editor, y un margen aquí abriría un hueco de `--paper` entre la hairline y las tarjetas. */
	.vega-edit-top--bleed {
		gap: 0.75rem;
		padding: 0.6rem calc(var(--vega-space-gutter) * 1.5);
		margin-bottom: 0;
	}

	.vega-edit-top-spacer {
		flex: 1;
	}
</style>
