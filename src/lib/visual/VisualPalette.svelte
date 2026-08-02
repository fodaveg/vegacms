<script lang="ts">
	/**
	 * `VisualPalette.svelte` (encargo "paleta de bloques arrastrable del editor visual"): fila de
	 * botones —uno por `blocksState.blockTypes`, la MISMA fuente que ya usa el menú "Añadir sección"
	 * de `VisualBlockTree.svelte` y el `+` de `VisualOverlay.svelte` (si esta paleta acabase con su
	 * propia lista de tipos, el encargo habría salido mal)— que SUSTITUYE al botón "Añadir Sección
	 * ›" del árbol cuando hay menú de tipos (decisión 1 del encargo, cerrada con David): ese botón
	 * se retira en el MISMO commit que trae esta paleta (ver la cabecera de `VisualBlockTree.svelte`,
	 * que ya no lo pinta cuando `hasTypeMenu`).
	 *
	 * **No se renderiza en modo homogéneo** (`blocksState.hasTypeMenu === false`, decisión 4): con
	 * un solo tipo posible no hay nada que arrastrar de aquí, y el botón "Añadir" simple de la
	 * cabecera del árbol sigue siendo la única vía, exactamente como antes de este encargo.
	 *
	 * **Región propia, con su propio encabezado** (decisión 2): `VisualBlockTree.svelte` la instancia
	 * DENTRO de `.vega-tree-panel`, arriba del árbol (ver su cabecera para el porqué de "dentro" —
	 * el cajón responsive). El panel pasa a tener DOS regiones (`role="region"`/`aria-labelledby`),
	 * paleta y secciones, cada una con su propio `<h2>` — nunca una sola cubriendo las dos, que
	 * mentiría sobre qué hay dentro.
	 *
	 * **Dos vías, un solo botón cada una — arrastrar (ratón) y activar (teclado/clic).** Cada
	 * `<button draggable="true">` hace DOS cosas distintas según el gesto:
	 * - `dragstart`: fija `dataTransfer` (`setData('text/plain', type.name)` —varios navegadores
	 *   exigen `setData` para completar el gesto— y `effectAllowed = 'copy'`, porque esto CREA, no
	 *   mueve nada existente) y avisa hacia ARRIBA con el tipo elegido. El dueño único de "hay un
	 *   arrastre de paleta en vuelo, de qué tipo" es `VisualEditorScreen.svelte` (decisión 5: mismo
	 *   criterio de "un solo escritor" que `selectedBlockId`, ver su cabecera) — este componente NO
	 *   guarda ese estado, solo lo REPORTA por `onDragStart`/`onDragEnd`, para que el lienzo
	 *   (`VisualOverlay.svelte`, que lo recibe por prop) pueda montar sus propios destinos de caída.
	 * - `dragend`: avisa del final del gesto pase lo que pase (soltado con éxito o cancelado) — el
	 *   lienzo necesita saberlo para desmontar esos mismos destinos.
	 * - `onclick` (que Enter/Espacio disparan gratis por ser un `<button>` de verdad: no hace falta
	 *   ningún `onkeydown` propio): crea AL FINAL, exactamente lo que hacía el menú "Añadir Sección
	 *   ›" antes de retirarse. Arrastrar no es accesible por sí solo (el lienzo al que se suelta es
	 *   un `<iframe>` de otro origen, y aquí ni siquiera hay lienzo de por medio: es puramente un
	 *   gesto de puntero), así que ESTA es la vía equivalente que exige el encargo de accesibilidad
	 *   de esta tarea.
	 *
	 * **Anuncio por voz de la creación** (ver la cabecera de `blocks-state.svelte.ts`, `say`):
	 * `handleCreate` no anunciaba nada por sí solo (tampoco lo hacía el botón "Añadir" que
	 * sustituye); esta tarea lo añade aquí Y en `VisualOverlay.svelte#handleInsert` (la caída en el
	 * lienzo, reutilizada tal cual, ver su cabecera). Se comprueba el registro creado por longitud
	 * (mismo criterio que `handleInsert`): `blocks.records.length !== before + 1` ⇒ la creación
	 * falló, `ctx.feedback` ya avisó, no hay nada que anunciar — pero `onStructuralChange()` SÍ se
	 * llama siempre, mismo criterio que el resto de mutaciones de creación de este módulo (ver la
	 * cabecera de `VisualBlockTree.svelte`, "incondicionalmente para crear/duplicar/borrar").
	 *
	 * **Guardas idénticas al resto** (`anyDirty || anySaving || structuralBusy`): `disabled` apaga
	 * el `onclick`, y `draggable` cae CON él —un `disabled` a secas no frena el arrastre nativo,
	 * mismo criterio que el asa de `VisualOverlay.svelte`.
	 *
	 * **Y `blocks.hidden` la retira ENTERA, no solo la deshabilita** (hallazgo de la revisión fría
	 * de este mismo commit): `hidden` incluye `status.kind === 'error'` (ver
	 * `blocks-state.svelte.ts`), o sea que la lista de bloques de ESTE registro no cargó, mientras
	 * que `hasTypeMenu` sale del vocabulario GLOBAL de tipos y no sabe nada de esa carga. Sin esta
	 * guarda, un fallo transitorio de `ctx.port.list()` dejaba el árbol diciendo "no disponible" y
	 * la paleta creando igual: `handleCreate` calcula el `orderField` sobre `records`, que con
	 * `status` en error es `[]`, así que el bloque nuevo nace con orden 0 y `status` pasa a
	 * `ready` con ÉL SOLO — los bloques reales que no llegaron a cargar desaparecen de la vista y
	 * colisionan de orden al recargar. Las dos superficies hermanas ya lo comprueban (el `+` de
	 * `VisualOverlay.svelte` y el botón "Añadir" simple de `VisualBlockTree.svelte`); al repartir
	 * en tres sitios lo que antes era un solo `{#if !blocks.hidden}`, este se quedó fuera.
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';
	import type { ResolvedBlockType } from '$lib/model/types';

	interface Props {
		/** Instancia ÚNICA de la pantalla (mismo criterio que el resto de `$lib/visual`), la MISMA
		 *  que recibe `VisualBlockTree.svelte`. */
		blocks: BlocksState;
		/** Una creación de verdad (al final, por clic/teclado) acaba de completarse. */
		onStructuralChange: () => void;
		/** Empieza un arrastre de paleta: avisa con el tipo elegido (ver cabecera, dueño único en
		 *  `VisualEditorScreen.svelte`). */
		onDragStart: (blockType: ResolvedBlockType) => void;
		/** Termina el gesto, pase lo que pase (soltado con éxito o cancelado). */
		onDragEnd: () => void;
	}

	let { blocks, onStructuralChange, onDragStart, onDragEnd }: Props = $props();
	const ctx = getVegaContext();

	/** Misma guarda que las filas del árbol y la barra flotante del lienzo, y **a propósito más
	 *  estricta que el botón "Añadir Sección ›" al que sustituye** (que solo miraba
	 *  `structuralBusy || anySaving`, sin `anyDirty`): este botón tiene DOS gestos, y el de
	 *  arrastrar acaba en `VisualOverlay.svelte#handleInsert`, que crea y luego REORDENA — el mismo
	 *  camino que el `+` de los puntos de inserción, que ya se congela con `anyDirty`. Dos criterios
	 *  distintos en el mismo `disabled` no caben, así que manda el del gesto más peligroso. */
	const structuralGuard = $derived(blocks.anyDirty || blocks.anySaving || blocks.structuralBusy);

	function handleDragStart(event: DragEvent, blockType: ResolvedBlockType): void {
		event.dataTransfer?.setData('text/plain', blockType.name);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
		onDragStart(blockType);
	}

	/** Crea AL FINAL y anuncia (ver cabecera): mismo criterio de "creación fallida" que
	 *  `VisualOverlay.svelte#handleInsert` — sin registro nuevo no hay nada que anunciar,
	 *  `ctx.feedback` ya avisó del fallo por su cuenta. */
	async function createAtEnd(blockType: ResolvedBlockType): Promise<void> {
		const before = blocks.records.length;
		await blocks.handleCreate(blockType);
		onStructuralChange();
		if (blocks.records.length !== before + 1) return; // creación fallida, ver cabecera
		const created = blocks.records[blocks.records.length - 1];
		blocks.say(
			ctx.t('editor.visual.tree.announceCreate', {
				label: blocks.blockTitle(created),
				position: blocks.records.length,
				total: blocks.records.length
			})
		);
	}
