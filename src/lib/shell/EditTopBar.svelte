<script lang="ts">
	/**
	 * `EditTopBar.svelte` (R7/R8 del rediseño C2 «Cabina», mockup `.edit-top`): la barra PEGAJOSA
	 * de acciones que corona tanto el editor de registro (`RecordForm.svelte`) como el editor del
	 * manifiesto (`ManifestEditor.svelte`) — el mockup pinta el MISMO contenedor en las Pantallas 2
	 * y 3 (crumb + spacer + botones), solo cambia lo que cada uno mete dentro. Extraído aquí para
	 * que el marco (sticky, fondo, borde inferior, el propio spacer) no se duplique entre los dos
	 * consumidores — el code-reviewer de lote-2 penalizó justo este tipo de duplicación.
	 *
	 * Deliberadamente TONTO y sin opinión sobre el CONTENIDO: el crumb de `RecordForm` es un
	 * enlace/tag/indicador-dirty, el de `ManifestEditor` es texto plano sin acción — demasiado
	 * distintos para forzarlos por props tipadas sin perder fidelidad al mockup. Por eso el
	 * contrato son dos SNIPPETS (`crumb`/`actions`), el mismo idioma de composición que ya usa
	 * `RecordTable.svelte` puertas adentro (su snippet local `cellContent`): este componente solo
	 * pone el contenedor sticky y el `spacer` flexible entre ambos huecos.
	 *
	 * **Fondo OPACO, no decorativo (bug que hay que evitar)**: `position: sticky; top: 0` sin un
	 * fondo que cubra por completo dejaría el contenido ya scrolleado transparentándose DETRÁS de
	 * la barra al hacer scroll. El fondo tiene que ser el MISMO token que pinta la región de
	 * contenido que la contiene — `.vega-main` en `AppShell.svelte` usa `--paper` (el "papel" sobre
	 * el que flotan las fichas/tarjetas de la cabina C2) — así que esta barra usa el mismo token,
	 * nunca `--surface` (el de las propias tarjetas, un tono distinto).
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		/** Contenido a la izquierda del spacer: crumb + cualquier indicador (tag de estado, dirty). */
		crumb: Snippet;
		/** Contenido a la derecha del spacer: "último guardado", enlaces y botones de acción. */
		actions: Snippet;
	}

	let { crumb, actions }: Props = $props();
</script>

<div class="vega-edit-top">
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
		margin-bottom: 1.5rem;
		position: sticky;
		top: 0;
		/* Ver cabecera: MISMO token que `.vega-main` (región de contenido que scrollea detrás). */
		background: var(--paper);
		z-index: 3;
	}

	.vega-edit-top-spacer {
		flex: 1;
	}
</style>
