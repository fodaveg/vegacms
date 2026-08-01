<script lang="ts">
	/**
	 * `RecordTable.svelte` (Fase 4c+4d del contrato P4, la tabla READ-ONLY): traduce cada
	 * `VegaRecord` + `ColumnSpec` (4a) a una fila vía `describeCell` (4a), con orden por cabecera
	 * (4d, ver más abajo) — SIN búsqueda (eso vive en `ListToolbar.svelte`) ni borrado (4e).
	 *
	 * - **Fila siempre abrible (L-P4.15, fix de code-review de 4c)**: la celda de APERTURA es
	 *   SIEMPRE un enlace real a `ctx.nav.toRecord` — `href` real (Cmd/Ctrl/Shift+click y click
	 *   central abren en pestaña nueva sin pasar por la SPA, mismo patrón que `NavItem.svelte`).
	 *   Esa celda es la columna `isTitle` SI EXISTE (`type.titleField` resuelto, §4.4) — pero NO
	 *   siempre existe: la cascada de P2 puede agotarse a `null` (ningún campo `text`/`email`/`url`
	 *   representable) o un manifiesto puede declarar `listFields` explícito sin el `titleField`
	 *   (resolve.ts no lo fuerza de vuelta). Sin columna `isTitle` entre las RENDERIZADAS, la celda
	 *   de apertura cae a la PRIMERA columna (`columns[0]`); si ni siquiera hay columnas
	 *   (`listFields` vacío), se pinta una única celda de apertura sintética con el id como texto —
	 *   NUNCA una fila sin ninguna forma de abrirla. El texto de la celda de apertura sale de
	 *   `resolveTitleCellText` (`list-load.ts`), con el fallback i18n `list.untitled` cuando la
	 *   celda queda vacía o no es de tipo texto. NUNCA "—": dejaría la fila sin ninguna pista de
	 *   qué abre.
	 * - **Insignia de estado, EXTENDIDA a 1:1 con el mockup C2 (R3 del rediseño, desviación
	 *   consciente de D-P4.8, ver `classifyStatusBadge` en `cell.ts`)**: D-P4.8 solo pintaba
	 *   insignia para los literales `draft`/`published` y dejaba cualquier otro valor de esa
	 *   columna como texto plano. El mockup C2 (`.tag.pub`/`.tag.draft`/`.tag.other`) pinta TODA
	 *   columna `isStatus` como insignia — David pidió fidelidad 1:1, así que esta fase amplía la
	 *   condición a cualquier `descriptor.kind === 'text'` de una columna `isStatus` y usa
	 *   `classifyStatusBadge` (módulo puro, testeado) para decidir el color: `published`→`pub`,
	 *   `draft`→`draft`, cualquier otro literal (p.ej. `archived`, o una opción libre de un
	 *   manifiesto)→`other`. Rectangular (`border-radius:5px`) y mono, no la píldora `999px` de
	 *   antes.
	 * - **Ficheros (L-P4.5)**: `capabilities.thumbs` decide miniatura (`ctx.port.fileUrl` con
	 *   `{thumb}`) vs nombre(s) de fichero visible(s); sin esa capability (memory) degrada al
	 *   nombre, nunca en silencio.
	 * - **Realtime NO se usa en v1 (L-P4.5)**: esta tabla no se auto-refresca; el hueco queda
	 *   declarado aquí a propósito — el refresco solo llega tras una mutación propia (4e) o una
	 *   recarga completa.
	 * - **Orden por cabecera (Fase 4d, D-P4.6)**: las columnas `sortable` (`ColumnSpec.sortable`,
	 *   §4a) pintan un `<button>` dentro del `<th>` que cicla asc→desc→sin-orden al click (la
	 *   lógica del ciclo vive en `cycleSort`, 4d — este componente NO decide el próximo estado,
	 *   solo avisa con `onSort(field)`). Las columnas no escalares se quedan con la cabecera de
	 *   texto plano de siempre, sin ningún control. `aria-sort` (`ascending`/`descending`/`none`)
	 *   solo se pone en las cabeceras `sortable`: no tiene sentido ARIA anunciar un estado de orden
	 *   en una columna que nunca puede ordenar. La navegación real (reflejar el resultado en
	 *   `?sort=&dir=`) la hace `+page.svelte`, TONTO a propósito, mismo reparto que
	 *   `Pagination.svelte`/`ListToolbar.svelte`.
	 * - **Fila en hover, migrado a `--accent-soft` (R3 del rediseño C2)**: F7w-b lo dejó en
	 *   `--active`; el mockup C2 (`tbody tr:hover td { background: var(--accent-soft) }`) usa el
	 *   tinte de marca tenue, no el "elemento activo" genérico — más coherente con el resto de
	 *   estados hover de acento del rediseño (chips, sidebar).
	 * - **Barra `--sheen` de fila en hover/foco (M2, mockup `aquelarre-dark.html` `.is-active
	 *   td:first-child::before`), decisión cerrada de David: (c) se dispara en `:hover` +
	 *   `:focus-within`, GENÉRICA a toda colección — NO reintroduce el concepto de fila
	 *   "seleccionada" que R3 dejó fuera de alcance (ver la nota de arriba), es puro feedback de
	 *   fila-bajo-el-puntero/foco, CSS-only. Vive en `::after` de la primera `<td>` (nunca `::before`:
	 *   ese pseudo-elemento ya lo usa el indicador de destino del arrastre, `.vega-row-drop-before`/
	 *   `-after` más abajo, y un elemento solo puede tener uno de cada) — `pointer-events: none`
	 *   para que la barra decorativa nunca intercepte el click/drag de la celda. Sin cambios de DOM
	 *   ni de `data-status`/texto: solo clases CSS nuevas, respeta la barrera de tokens (§3).
	 * - **Insignia de estado, píldora + punto (M2, mockup `.status`/`.status::before`)**: la
	 *   insignia pasa de rectangular (R3) a totalmente redondeada (`border-radius: 999px`) con un
	 *   punto de `currentColor` a la izquierda — mismo criterio que el mockup aprobado. Los
	 *   atributos `data-status`/`data-status-kind` y el TEXTO de la insignia no cambian (los e2e de
	 *   `posts` los localizan por ahí); solo cambia la forma vía CSS.
	 * - **Estados localizados (M4, config-driven, `ResolvedContentType.statusLabels`, mockup
	 *   `.status` con "Publicado"/"Borrador"/"Programado")**: capacidad OPT-IN por manifiesto (P2),
	 *   mismo criterio que `subtitleField` — un tipo que no declara `statusLabels` sigue pintando el
	 *   valor CRUDO (`posts`, entre otros, no lo declara: su DOM no cambia). Solo cambia el TEXTO de
	 *   la insignia (`contentType.statusLabels?.[descriptor.text] ?? descriptor.text`); el atributo
	 *   `data-status` (valor crudo, usado por los e2e) y el COLOR (`data-status-kind`, decidido por
	 *   `classifyStatusBadge` sobre el valor crudo, nunca sobre la etiqueta) no cambian.
	 * - **Subtítulo bajo el título (M3, config-driven, `ResolvedContentType.subtitleField`,
	 *   mockup `.cell-title .slug`)**: capacidad OPT-IN por manifiesto (P2) — un tipo que no
	 *   declara `subtitleField` no cambia su render (`posts`, entre otros, no lo declara). Vive en
	 *   el snippet `titleLink` (compartido entre las dos ramas de apertura, con/sin `listFields`):
	 *   además del enlace de título de siempre, pinta una línea secundaria en `--mono`/`--ink-3`
	 *   con el valor de `subtitleField` para ESE registro, buscado en `contentType.fields`
	 *   (TODOS los campos del tipo — el subtítulo no tiene por qué ser una columna de
	 *   `listFields`) — nunca si el valor está vacío (sin placeholder inventado). **Fallback a la
	 *   RUTA (modelo de páginas, tarea p1 `1dc63001`)**: sin `subtitleField` declarado, una colección
	 *   de páginas (`contentType.page`) enseña `page.pathField` en su lugar — la ruta es la
	 *   identidad pública del registro (encargo "crear y editar páginas" §5), MISMO render que un
	 *   subtítulo normal, sin ninguna clase/atributo nuevo.
	 * - **Fila seleccionada (`tr.sel` del mockup): FUERA DE ALCANCE (R3)**: el mockup pinta una
	 *   fila con `box-shadow: inset 2px 0 0 var(--accent)` sobre `--active` para representar
	 *   "seleccionada", pero Vega v1 no tiene ningún concepto de selección de fila en el listado
	 *   (sin checkboxes, sin acciones masivas) — no se inventa aquí; solo queda el hover.
	 * - **Densidad = MODO de P3, no control propio (Fase 4f, D-P4.10)**: el alto de fila
	 *   (`--row-h`) y el padding horizontal de celda/cabecera (`--cell-x`) son los tokens §7 de
	 *   densidad que conmutan solos con `data-density` en la raíz (`DensityToggle.svelte`, ya en
	 *   la topbar) — antes de 4f el padding horizontal usaba `--vega-space-gutter` (un espaciado
	 *   fijo, ajeno a la densidad); migrado a `--cell-x` para que "Compacta" también estreche la
	 *   celda, no solo el alto de fila (que ya usaba `--row-h` desde 4c).
	 * - **Acento como texto (F7w-b)**: el enlace de apertura y el indicador de orden pintan con
	 *   `--accent-text` (AA sobre papel), no `--accent` — ese es el relleno, no el color de texto.
	 * - **Borrado SIN columna dedicada (OLA 1 del rediseño visual, mockup `aquelarre-dark.html`
	 *   no la tiene, decisión de David), overlay sobre la última celda de datos**: hasta esta ola
	 *   había una `<th>`/`<td>` EXTRA al final de la fila; ahora el botón vive DENTRO de la última
	 *   `<td>` renderizada (la del último `ColumnSpec`, o la celda sintética de apertura si
	 *   `columns.length === 0`) como HERMANO del contenido normal de esa celda — nunca anidado en
	 *   la `<a>` de apertura (L-P4.15) cuando esa celda es además la de título, así un click en
	 *   "Borrar" sigue sin disparar `openRecord`. La celda se marca `.vega-cell-actions-anchor`
	 *   (`position: relative`) y el botón se pinta `position: absolute` pegado a su borde derecho,
	 *   tapando visualmente el contenido truncado de esa celda al revelarse (mismo lenguaje que el
	 *   hover-reveal de listados tipo GitHub) — SOLO si `contentType.permissions.delete` (una vista
	 *   del backend nunca ofrece borrar, y desde `#lote-shell` tampoco una colección cuya regla de
	 *   borrado esté vedada a esta sesión: `resolvePermissions` pliega las dos razones en una). Solo EMITE `onDeleteRequest` con el registro y el
	 *   mismo texto de apertura (`openText`, reutilizado, DRY) que ya se pinta en la celda-título —
	 *   así el diálogo de confirmación (`DeleteConfirm.svelte`, dueño de `+page.svelte`) puede decir
	 *   QUÉ se borra sin recalcularlo. Este componente sigue TONTO: no borra nada, no confirma nada,
	 *   no navega — eso es responsabilidad de `+page.svelte`.
	 * - **"Borrar" oculto hasta hover/foco (R3, decisión cerrada de David)**: sigue igual tras
	 *   quitar la columna (arriba) — presente en el DOM y en el orden de tabulación (nunca
	 *   `display:none`, que lo sacaría del árbol de foco), solo `opacity` conmutada por
	 *   `tbody tr:hover`/`tbody tr:focus-within`, así Tab lo alcanza igual y `:focus-within` de la
	 *   fila lo revela ANTES de que el propio botón tenga el foco (llega ya visible cuando el
	 *   usuario tabula hasta él).
	 * - **Marco de tarjeta (`.vega-record-table-wrap`), MOVIDO a `+page.svelte` (R4 del
	 *   rediseño)**: el borde/fondo/sombra de tarjeta que este wrapper llevaba (WIP sin commitear
	 *   de lote-1, absorbido aquí) suben un nivel — `+page.svelte` envuelve `<RecordTable>` +
	 *   `<Pagination>` en UNA sola tarjeta (mockup `.grid`: tabla + `.gridfoot` dentro del mismo
	 *   marco redondeado). Este wrapper conserva SOLO `overflow-x:auto` (el scroll horizontal de
	 *   tablas anchas, L-P4.2/Audit H1) — sin su propio borde/radio/sombra, que duplicaría el de
	 *   la tarjeta exterior.
	 * - **Reorder manual (`orderField`, core del CMS)**: cuando `reorderable` (calculado por
	 *   `+page.svelte`: solo con `contentType.orderField` resuelto, SIN sort/búsqueda/filtro
	 *   explícitos y con la colección entera en una página — reordenar a mano una vista parcial no
	 *   tiene sentido), se añade una columna EXTRA al principio de la fila (hermana de las de
	 *   datos) con un «asa» de arrastre por fila. El asa es un
	 *   `<button draggable="true">`: el ratón usa Drag and Drop nativo (`dragstart`/`dragover`/
	 *   `drop`, con `dragover` en la `<tr>` para permitir soltar ahí); el teclado usa
	 *   `ArrowUp`/`ArrowDown` con el foco en el asa — mueve la fila una posición de inmediato (sin
	 *   un paso previo de "agarrar" con Enter): más simple que el patrón grab/drop de dos fases y
	 *   perfectamente operable, un único control sirve a los dos gestos. Emite `onReorder(from,to)`
	 *   por índice dentro de `records`; este componente NO llama al puerto (sigue TONTO, mismo
	 *   reparto que `onDeleteRequest`) — `+page.svelte` decide qué persistir y cuándo recargar. El
	 *   `each` sigue keyed por `record.id` (§ya presente arriba), así que tras un reorder + reload
	 *   el nodo del asa que tenía el foco SIGUE siendo el mismo elemento DOM (mismo id), el foco no
	 *   se pierde.
	 * - **Glue de arrastre EXTRAÍDA (L7d, roadmap `mergedViews`)**: los cinco manejadores de evento
	 *   del asa (dragstart/dragover/drop/dragend/keydown) vivían inline aquí hasta L7d; ahora salen
	 *   de `createReorderDndController` (`reorder-dnd.ts`, módulo puro agnóstico de colección) para
	 *   que `MergedViewTable.svelte` los reutilice sin duplicar la maquinaria — comportamiento
	 *   observable IDÉNTICO al de antes de la extracción (mismos nombres de método, mismo cuerpo).
	 * - **Feedback visual del arrastre (#l12-ux, item 2)**: hasta ahora un `drag` en curso no
	 *   pintaba NADA distinto — ni la fila agarrada ni el destino se distinguían del resto.
	 *   `dragFromIndex`/`dragOverIndex` (`$state` LOCAL, espejo del `ReorderDragState` que notifica
	 *   el controlador vía `onDragStateChange`, `reorder-dnd.ts`) alimentan dos señales: (a) la fila
	 *   agarrada baja de opacidad y cambia el cursor a "grabbing" (`.vega-row-dragging`); (b) la
	 *   fila sobrevolada pinta un hueco (`box-shadow` inset de acento) en el borde por el que
	 *   entraría el registro al soltar — `dropIndicatorEdge` (puro, testeado en
	 *   `reorder-dnd.test.ts`) decide `'before'`/`'after'` según el sentido del arrastre. Puramente
	 *   presentacional: no toca `onReorder` ni la persistencia, que siguen exactamente igual.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { recordRoute } from '$lib/nav/routes';
	import { classifyStatusBadge, describeCell, type CellDescriptor } from './cell';
	import type { ColumnSpec } from './columns';
	import { isRightAlignedColumn } from './column-align';
	import { resolveTitleCellText } from './list-load';
	import { createReorderDndController, dropIndicatorEdge } from './reorder-dnd';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend/types';
	import type { ViewState } from './query-state';

	interface Props {
		contentType: ResolvedContentType;
		columns: ColumnSpec[];
		records: VegaRecord[];
		/** Orden activo de la vista (D-P4.6), o `null` si ninguna columna está ordenada. */
		sort: ViewState['sort'];
		/** Avisa de un click en la cabecera de `field` (siempre una columna `sortable`); quien
		 *  escucha decide el próximo estado (`cycleSort`) y navega. */
		onSort: (field: string) => void;
		/** Avisa de un click en "Borrar" de una fila (Fase 4e): `label` es el mismo texto que la
		 *  celda de apertura de esa fila (`openText`, reutilizado). Solo se invoca cuando
		 *  `contentType.permissions.delete` (la acción ni se pinta si no). Quien escucha decide
		 *  si abre la confirmación (`+page.svelte`, dueño del diálogo `DeleteConfirm`). */
		onDeleteRequest: (record: VegaRecord, label: string) => void;
		/** `true` cuando `+page.svelte` decide que ESTA vista se puede reordenar a mano (ver
		 *  cabecera): pinta la columna del asa de arrastre. `false` en cualquier otro caso, ni
		 *  siquiera se pinta la columna. */
		reorderable: boolean;
		/** Avisa de un reorder por arrastre o teclado (ver cabecera): `fromIndex`/`toIndex` son
		 *  posiciones dentro de `records`, en el orden ya renderizado. Solo se invoca cuando
		 *  `reorderable`. Quien escucha decide qué persistir (`computeReorder`) y cuándo recargar. */
		onReorder: (fromIndex: number, toIndex: number) => void;
	}

	let {
		contentType,
		columns,
		records,
		sort,
		onSort,
		onDeleteRequest,
		reorderable,
		onReorder
	}: Props = $props();

	const ctx = getVegaContext();

	/** Miniatura fija de listado (§4.4 del contrato P1): 28x28 recortada, best-effort — `memory`
	 *  la ignora siempre (`capabilities.thumbs: false`), PB la compila a su propia sintaxis. */
	const THUMB_SPEC = { width: 28, height: 28, fit: 'crop' as const };

	/** La columna que se pinta como enlace de apertura (L-P4.15, ver cabecera): la `isTitle` si
	 *  está entre las renderizadas; si no, la primera columna; si no hay ninguna, `null` (la fila
	 *  usa la celda sintética de abajo). Reactivo a `columns` (cambia con el tipo de contenido). */
	const openColumn = $derived(columns.find((c) => c.isTitle) ?? columns[0] ?? null);

	/** Texto de la celda de apertura para `record`: el de `openColumn` vía `resolveTitleCellText`
	 *  (fallback `list.untitled` si está vacía o no es texto), o el id si no hay ninguna columna
	 *  que pintar (caso límite `listFields: []`, sin datos de los que tirar). */
	function openText(record: VegaRecord): string {
		if (!openColumn) return record.id;
		const descriptor = describeCell(
			openColumn.field,
			record.values[openColumn.field.name] ?? null,
			ctx.locale
		);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	}

	/** Campo subtítulo ya resuelto (M3, `ResolvedContentType.subtitleField`, + modelo de páginas
	 *  tarea p1 `1dc63001`, encargo "crear y editar páginas" §5): `contentType.subtitleField` si el
	 *  manifiesto lo declara, y si no, `contentType.page.pathField` cuando la colección es de
	 *  páginas — "la lista de una colección de páginas enseña la ruta de cada registro, que es su
	 *  identidad pública" (el manifiesto SIGUE ganando si además declara `subtitleField` a propósito,
	 *  para no pisar una elección explícita). `null` si ninguna de las dos aplica. A propósito NO se
	 *  busca en `columns` (a diferencia de `openColumn`) — ni el subtítulo ni la ruta tienen por qué
	 *  ser una columna de `listFields`, así que se resuelve contra `contentType.fields` (TODOS los
	 *  campos del tipo, P2). */
	const subtitleField = $derived.by(() => {
		const name = contentType.subtitleField ?? contentType.page?.pathField ?? null;
		if (name === null) return null;
		return contentType.fields.find((f) => f.name === name) ?? null;
	});

	/** Texto de la línea secundaria de `record` (M3), o `null` si no hay `subtitleField` o su valor
	 *  está vacío (§ caso límite de `demo-seed.ts`, `blog_6`: sin línea secundaria, nunca un
	 *  placeholder inventado). Solo los `CellDescriptor` con `.text` cuentan como texto — `bool`/
	 *  `select-multi`/`relation`/`file`/`empty` no tienen una representación de una línea sensata
	 *  aquí y se ignoran (degradado silencioso, mismo criterio que el resto del módulo). */
	function subtitleText(record: VegaRecord): string | null {
		if (!subtitleField) return null;
		const descriptor = describeCell(
			subtitleField,
			record.values[subtitleField.name] ?? null,
			ctx.locale
		);
		switch (descriptor.kind) {
			case 'text':
			case 'number':
			case 'date':
			case 'mono':
			case 'richtext':
				return descriptor.text;
			default:
				return null;
		}
	}

	/** Abre el registro (L-P4.15), respetando los gestos nativos del navegador — mismo patrón que
	 *  `NavItem.svelte`: un click normal navega vía `nav.toRecord` (exit-guard incluido); un click
	 *  modificado (Cmd/Ctrl/Shift/central) sigue el `href` real y abre en pestaña/ventana nueva. */
	function openRecord(event: MouseEvent, id: string): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toRecord(contentType.name, id);
	}

	/** Valor ARIA del estado de orden de la columna `field` (D-P4.6, solo para cabeceras
	 *  `sortable`): `'ascending'`/`'descending'` si es la columna activa, `'none'` en cualquier
	 *  otro caso (incluida ninguna columna ordenada). */
	function ariaSortFor(field: string): 'ascending' | 'descending' | 'none' {
		if (!sort || sort.field !== field) return 'none';
		return sort.dir === 'asc' ? 'ascending' : 'descending';
	}

	// ————— Reorder manual (ver cabecera) —————

	/** Espejo LOCAL del `ReorderDragState` que notifica el controlador (#l12-ux, item 2): solo esto
	 *  necesita ser `$state` (runa, disponible aquí por ser `.svelte`) — el controlador en sí vive
	 *  en un módulo `.ts` plano, ver cabecera de `reorder-dnd.ts`. */
	let dragFromIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	/** Los cinco manejadores dragstart/dragover/drop/dragend/keydown, ahora en `reorder-dnd.ts`
	 *  (L7d, ver cabecera del módulo) — `records.length` se relee en cada `keydown` vía el getter,
	 *  nunca capturado una sola vez. `onReorder` se envuelve en una flecha (en vez de pasarlo tal
	 *  cual): es un prop reactivo (`$props()`), y pasarlo DIRECTO como argumento aquí capturaría su
	 *  valor INICIAL para siempre (aviso real de `svelte-check`, `state_referenced_locally`) — la
	 *  flecha difiere la lectura a dentro de un closure, evaluado en cada evento, igual que hacía
	 *  el código inline antes de esta extracción. */
	const dnd = createReorderDndController(
		(from, to) => onReorder(from, to),
		() => records.length,
		(state) => {
			dragFromIndex = state.fromIndex;
			dragOverIndex = state.overIndex;
		}
	);
