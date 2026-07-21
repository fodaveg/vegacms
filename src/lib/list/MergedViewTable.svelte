<script lang="ts">
	/**
	 * `MergedViewTable.svelte` (Fase L7c+L7d, roadmap `mergedViews`): tabla de una vista fusionada
	 * (P2 §mergedViews, resuelta por L7a y cargada/fusionada por L7b — `merged-load.svelte.ts`/
	 * `merged-merge.ts`) — filas HETEROGÉNEAS: cada `MergedRow` puede venir de una colección
	 * distinta (`row.source.collection`), ya mezcladas por orden global (`row.orderValue`,
	 * calculado por `mergeViewResults`). Homóloga de `RecordTable.svelte` pero más simple: sin
	 * `ColumnSpec` (una vista fusionada no tiene columnas de datos por colección propias — cada
	 * source puede tener un esquema distinto), sin orden por cabecera, sin borrado — solo abrir
	 * cada fila en su editor real y (L7d) reordenar el conjunto mezclado a mano.
	 *
	 * - **Columnas MÍNIMAS, genéricas por construcción** (ninguna asume una colección concreta):
	 *   1. Asa de arrastre (L7d, `reorderable`, ver más abajo) — VACÍA en L7c, ahora activa;
	 *      reutiliza `createReorderDndController` (`reorder-dnd.ts`) tal cual la usa `RecordTable`,
	 *      MISMO ancho reservado desde L7c (esta fase no reflow el resto de columnas al llegar).
	 *   2. Insignia de tipo: `row.source.label` (L7a, override de source > `labelSingular`
	 *      resuelto del tipo) — identifica de un vistazo de qué colección viene cada fila.
	 *   3. Título: proyecta `row.source.titleField` (L7a, YA resuelto con el mismo criterio de
	 *      override > cascada que P2 §4.4, buscado en el `ResolvedContentType` real de
	 *      `row.record.type` vía `ctx.model.types`) con `describeCell`/`resolveTitleCellText` —
	 *      MISMO mecanismo que `RecordTable.openText`, mismo fallback i18n `list.untitled`. Enlaza
	 *      a `recordRoute` con los mismos gestos nativos (Cmd/Ctrl/Shift/click central) que
	 *      `RecordTable.openRecord`.
	 * - **Reorder cruzado (L7d)**: `reorderable` (prop nueva, decidida por `+page.svelte`: SIEMPRE
	 *   `true` salvo mientras una persistencia anterior está en vuelo, ver su cabecera) pinta el
	 *   asa y cablea `dnd.handleDragStart/Over/Drop/End`/`handleHandleKeydown` — MISMO patrón que
	 *   `RecordTable`, mismo aria-label reutilizado (`list.reorder.handleLabel`/`columnHeader`: son
	 *   genéricos, no mencionan colección). Emite `onReorder(fromIndex, toIndex)` por índice dentro
	 *   de `rows` (el conjunto MEZCLADO, no por-colección); este componente sigue TONTO — no sabe
	 *   qué colección/orderField corresponde a cada índice, eso lo resuelve `+page.svelte` a partir
	 *   de `row.source` (L7b ya la transporta en cada `MergedRow`, ver `merged-merge.ts`).
	 * - **Estado vacío PROPIO**: sin filas, SIN CTA "crear" (a diferencia del vacío-colección de
	 *   `/c/[type]`, P4 §4c) — una vista fusionada no tiene colección propia donde insertar un
	 *   registro nuevo, así que nunca ofrece esa acción.
	 * - **Aviso de truncado (L7b, opcional)**: si alguna source llegó al tope de `perPage` sin
	 *   paginación (`truncatedCollections`), un aviso suave NO bloqueante encima de la tabla —
	 *   señal honesta de "puede haber más registros de los mostrados", nunca oculta nada.
	 * - **Sin `contentType` como prop** (a diferencia de `RecordTable`): esta tabla no pertenece a
	 *   NINGÚN tipo de contenido único — resuelve el tipo de CADA fila por separado
	 *   (`row.record.type`) contra `ctx.model.types`. Un registro cuyo tipo ya no exista en el
	 *   modelo (carrera improbable: borrado del manifiesto entre la carga y el render) degrada a la
	 *   celda de apertura sintética (fallback `list.untitled`), nunca revienta.
	 * - **Estilos COPIADOS de `RecordTable.svelte`** (tabla/wrap/celda-título/enlace/asa): Svelte no
	 *   comparte CSS scoped entre componentes (mismo criterio anotado en la cabecera de
	 *   `RecordTable`) — el subconjunto que aplica aquí (sin orden/estado/acciones/ficheros) vive
	 *   recortado en este fichero.
	 * - **Feedback visual del arrastre (#l12-ux, item 2)**: MISMO mecanismo que `RecordTable`
	 *   (`dragFromIndex`/`dragOverIndex` en `$state` local, espejo del `onDragStateChange` del
	 *   controlador) — fila agarrada atenuada + hueco de acento en la fila de destino
	 *   (`dropIndicatorEdge`, puro, `reorder-dnd.ts`). Estilos COPIADOS igual que el resto (ver
	 *   arriba).
	 */
	import { getVegaContext } from '$lib/app-context';
	import { recordRoute } from '$lib/nav/routes';
	import { describeCell } from './cell';
	import { resolveTitleCellText } from './list-load';
	import { createReorderDndController, dropIndicatorEdge } from './reorder-dnd';
	import type { MergedRow } from './merged-merge';
	import type { ResolvedField } from '$lib/model/types';

	interface Props {
		/** Filas ya fusionadas y ordenadas (`mergeViewResults`, L7b). `[]` pinta el estado vacío
		 *  propio de la vista (ver cabecera), nunca un `<table>` sin filas. */
		rows: MergedRow[];
		/** Nombres de colección cuya source llegó al tope de carga sin paginar (L7b,
		 *  `truncatedCollections`); `[]` = ninguna, sin aviso. */
		truncatedCollections: string[];
		/** `true` cuando `+page.svelte` permite reordenar a mano el conjunto mezclado (L7d).
		 *  `false` mientras una persistencia anterior sigue en vuelo (evita solapar escrituras, ver
		 *  su cabecera) — nunca por ningún otro motivo: a diferencia de `RecordTable.reorderable`,
		 *  una vista fusionada no pagina ni admite búsqueda/orden propios (L7b), así que no hay
		 *  combinación que la deshabilite de forma permanente. El asa SIEMPRE está montada (fix de
		 *  code-review, ver el marcado): `reorderable` solo la deshabilita (`aria-disabled`,
		 *  `draggable`), nunca la desmonta — desmontarla mientras el usuario reordena por teclado le
		 *  robaría el foco a mitad de gesto (el nodo enfocado desaparecería del DOM). */
		reorderable: boolean;
		/** Avisa de un reorder por arrastre o teclado (ver cabecera): `fromIndex`/`toIndex` son
		 *  posiciones dentro de `rows`, en el orden ya renderizado (el conjunto MEZCLADO). Solo se
		 *  invoca cuando `reorderable`. Quien escucha decide qué persistir (mapeando cada índice a
		 *  su `row.source`) y cuándo recargar. */
		onReorder: (fromIndex: number, toIndex: number) => void;
	}

	let { rows, truncatedCollections, reorderable, onReorder }: Props = $props();

	const ctx = getVegaContext();

	/** Espejo LOCAL del `ReorderDragState` (#l12-ux, item 2), MISMO patrón que `RecordTable`. */
	let dragFromIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	/** Controlador de arrastre+teclado (L7d, `reorder-dnd.ts`) — MISMO módulo que `RecordTable`,
	 *  reutilizado tal cual (ver cabecera). `rows.length` se relee en cada `keydown`, nunca
	 *  capturado una sola vez. `onReorder` se envuelve en una flecha, mismo motivo que en
	 *  `RecordTable` (aviso real de `svelte-check`, `state_referenced_locally`: pasar el prop tal
	 *  cual capturaría su valor inicial para siempre). */
	const dnd = createReorderDndController(
		(from, to) => onReorder(from, to),
		() => rows.length,
		(state) => {
			dragFromIndex = state.fromIndex;
			dragOverIndex = state.overIndex;
		}
	);

	/** El `ResolvedField` del campo-título YA resuelto de `row` (`row.source.titleField`, L7a: ya
	 *  lleva el override de la source aplicado si lo había), buscado en el `ResolvedContentType`
	 *  real de `row.record.type` — `undefined` si la vista no tiene campo-título representable
	 *  para esta source o el tipo ya no existe en el modelo (ver cabecera). */
	function titleField(row: MergedRow): ResolvedField | undefined {
		if (!row.source.titleField) return undefined;
		const contentType = ctx.model.types.find((t) => t.name === row.record.type);
		return contentType?.fields.find((f) => f.name === row.source.titleField);
	}

	/** Texto de la celda de apertura de `row` (mismo criterio que `RecordTable.openText`): el del
	 *  campo-título resuelto, o el fallback `list.untitled` si no hay campo, la celda queda vacía o
	 *  no es texto. NUNCA "—": dejaría la fila sin ninguna pista de qué abre. */
	function openText(row: MergedRow): string {
		const field = titleField(row);
		if (!field) return resolveTitleCellText(null, ctx.t('list.untitled'));
		const descriptor = describeCell(field, row.record.values[field.name] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	}

	/** Abre el registro de `row` en su editor real (mismo gesto que `RecordTable.openRecord`): un
	 *  click normal navega vía `ctx.nav.toRecord` (exit-guard incluido); un click modificado
	 *  (Cmd/Ctrl/Shift/central) sigue el `href` real y abre en pestaña/ventana nueva. */
	function openRecord(event: MouseEvent, row: MergedRow): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toRecord(row.record.type, row.record.id);
	}