</script>

{#if blocks.hasTypeMenu && !blocks.hidden}
	<div class="vega-palette-panel" role="region" aria-labelledby="vega-palette-heading">
		<div class="vega-palette-head">
			<h2 id="vega-palette-heading">{ctx.t('editor.blocks.addMenu.label')}</h2>
		</div>
		<div class="vega-palette-list">
			{#each blocks.blockTypes as blockType (blockType.name)}
				<button
					type="button"
					class="vega-palette-item"
					draggable={!structuralGuard}
					disabled={structuralGuard}
					ondragstart={(event) => handleDragStart(event, blockType)}
					ondragend={onDragEnd}
					onclick={() => void createAtEnd(blockType)}
				>
					{#if blockType.icon}<Icon id={blockType.icon} size={14} />{/if}
					{blockType.label}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.vega-palette-panel {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		border-bottom: 1px solid var(--line);
	}

	.vega-palette-head {
		padding: 0.75rem 0.9rem 0.4rem;
	}

	.vega-palette-head h2 {
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
	}

	.vega-palette-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0 0.9rem 0.75rem;
		max-height: 9rem;
		overflow-y: auto;
	}

	.vega-palette-item {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.78em;
		font-weight: 600;
		cursor: grab;
	}

	.vega-palette-item:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-palette-item:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-palette-item:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Objetivo táctil 44×44 (checklist de accesibilidad, ver `scripts/check-touch-targets.mjs`): con
	   ratón/trackpad el tamaño de contenido + padding ya basta. */
	@media (pointer: coarse) {
		.vega-palette-item {
			min-height: 44px;
		}
	}
</style>