</script>

<div class="vega-record-table-wrap">
	<table class="vega-record-table">
		<thead>
			<tr>
				{#if reorderable}
					<!-- Columna del asa de arrastre (ver cabecera): sin texto visible, con el rótulo
					     accesible en el propio asa de cada fila (mismo criterio que la columna de
					     apertura, que tampoco repite su cabecera por fila). -->
					<th scope="col" class="vega-reorder-header">
						<span class="vega-visually-hidden">{ctx.t('list.reorder.columnHeader')}</span>
					</th>
				{/if}
				{#if columns.length === 0}
					<!-- listFields vacío (caso límite, ver cabecera): sin columnas que etiquetar, pero la
					     fila sigue necesitando una celda de apertura sintética (abajo). -->
					<th scope="col"></th>
				{:else}
					{#each columns as column (column.field.name)}
						{#if column.sortable}
							<th
								scope="col"
								class:vega-th-right={isRightAlignedColumn(column)}
								aria-sort={ariaSortFor(column.field.name)}
							>
								<button
									type="button"
									class="vega-sort-button"
									aria-label={ctx.t('list.sort.ariaLabel', { column: column.field.label })}
									onclick={() => onSort(column.field.name)}
								>
									{column.field.label}
									{#if sort && sort.field === column.field.name}
										<!-- Glyph 1:1 con el mockup (`aquelarre-dark.html`, "Actualizado ↓"): flecha
										     de dirección, no el triángulo genérico de antes. -->
										<span aria-hidden="true" class="vega-sort-indicator">
											{sort.dir === 'asc' ? '↑' : '↓'}
										</span>
									{/if}
								</button>
							</th>
						{:else}
							<th scope="col" class:vega-th-right={isRightAlignedColumn(column)}>
								{column.field.label}
							</th>
						{/if}
					{/each}
				{/if}
				<!-- SIN columna de "Acciones" (ver cabecera del módulo): el mockup no la tiene; el
				     botón "Borrar" se pinta como overlay dentro de la última celda de DATOS de cada
				     fila (abajo), no aquí. -->
			</tr>
		</thead>
		<tbody>
			{#each records as record, i (record.id)}
				{@const dropEdge =
					dragOverIndex === i ? dropIndicatorEdge(dragFromIndex, dragOverIndex) : null}
				<tr
					class:vega-row-dragging={dragFromIndex === i}
					class:vega-row-drop-before={dropEdge === 'before'}
					class:vega-row-drop-after={dropEdge === 'after'}
					ondragover={reorderable ? (event) => dnd.handleDragOver(event, i) : undefined}
					ondrop={reorderable ? (event) => dnd.handleDrop(event, i) : undefined}
				>
					{#if reorderable}
						<td class="vega-reorder-cell">
							<button
								type="button"
								class="vega-reorder-handle"
								aria-label={ctx.t('list.reorder.handleLabel', { label: openText(record) })}
								draggable="true"
								ondragstart={(event) => dnd.handleDragStart(event, i)}
								ondragend={dnd.handleDragEnd}
								onkeydown={(event) => dnd.handleHandleKeydown(event, i)}
							>
								<span aria-hidden="true">⠿</span>
							</button>
						</td>
					{/if}
					{#if columns.length === 0}
						<!-- Única celda de la fila: también es la "última celda de datos", así que lleva el
						     overlay de borrado (ver cabecera del módulo). -->
						<td
							class="vega-cell-title"
							class:vega-cell-actions-anchor={contentType.permissions.delete}
						>
							{@render titleLink(record)}
							{#if contentType.permissions.delete}
								{@render deleteOverlay(record)}
							{/if}
						</td>
					{:else}
						{#each columns as column, colIndex (column.field.name)}
							{@const descriptor = describeCell(
								column.field,
								record.values[column.field.name] ?? null,
								ctx.locale
							)}
							{@const isOpenColumn = Boolean(
								openColumn && column.field.name === openColumn.field.name
							)}
							{@const isLastColumn = colIndex === columns.length - 1}
							<td
								class:vega-cell-title={isOpenColumn}
								class:vega-cell-mono={!isOpenColumn &&
									(descriptor.kind === 'date' || descriptor.kind === 'mono')}
								class:vega-cell-right={!isOpenColumn && isRightAlignedColumn(column)}
								class:vega-cell-actions-anchor={isLastColumn && contentType.permissions.delete}
							>
								{#if isOpenColumn}
									{@render titleLink(record)}
								{:else if column.isStatus && descriptor.kind === 'text'}
									<span
										class="vega-status-badge"
										data-status={descriptor.text}
										data-status-kind={classifyStatusBadge(descriptor.text)}
									>
										{contentType.statusLabels?.[descriptor.text] ?? descriptor.text}
									</span>
								{:else}
									{@render cellContent(descriptor, record, column)}
								{/if}
								{#if isLastColumn && contentType.permissions.delete}
									{@render deleteOverlay(record)}
								{/if}
							</td>
						{/each}
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#snippet titleLink(record: VegaRecord)}
	<!-- `contentType.permissions.view` (fix de code-review, `#lote-shell`): sin permiso de vista
	     ("viewRule: null" con "listRule" abierta — raro pero real en PocketBase, ver cabecera de
	     `/c/[type]/[id]`) la fila NO se ofrece como enlace — el mismo texto plano, sin `<a>` ni
	     `onclick`, así Tab ya no la trata como destino y el detalle no es alcanzable desde aquí. -->
	{#if contentType.permissions.view}
		<a
			href={recordRoute(contentType.name, record.id)}
			title={openText(record)}
			onclick={(event) => openRecord(event, record.id)}
		>
			{openText(record)}
		</a>
	{:else}
		<span class="vega-cell-title-text">{openText(record)}</span>
	{/if}
	<!-- Línea secundaria (M3, `subtitleField`, ver cabecera): SOLO si el tipo lo declara Y el
	     registro tiene valor (caso límite `blog_6`, ver demo-seed.ts). -->
	{@const subtitle = subtitleText(record)}
	{#if subtitle !== null}
		<span class="vega-cell-subtitle">{subtitle}</span>
	{/if}
{/snippet}

{#snippet deleteOverlay(record: VegaRecord)}
	<!-- Overlay de borrado (ver cabecera del módulo): HERMANO del contenido normal de la celda
	     ancla (`.vega-cell-actions-anchor`), nunca anidado en la `<a>` de `titleLink` — un click
	     aquí sigue sin disparar `openRecord`. -->
	<button
		type="button"
		class="vega-delete-button"
		data-action="delete"
		aria-label={ctx.t('list.delete.rowButtonLabel', { label: openText(record) })}
		onclick={() => onDeleteRequest(record, openText(record))}
	>
		{ctx.t('list.delete.rowButton')}
	</button>
{/snippet}

{#snippet cellContent(descriptor: CellDescriptor, record: VegaRecord, column: ColumnSpec)}
	{#if descriptor.kind === 'empty'}
		<span class="vega-cell-empty">—</span>
	{:else if descriptor.kind === 'text' || descriptor.kind === 'richtext' || descriptor.kind === 'mono'}
		<span title={descriptor.text}>{descriptor.text}</span>
	{:else if descriptor.kind === 'number' || descriptor.kind === 'date'}
		<span>{descriptor.text}</span>
	{:else if descriptor.kind === 'bool'}
		<span>{descriptor.value ? ctx.t('list.cell.yes') : ctx.t('list.cell.no')}</span>
	{:else if descriptor.kind === 'select-multi'}
		<span class="vega-chip-list">
			{#each descriptor.values as value (value)}
				<span class="vega-chip">{value}</span>
			{/each}
		</span>
	{:else if descriptor.kind === 'relation'}
		<span>{descriptor.count}</span>
	{:else if descriptor.kind === 'file'}
		{#if ctx.port.capabilities.thumbs}
			<span class="vega-file-thumbs">
				{#each descriptor.refs as ref (ref)}
					<img
						src={ctx.port.fileUrl(record, column.field.name, ref, { thumb: THUMB_SPEC })}
						alt=""
						width="28"
						height="28"
					/>
				{/each}
			</span>
		{:else}
			<!-- Sin miniaturas (memory, `capabilities.thumbs: false`, L-P4.5): degrada al/los
			     nombre(s) de fichero visibles, nunca en silencio. -->
			<span class="vega-file-names" title={descriptor.refs.join(', ')}>
				{descriptor.refs.join(', ')}
			</span>
		{/if}
	{/if}
{/snippet}

<style>
	/* Solo el scroll horizontal de tablas anchas (ver cabecera del módulo): el marco/tarjeta
	   (borde, radio, fondo, sombra) vive ahora en `+page.svelte`, que envuelve tabla + gridfoot
	   en UNA sola tarjeta (mockup `.grid`). */
	.vega-record-table-wrap {
		overflow-x: auto;
	}

	.vega-record-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	/* Cabecera SANS/uppercase (mockup final `aquelarre-dark.html` `thead th`): la etiqueta de
	   columna es un rótulo, NO un valor canónico — `--mono` se reserva para slugs/ids/counts/fechas
	   (firma del rediseño), así que aquí va la sans del sistema. Peso 650 + `letter-spacing` corto,
	   tinta `--ink-2` sobre el propio `--paper` de la tarjeta (sin banda `--surface-2`, la cabecera
	   se funde con el cuerpo y solo la separa el `border-bottom`). Antes: mono/`--ink-3`/`--surface-2`
	   (calcado de un mockup intermedio ya superado). */
	.vega-record-table thead th {
		padding: 0.5rem var(--cell-x);
		text-align: left;
		white-space: nowrap;
		font-size: 0.6875rem;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
		background: var(--paper);
		border-bottom: 1px solid var(--line-strong);
	}

	/* Cabecera de la columna ORDENADA en acento (mockup `thead th[aria-sort]`): solo la columna
	   activa (`ascending`/`descending`), nunca las `sortable` en reposo (`aria-sort="none"`). El
	   `.vega-sort-button` hereda el color (`color: inherit`), así que la etiqueta ENTERA se tiñe,
	   no solo el glifo `↓` (que ya iba en acento vía `.vega-sort-indicator`). */
	.vega-record-table thead th[aria-sort='ascending'],
	.vega-record-table thead th[aria-sort='descending'] {
		color: var(--accent-text);
	}

	.vega-sort-button {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
	}

	.vega-sort-button:hover {
		color: var(--ink);
	}

	/* En la columna ORDENADA la etiqueta ya va en acento (heredada del `th[aria-sort]` de arriba);
	   sin esto, el hover genérico de arriba la destiñe a `--ink` mientras el glifo `↓`/`↑` sigue en
	   acento (tono partido, justo en la única columna que debe leerse "encendida"). Mantiene el
	   acento al pasar el ratón por encima de la columna activa. */
	.vega-record-table thead th[aria-sort='ascending'] .vega-sort-button:hover,
	.vega-record-table thead th[aria-sort='descending'] .vega-sort-button:hover {
		color: var(--accent-text);
	}

	.vega-sort-indicator {
		font-size: 0.65rem;
		color: var(--accent-text);
	}

	/* Columnas fecha/número a la derecha (mockup `.cell-date`/`th.th-date`, `column-align.ts`): la
	   cabecera se alinea a la derecha para que el glifo de orden quede en el mismo lado que el valor
	   que ordena. Selector CALIFICADO a propósito (`.vega-record-table thead th.vega-th-right`): la
	   base `.vega-record-table thead th { text-align: left }` tiene mayor especificidad que un
	   `.vega-th-right` a secas y la ganaba en silencio → la cabecera fecha se quedaba a la izquierda
	   mientras su celda ya iba a la derecha (desalineadas). */
	.vega-record-table thead th.vega-th-right {
		text-align: right;
	}

	.vega-cell-right {
		text-align: right;
	}

	/* Técnica WCAG estándar de "visualmente oculto" (mismo criterio que `RecordForm.svelte`): 1×1px,
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

	/* Columna del asa de arrastre (ver cabecera): estrecha, sin truncar (el asa nunca lleva texto
	   visible que necesite elipsis). */
	.vega-reorder-header,
	.vega-reorder-cell {
		width: 2rem;
		max-width: none;
		overflow: visible;
		white-space: nowrap;
	}

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

	/* Fila "agarrada" (#l12-ux, item 2): baja de opacidad y cambia el cursor a "grabbing" mientras
	   dura el arrastre nativo — antes soltar/agarrar no distinguía visualmente ninguna fila del
	   resto. Solo `opacity`, nunca `visibility`/`display`: la fila sigue siendo el origen real del
	   `dataTransfer` del navegador durante todo el gesto. */
	.vega-record-table tbody tr.vega-row-dragging {
		opacity: 0.5;
		cursor: grabbing;
	}

	/* Indicador de destino (#l12-ux, item 2; ENRIQUECIDO — mockups aquelarre-*.html, firma de
	   David): un hueco en el borde de la fila sobrevolada — `dropIndicatorEdge` (`reorder-dnd.ts`)
	   decide el borde según el sentido del arrastre. Migrado del inset sólido `--accent` a un
	   trazo `--sheen` (mismo lenguaje que la barra de fila activa/seleccionada del mockup): un
	   `box-shadow` no admite gradiente, así que el hueco pasa a un pseudo-elemento posicionado
	   sobre cada `<td>` (no en el `<tr>`, mismo motivo de siempre: `border-collapse` puede
	   recortar un efecto pintado en la propia fila). */
	.vega-record-table tbody tr.vega-row-drop-before > td,
	.vega-record-table tbody tr.vega-row-drop-after > td {
		position: relative;
	}

	.vega-record-table tbody tr.vega-row-drop-before > td::before,
	.vega-record-table tbody tr.vega-row-drop-after > td::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--sheen);
	}

	.vega-record-table tbody tr.vega-row-drop-before > td::before {
		top: -1px;
	}

	.vega-record-table tbody tr.vega-row-drop-after > td::before {
		bottom: -1px;
	}

	.vega-record-table tbody tr {
		height: var(--row-h);
		border-bottom: 1px solid var(--line);
	}

	.vega-record-table tbody tr:last-child {
		border-bottom: none;
	}

	/* Hover de fila → `--accent-soft` (R3, ver cabecera; antes `--active`). */
	.vega-record-table tbody tr:hover {
		background: var(--accent-soft);
	}

	/* Barra `--sheen` de fila en hover/foco (M2, ver cabecera): `::after` de la primera celda (el
	   `::before` ya lo usa el indicador de destino del arrastre, `.vega-row-drop-before`/`-after`
	   más abajo) — decorativa, `pointer-events: none` para no interceptar el click/drag de la
	   celda. */
	.vega-record-table tbody tr:hover td:first-child,
	.vega-record-table tbody tr:focus-within td:first-child {
		position: relative;
	}

	.vega-record-table tbody tr:hover td:first-child::after,
	.vega-record-table tbody tr:focus-within td:first-child::after {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2.5px;
		background: var(--sheen);
		pointer-events: none;
	}

	.vega-record-table td {
		max-width: 24rem;
		padding: 0.4rem var(--cell-x);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		vertical-align: middle;
	}

	/* Columna-título (R3, mockup `td.t`): ~52% del ancho, título en tinta alta/peso medio — ya no
	   el `--accent-text` azul de antes (ese acento se reserva para relleno/estado activo). */
	.vega-cell-title {
		width: 52%;
		max-width: 0;
	}

	.vega-record-table td a {
		color: var(--ink-hi);
		font-weight: 500;
		text-decoration: none;
		/* Pulido (mockup `.cell-title a`): interlineado ajustado para respirar dentro de --row-h
		   cuando el título ocupa dos líneas visuales (título + metadato en un widget compuesto). */
		line-height: 1.3;
	}

	.vega-record-table td a:hover {
		text-decoration: underline;
	}

	/* Fila sin permiso de vista (ver `titleLink`): mismo tinte/peso que el enlace, pero SIN
	   `text-decoration`/`:hover` — no es una afordancia, es solo el texto de apertura de siempre. */
	.vega-cell-title-text {
		display: inline-block;
		color: var(--ink-hi);
		font-weight: 500;
		line-height: 1.3;
	}

	/* Línea secundaria bajo el título (M3, mockup `.cell-title .slug`): mono, tinta secundaria —
	   solo se pinta si `contentType.subtitleField` existe y el registro tiene valor. */
	.vega-cell-subtitle {
		display: block;
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 1px;
	}

	/* Celdas de fecha/mono (R3, mockup `td.mono`): `descriptor.kind` `'date'`/`'mono'`. */
	.vega-cell-mono {
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-2);
	}

	.vega-cell-empty {
		color: var(--ink-2);
	}

	/* Ancla del overlay de borrado (ver cabecera del módulo, "Borrado SIN columna dedicada"): la
	   ÚLTIMA celda de datos de la fila (o la sintética si `columns.length === 0`) se vuelve el
	   contenedor posicionado del botón — sin columna dedicada, a diferencia de antes. */
	.vega-cell-actions-anchor {
		position: relative;
	}

	/* "Borrar" oculto hasta hover/foco (R3, decisión de David — ver cabecera): `opacity`, nunca
	   `display:none`/`visibility:hidden`, para que Tab lo siga alcanzando. Overlay ABSOLUTO (ver
	   cabecera del módulo): pegado al borde derecho de `.vega-cell-actions-anchor`, por encima de
	   su contenido truncado (mismo lenguaje que el hover-reveal de listados tipo GitHub) — el
	   margen (`right`) deja hueco de sobra para el anillo de foco dentro del `overflow:hidden` de
	   la celda (nunca lo recorta). */
	.vega-delete-button {
		position: absolute;
		top: 50%;
		right: 0.35rem;
		transform: translateY(-50%);
		z-index: 1;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--danger);
		border-radius: 5px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.12s ease;
	}

	.vega-record-table tbody tr:hover .vega-delete-button,
	.vega-record-table tbody tr:focus-within .vega-delete-button {
		opacity: 1;
	}

	/* Fallback táctil (fix de code-review): en un dispositivo sin ratón ni foco por Tab (admin en
	   tablet) no hay `:hover` persistente que revele el botón — sin esto quedaría en `opacity:0`
	   permanente, alcanzable solo a ciegas. Con puntero grueso/sin hover, siempre visible. */
	@media (hover: none), (pointer: coarse) {
		.vega-delete-button {
			opacity: 1;
		}
	}

	.vega-delete-button:hover,
	.vega-delete-button:focus-visible {
		background: var(--danger);
		color: var(--surface);
	}

	/* Insignia de estado, píldora + punto (mockup final `aquelarre-dark.html` `.status`/
	   `.status::before`): SANS (una etiqueta de estado no es un valor canónico → sin `--mono`),
	   SIN borde (solo el fondo `-soft` semántico + el texto de color + el punto) y de alto fijo
	   24px. Color por `data-status-kind` (`classifyStatusBadge`, `cell.ts`) — `data-status` (valor
	   crudo) y el texto se conservan para no romper los selectores existentes de los tests. */
	.vega-status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: 24px;
		font-size: 0.72rem;
		font-weight: 600;
		border-radius: 999px;
		padding: 0 0.65rem;
		white-space: nowrap;
	}

	/* Punto de color a la izquierda (mockup `.status::before`): `currentColor` hereda el color
	   semántico ya fijado por `[data-status-kind]` más abajo, sin duplicar la paleta aquí. */
	.vega-status-badge::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.vega-status-badge[data-status-kind='pub'] {
		color: var(--success);
		background: var(--success-soft);
	}

	.vega-status-badge[data-status-kind='draft'] {
		color: var(--ink-2);
		background: var(--btn);
	}

	.vega-status-badge[data-status-kind='other'] {
		color: var(--info);
		background: var(--info-soft);
	}

	.vega-chip-list {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.vega-chip {
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 0.75rem;
	}

	.vega-file-thumbs {
		display: inline-flex;
		gap: 0.25rem;
	}

	.vega-file-thumbs img {
		border: 1px solid var(--line);
		border-radius: 4px;
		object-fit: cover;
	}

	.vega-file-names {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--ink-2);
	}
</style>
