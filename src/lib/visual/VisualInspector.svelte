<script lang="ts">
	/**
	 * `VisualInspector.svelte` (tarea "árbol de secciones y el inspector"): columna DERECHA del
	 * editor visual — la ficha del bloque seleccionado, montando `BlockEditor.svelte` TAL CUAL (no
	 * se copia ni se reescribe, §encargo). Este componente no toca `ctx.port` para nada que
	 * `BlockEditor` no le pida a través de `onSubmit`: no crea, no reordena, no borra — esas cuatro
	 * acciones estructurales siguen siendo exclusivas de `RecordBlocks.svelte`.
	 *
	 * **`blocks` llega como prop**, la MISMA instancia que `VisualEditorScreen.svelte` construyó con
	 * `createBlocksState()` y que también consume `VisualBlockTree.svelte` — "un solo
	 * `createBlocksState` por pantalla" (requisito del encargo). Los props que se le pasan a
	 * `BlockEditor` son EXACTAMENTE los que ya usa `RecordBlocks.svelte` (mismo `childType`,
	 * `blockType`, `dataField`, `structuralFields`, `onSubmit`/`onSaved`/`onDirtyChange`/
	 * `onDraftChange`/`onBusyChange`): la ficha se comporta IDÉNTICA aquí que dentro del formulario
	 * de siempre, porque es literalmente el mismo componente sobre el mismo estado.
	 *
	 * **Todos los `BlockEditor` del registro, SIEMPRE montados — decisión del encargo, no elección
	 * libre.** Aquí solo se ve UNO a la vez (el del bloque seleccionado), pero cambiar de selección
	 * NO desmonta el anterior: se itera `blocks.records` ENTERO y cada `BlockEditor` vive detrás de
	 * un `hidden` (nunca un `{#if}`), exactamente el mismo criterio que `RecordBlocks.svelte` usa
	 * para sus filas plegadas (ver su cabecera, "Estado de cada bloque, siempre MONTADO"). El motivo
	 * es el mismo: un `{#if}` que desmontara el editor al cambiar de fila TIRARÍA un borrador a medio
	 * escribir sin avisar — justo lo que el guard de salida de `VisualEditorScreen.svelte` existe
	 * para evitar. El coste (N formularios en el DOM en vez de uno) es el mismo que ya paga
	 * `RecordBlocks`, y por el mismo motivo es aceptable: pocos bloques por página, nunca cientos
	 * (ver `blocks-state.svelte.ts`).
	 *
	 * **Selección que no casa con ningún registro.** El sitio puede anunciar un `select` para un id
	 * que este árbol no tiene — un bloque borrado desde OTRA pestaña, una plantilla que anota mal, o
	 * (más mundano) esta pantalla todavía cargando la lista cuando llegó el mensaje. Se DISTINGUE de
	 * "nada seleccionado" (`selectedId === null`): un id presente que no resuelve a ningún registro
	 * de `blocks.records` avisa con su propio texto en vez de caer en el estado vacío genérico, que
	 * mentiría ("elige un bloque") sobre algo que el autor ya hizo.
	 *
	 * **Vista previa en vivo, la mitad barata.** Al guardar con éxito (`onSaved` de `BlockEditor`),
	 * además de `blocks.handleBlockSaved` (que sostiene el propio árbol/estado) se llama
	 * `onBlockSaved()`, que `VisualEditorScreen.svelte` cablea a `requestPreview()`: pide un token
	 * nuevo, lo que recarga el `<iframe>` entero con el dato ya guardado. Refrescar el marco SIN
	 * recargarlo (sustitución en caliente) es la mitad cara y es OTRA tarea (§encargo) — no se monta
	 * aquí.
	 */
	import { getVegaContext } from '$lib/app-context';
	import BlockEditor from '$lib/form/BlockEditor.svelte';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';

	interface Props {
		/** Instancia ÚNICA de la pantalla (ver cabecera), nunca construida aquí. */
		blocks: BlocksState;
		/** Dueño único: `VisualEditorScreen.svelte#selectedBlockId`. */
		selectedId: string | null;
		/** Un bloque se acaba de guardar: la pantalla decide qué hacer (ver cabecera, "Vista previa
		 *  en vivo"). */
		onBlockSaved: () => void;
	}

	let { blocks, selectedId, onBlockSaved }: Props = $props();
	const ctx = getVegaContext();

	const selectedRecord = $derived(
		selectedId === null ? null : (blocks.records.find((record) => record.id === selectedId) ?? null)
	);
	/** Ver cabecera, "Selección que no casa": distingue el id-fantasma de "nada elegido todavía". */
	const danglingSelection = $derived(selectedId !== null && selectedRecord === null);
