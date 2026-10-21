<script lang="ts">
	/**
	 * `VisualPalette.svelte` (encargo "paleta de bloques arrastrable del editor visual"): catálogo
	 * buscable de botones —uno por `blocksState.blockTypes`, la MISMA fuente que ya usa el menú "Añadir sección"
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
	/** A partir de cuántos tipos aparece el buscador: con un vocabulario corto, las baldosas ya se ven
	 *  todas de un vistazo (lámina «edición en vivo», `.palette`). */
	const PALETTE_SEARCH_MIN = 6;
	let search = $state('');

	/** Solo el manifiesto alimenta el catálogo. Se busca por etiqueta y campos declarados, con
	 * normalización de acentos; ni el nombre técnico ni el sitio generan miniaturas ficticias. */
	const visibleTypes = $derived.by(() => {
		const query = normalize(search.trim());
		if (!query) return blocks.blockTypes;
		return blocks.blockTypes.filter((type) =>
			normalize(
				[type.label, type.description ?? '', ...type.fields.map((field) => field.label)].join(' ')
			).includes(query)
		);
	});

	function normalize(value: string): string {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLocaleLowerCase(ctx.locale);
	}

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
			<h2 id="vega-palette-heading">{ctx.t('editor.visual.palette.title')}</h2>
		</div>
		<!-- Dónde cae una baldosa pulsada: al final de la página (el «+» del lienzo elige posición). -->
		<p class="vega-palette-sr" id="vega-palette-where">{ctx.t('editor.visual.insert.end')}</p>
		{#if blocks.blockTypes.length > PALETTE_SEARCH_MIN}
			<!-- Catálogo buscable (audit del 19 oct): solo cuando el vocabulario es largo; con pocos
			     tipos la lámina «edición en vivo» enseña las baldosas sin buscador. -->
			<label class="vega-palette-search-label" for="vega-palette-search">
				{ctx.t('editor.visual.paletteSearch.label')}
			</label>
			<input
				id="vega-palette-search"
				class="vega-palette-search"
				type="search"
				bind:value={search}
				placeholder={ctx.t('editor.visual.paletteSearch.placeholder')}
			/>
		{/if}
		{#if blocks.anyDirty}
			<p class="vega-palette-notice" id="vega-palette-pending">
				{ctx.t('editor.visual.pending.palette')}
			</p>
		{/if}
		<div class="vega-palette-list">
			{#each visibleTypes as blockType (blockType.name)}
				<button
					type="button"
					class="vega-palette-item"
					draggable={!structuralGuard}
					disabled={structuralGuard}
					aria-describedby={blocks.anyDirty ? 'vega-palette-pending' : 'vega-palette-where'}
					title={blockType.label}
					ondragstart={(event) => handleDragStart(event, blockType)}
					ondragend={onDragEnd}
					onclick={() => void createAtEnd(blockType)}
				>
					<span class="vega-palette-icon" aria-hidden="true">
						<Icon id={blockType.icon ?? 'document'} size={18} strokeWidth={1.6} />
					</span>
					<span class="vega-palette-copy">
						<strong>{blockType.label}</strong>
						<span class="vega-palette-fields vega-palette-sr"
							>{blockType.description ??
								blockType.fields.map((field) => field.label).join(' · ')}</span
						>
					</span>
				</button>
			{/each}
			{#if visibleTypes.length === 0}
				<p class="vega-palette-empty">{ctx.t('editor.visual.paletteSearch.empty')}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Lámina «edición en vivo», `.palette`: «Añadir sección» con una baldosa por tipo (icono y
	   nombre), arrastrable o pulsable. La descripción del tipo sigue en el nombre accesible. */
	.vega-palette-panel {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		border-bottom: 1px solid var(--line-soft);
	}

	.vega-palette-head {
		padding: 14px 16px 8px;
	}

	.vega-palette-head h2 {
		margin: 0;
		color: var(--ink-3);
		font-size: var(--fs-12);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.vega-palette-notice {
		margin: 0;
		padding: 0 16px 8px;
		color: var(--ink-2);
		font-size: var(--fs-12);
		overflow-wrap: anywhere;
	}

	.vega-palette-search-label {
		padding: 0 16px 4px;
		color: var(--ink-2);
		font-size: var(--fs-12);
		font-weight: 600;
	}

	.vega-palette-search {
		margin: 0 12px 8px;
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: var(--fs-13);
	}

	.vega-palette-search:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	/* Baldosas en filas que se reparten el ancho (ronda 3 del QA de fodaveg: en tres columnas fijas
	   «seleccionada» no cabía y se partía a mitad). Cada baldosa mide al menos su palabra más larga
	   (`min-width: auto` de un elemento flexible), así que una palabra nunca se corta: si no cabe,
	   la baldosa pasa a la fila siguiente y las demás se estiran. */
	.vega-palette-list {
		display: flex;
		flex-wrap: wrap;
		align-content: start;
		gap: 6px;
		padding: 0 12px 12px;
		max-height: 18rem;
		overflow-y: auto;
	}

	.vega-palette-item {
		display: flex;
		flex: 1 1 4.5rem;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 10px 6px;
		border: 1px dashed var(--line-strong);
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 11px;
		font-weight: 500;
		text-align: center;
		cursor: grab;
	}

	.vega-palette-item:hover:not(:disabled) {
		border-style: solid;
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-palette-icon {
		display: inline-flex;
	}

	.vega-palette-copy {
		display: flex;
		flex-direction: column;
		max-width: 100%;
	}

	/* El nombre se lee ENTERO (QA de fodaveg, 21 oct 2026: «Entradas …», «Imagen co…»): hasta tres
	   líneas, y solo por espacios: ni `hyphens: auto` («selecciona-da») ni ningún corte dentro de
	   una palabra («selecciona|da», ronda 3). Es la baldosa la que se ensancha (ver
	   `.vega-palette-list`). Un nombre de más de tres líneas se recorta al final de la tercera y se
	   lee completo en el `title` de la baldosa y en su nombre accesible. */
	.vega-palette-copy strong {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
		font-weight: 500;
		line-height: 1.25;
		overflow-wrap: normal;
		word-break: normal;
	}

	/* La descripción no se pinta en la baldosa (lámina), pero sigue en su nombre accesible. */
	.vega-palette-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.vega-palette-empty {
		flex: 1 1 100%;
		margin: 0;
		padding: 0.65rem;
		color: var(--ink-2);
		font-size: var(--fs-12);
	}

	.vega-palette-item:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-palette-item:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Objetivo táctil 44×44 (checklist de accesibilidad, ver `scripts/check-touch-targets.mjs`): con
	   ratón/trackpad el tamaño de contenido + padding ya basta. */
	@media (pointer: coarse) {
		.vega-palette-item,
		.vega-palette-search {
			min-height: 44px;
		}
	}
</style>