</script>

{#if rows.length === 0}
	<div class="vega-merged-empty" data-list-state="empty-collection">
		<h2>{ctx.t('list.merged.empty.title')}</h2>
		<p>{ctx.t('list.merged.empty.body')}</p>
	</div>
{:else}
	<div data-list-state="ready">
		{#if truncatedCollections.length > 0}
			<p class="vega-merged-truncated-notice" role="status">
				{ctx.t('list.merged.truncatedNotice')}
			</p>
		{/if}
		<div class="vega-record-table-wrap">
			<table class="vega-record-table">
				<thead>
					<tr>
						<!-- Columna del asa de arrastre (L7d, ver cabecera): SIEMPRE presente — a
						     diferencia de `RecordTable.reorderable` (que puede quedar permanentemente
						     `false` por filtro/orden/paginación), la de una vista fusionada solo se
						     deshabilita TRANSITORIAMENTE mientras persiste (`persisting`, ver cabecera del
						     módulo), así que la columna nunca se desmonta — mismo criterio que la fila de
						     abajo (fix de code-review, ver el comentario del asa). -->
						<th scope="col" class="vega-reorder-header">
							<span class="vega-visually-hidden">{ctx.t('list.reorder.columnHeader')}</span>
						</th>
						<th scope="col">{ctx.t('list.merged.typeHeader')}</th>
						<th scope="col">{ctx.t('list.merged.titleHeader')}</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row, i (`${row.record.type}:${row.record.id}`)}
						{@const dropEdge =
							dragOverIndex === i ? dropIndicatorEdge(dragFromIndex, dragOverIndex) : null}
						<tr
							class:vega-row-dragging={dragFromIndex === i}
							class:vega-row-drop-before={dropEdge === 'before'}
							class:vega-row-drop-after={dropEdge === 'after'}
							ondragover={reorderable ? (event) => dnd.handleDragOver(event, i) : undefined}
							ondrop={reorderable ? (event) => dnd.handleDrop(event, i) : undefined}
						>
							<td class="vega-reorder-cell">
								<!-- Fix de code-review (L7d): el asa se queda SIEMPRE montada, nunca se
								     desmonta cuando `!reorderable` (mientras `persisting`) — desmontarla (la
								     versión original de esta fase) mueve el foco al `<body>` en cada gesto de
								     teclado, porque el botón enfocado desaparece del DOM a mitad de
								     ArrowUp/Down. `aria-disabled` (NO el atributo `disabled` nativo): un
								     `disabled` de verdad SACA el elemento del árbol de foco (el navegador lo
								     desenfoca solo), el mismo problema que desmontarlo — `aria-disabled` deja
								     el asa alcanzable/enfocable, solo bloqueada semánticamente; el bloqueo
								     REAL de la acción vive en el guard de `handleKeydown` de abajo (drag ya
								     queda cortado por `draggable={reorderable}`, el navegador ni inicia el
								     gesto). -->
								<button
									type="button"
									class="vega-reorder-handle"
									aria-label={ctx.t('list.reorder.handleLabel', { label: openText(row) })}
									aria-disabled={!reorderable}
									draggable={reorderable}
									ondragstart={(event) => dnd.handleDragStart(event, i)}
									ondragend={dnd.handleDragEnd}
									onkeydown={(event) => {
										if (reorderable) dnd.handleHandleKeydown(event, i);
									}}
								>
									<span aria-hidden="true">⠿</span>
								</button>
							</td>
							<td>
								<span class="vega-type-badge">{row.source.label}</span>
							</td>
							<td class="vega-cell-title">
								<a
									href={recordRoute(row.record.type, row.record.id)}
									title={openText(row)}
									onclick={(event) => openRecord(event, row)}
								>
									{openText(row)}
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<style>
	.vega-merged-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
		padding: 2rem 1.5rem;
		margin: 0;
	}

	.vega-merged-empty h2 {
		margin: 0;
		font-size: 1rem;
		color: var(--ink-hi);
	}

	.vega-merged-empty p {
		margin: 0;
		color: var(--ink-2);
	}

	.vega-merged-truncated-notice {
		margin: 0;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	.vega-record-table-wrap {
		overflow-x: auto;
	}

	.vega-record-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.vega-record-table thead th {
		padding: 0.5rem var(--cell-x);
		text-align: left;
		white-space: nowrap;
		font-family: var(--mono);
		font-size: 0.6563rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--ink-3);
		background: var(--surface-2);
		border-bottom: 1px solid var(--line-strong);
	}

	/* Técnica WCAG estándar de "visualmente oculto" (mismo criterio que `RecordTable`): 1×1px,
	   invisible a simple vista, presente en el árbol de accesibilidad. NUNCA `display:none`. */
	.vega-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* Columna del asa de arrastre (L7d, ver cabecera): estrecha, sin truncar (el asa nunca lleva
	   texto visible que necesite elipsis) — MISMO ancho que `RecordTable` desde L7c para que esta
	   fase no cambiara el layout al aterrizar. */
	.vega-reorder-header,
	.vega-reorder-cell {
		width: 2rem;
		max-width: none;
		overflow: visible;
		white-space: nowrap;
	}

	/* Asa de arrastre (L7d): estilos COPIADOS de `RecordTable.vega-reorder-handle` (ver cabecera
	   del módulo, mismo criterio de Svelte-no-comparte-CSS-scoped). */
	.vega-reorder-handle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 5px;
		background: none;
		color: var(--ink-2);
		font-size: 1rem;
		line-height: 1;
		cursor: grab;
	}

	.vega-reorder-handle:hover {
		background: var(--surface-2);
		color: var(--ink);
	}

	.vega-reorder-handle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.vega-reorder-handle:active {
		cursor: grabbing;
	}

	/* Deshabilitada TRANSITORIAMENTE (fix de code-review, L7d): `persisting`, ver la cabecera del
	   módulo y el marcado — `aria-disabled`, no `disabled` nativo (que desenfocaría el asa), así
	   que la señal visual va aquí, en CSS, en vez de en un `:disabled` que nunca aplicaría. */
	.vega-reorder-handle[aria-disabled='true'] {
		cursor: default;
		opacity: 0.5;
	}

	/* Feedback visual del arrastre (#l12-ux, item 2) — estilos COPIADOS de `RecordTable.svelte`
	   (ver cabecera del módulo, mismo criterio de Svelte-no-comparte-CSS-scoped). */
	.vega-record-table tbody tr.vega-row-dragging {
		opacity: 0.5;
		cursor: grabbing;
	}

	.vega-record-table tbody tr.vega-row-drop-before > td {
		box-shadow: inset 0 2px 0 0 var(--accent);
	}

	.vega-record-table tbody tr.vega-row-drop-after > td {
		box-shadow: inset 0 -2px 0 0 var(--accent);
	}

	.vega-record-table tbody tr {
		height: var(--row-h);
		border-bottom: 1px solid var(--line);
	}

	.vega-record-table tbody tr:last-child {
		border-bottom: none;
	}

	.vega-record-table tbody tr:hover {
		background: var(--accent-soft);
	}

	.vega-record-table td {
		max-width: 24rem;
		padding: 0.4rem var(--cell-x);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		vertical-align: middle;
	}

	.vega-cell-title {
		width: 70%;
		max-width: 0;
	}

	.vega-record-table td a {
		color: var(--ink-hi);
		font-weight: 500;
		text-decoration: none;
	}

	.vega-record-table td a:hover {
		text-decoration: underline;
	}

	/* Insignia de tipo (ver cabecera): NEUTRA a propósito — a diferencia de
	   `RecordTable.vega-status-badge` (que colorea por semántica draft/published/other), aquí el
	   valor es un `label` libre de manifiesto sin vocabulario cerrado, así que no hay color que
	   asignarle sin inventar semántica que no existe. */
	.vega-type-badge {
		display: inline-flex;
		align-items: center;
		font-family: var(--mono);
		font-size: 0.72rem;
		font-weight: 600;
		border-radius: 5px;
		padding: 0.18rem 0.55rem;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink-2);
		white-space: nowrap;
	}
</style>