</script>

<div class="vega-inspector-panel" role="region" aria-labelledby="vega-inspector-heading">
	<div class="vega-inspector-head">
		<h2 id="vega-inspector-heading">{ctx.t('editor.visual.inspector.title')}</h2>
	</div>

	{#if blocks.hidden}
		<p class="vega-inspector-notice" role="alert">{ctx.t('editor.visual.tree.unavailable')}</p>
	{:else if blocks.loading}
		<p class="vega-inspector-notice" aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if blocks.records.length === 0}
		<p class="vega-inspector-notice">
			{ctx.t('editor.blocks.empty', { label: blocks.childType?.label ?? '' })}
		</p>
	{:else if selectedRecord === null}
		<p class="vega-inspector-notice" role={danglingSelection ? 'alert' : undefined}>
			{danglingSelection
				? ctx.t('editor.visual.inspector.unknownBlock')
				: ctx.t('editor.visual.inspector.empty')}
		</p>
	{/if}

	<!-- Ver cabecera, "SIEMPRE montados": TODOS los bloques del registro, ocultos con `hidden` salvo
	     el seleccionado — nunca `{#if}`, o cambiar de fila tiraría un borrador a medio escribir. -->
	{#if blocks.childType && !blocks.hidden}
		{@const childType = blocks.childType}
		{#each blocks.records as record (record.id)}
			<div class="vega-inspector-body" hidden={record.id !== selectedId}>
				<p class="vega-inspector-block-title">{blocks.blockTitle(record)}</p>
				<BlockEditor
					{childType}
					blockType={blocks.blockTypeOf(record)}
					rawBlockType={blocks.blockTypeRawName(record)}
					dataField={blocks.blocksConfig!.dataField}
					{record}
					structuralFields={blocks.structuralFields}
					onSubmit={(input) => ctx.port.update(childType.name, record.id, input)}
					onSaved={(saved) => {
						blocks.handleBlockSaved(record.id, saved);
						onBlockSaved();
					}}
					onDirtyChange={(dirty) => blocks.setDirty(record.id, dirty)}
					onDraftChange={(draft) => blocks.handleBlockDraftChange(record.id, draft)}
					onBusyChange={(saving) => blocks.setSaving(record.id, saving)}
				/>
			</div>
		{/each}
	{/if}
</div>

<style>
	/* Misma nota que `.vega-tree-panel` (`VisualBlockTree.svelte`): sin `position: sticky`, la
	   rejilla del padre (`.vega-visual-grid--inspector`) ya reparte el alto EXACTO del viewport y
	   `stretch` (su `align-items` por defecto) hace que esta celda llene esa altura sola. */
	.vega-inspector-panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		overflow-y: auto;
	}

	.vega-inspector-head {
		flex-shrink: 0;
		padding: 0.75rem 0.9rem;
		border-bottom: 1px solid var(--line);
	}

	.vega-inspector-head h2 {
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	.vega-inspector-notice {
		margin: 0.75rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	/* `display: flex` AQUÍ y `hidden` en el marcado es justo la combinación que se rompía sola: una
	   regla de autor gana a la del navegador, así que `hidden` dejaba de ocultar y salían los N
	   bloques apilados. Lo sostiene ahora `[hidden] { display: none !important }` de
	   `src/lib/theme/base.css` (allí está el razonamiento entero). No lo repitas aquí: si dejan de
	   ocultarse, el fallo está en esa hoja, no en esta clase. */
	.vega-inspector-body {
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
		padding: 0.9rem;
	}

	.vega-inspector-block-title {
		margin: 0;
		overflow-wrap: anywhere;
		font-size: 0.95em;
		font-weight: 650;
		color: var(--ink-hi);
	}
</style>
