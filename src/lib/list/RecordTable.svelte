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
	 * - **Insignia de estado (D-P4.8)**: la columna `isStatus` con valor literal `draft`/
	 *   `published` se pinta como insignia mono con los tokens `--vega-color-warning`/`-success`;
	 *   cualquier otro literal de esa misma columna (un `select` con más opciones que las dos de
	 *   la convención) se pinta como texto normal, sin insignia.
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
	 * - **Fila en hover (F7w-b)**: usa `--active` (rol dedicado §3 para fila/elemento activo), no
	 *   `--surface-2` — el resaltado de fila es semánticamente "elemento activo", no una elevación.
	 * - **Densidad = MODO de P3, no control propio (Fase 4f, D-P4.10)**: el alto de fila
	 *   (`--row-h`) y el padding horizontal de celda/cabecera (`--cell-x`) son los tokens §7 de
	 *   densidad que conmutan solos con `data-density` en la raíz (`DensityToggle.svelte`, ya en
	 *   la topbar) — antes de 4f el padding horizontal usaba `--vega-space-gutter` (un espaciado
	 *   fijo, ajeno a la densidad); migrado a `--cell-x` para que "Compacta" también estreche la
	 *   celda, no solo el alto de fila (que ya usaba `--row-h` desde 4c).
	 * - **Acento como texto (F7w-b)**: el enlace de apertura y el indicador de orden pintan con
	 *   `--accent-text` (AA sobre papel), no `--accent` — ese es el relleno, no el color de texto.
	 * - **Columna de acciones (Fase 4e, borrado, L-P4.9/L-P4.11)**: una `<th>`/`<td>` EXTRA al
	 *   final de la fila, SOLO si `!contentType.readonly` (un tipo `readonly`/vista nunca ofrece
	 *   borrar, ni el botón ni la columna) — presente en las dos ramas del marcado (con y sin
	 *   `columns.length === 0`, para no dejar el caso límite sin acción). El botón vive en SU
	 *   PROPIA `<td>`, nunca dentro de la `<a>` de apertura (L-P4.15): son celdas hermanas, así un
	 *   click en "Borrar" nunca dispara `openRecord` (ni falta `preventDefault`/`stopPropagation`
	 *   para lograrlo — la separación estructural ya lo garantiza). Solo EMITE `onDeleteRequest`
	 *   con el registro y el mismo texto de apertura (`openText`, reutilizado, DRY) que ya se
	 *   pinta en la celda-título — así el diálogo de confirmación (`DeleteConfirm.svelte`, dueño
	 *   de `+page.svelte`) puede decir QUÉ se borra sin recalcularlo. Este componente sigue TONTO:
	 *   no borra nada, no confirma nada, no navega — eso es responsabilidad de `+page.svelte`.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { recordRoute } from '$lib/nav/routes';
	import { describeCell, type CellDescriptor } from './cell';
	import type { ColumnSpec } from './columns';
	import { resolveTitleCellText } from './list-load';
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
		 *  `!contentType.readonly` (la columna de acciones ni existe si no). Quien escucha decide
		 *  si abre la confirmación (`+page.svelte`, dueño del diálogo `DeleteConfirm`). */
		onDeleteRequest: (record: VegaRecord, label: string) => void;
	}

	let { contentType, columns, records, sort, onSort, onDeleteRequest }: Props = $props();

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
</script>

<div class="vega-record-table-wrap">
	<table class="vega-record-table">
		<thead>
			<tr>
				{#if columns.length === 0}
					<!-- listFields vacío (caso límite, ver cabecera): sin columnas que etiquetar, pero la
					     fila sigue necesitando una celda de apertura sintética (abajo). -->
					<th scope="col"></th>
				{:else}
					{#each columns as column (column.field.name)}
						{#if column.sortable}
							<th scope="col" aria-sort={ariaSortFor(column.field.name)}>
								<button
									type="button"
									class="vega-sort-button"
									aria-label={ctx.t('list.sort.ariaLabel', { column: column.field.label })}
									onclick={() => onSort(column.field.name)}
								>
									{column.field.label}
									{#if sort && sort.field === column.field.name}
										<span aria-hidden="true" class="vega-sort-indicator">
											{sort.dir === 'asc' ? '▲' : '▼'}
										</span>
									{/if}
								</button>
							</th>
						{:else}
							<th scope="col">{column.field.label}</th>
						{/if}
					{/each}
				{/if}
				{#if !contentType.readonly}
					<th scope="col">{ctx.t('list.actions.header')}</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each records as record (record.id)}
				<tr>
					{#if columns.length === 0}
						<td>
							<a
								href={recordRoute(contentType.name, record.id)}
								title={openText(record)}
								onclick={(event) => openRecord(event, record.id)}
							>
								{openText(record)}
							</a>
						</td>
					{:else}
						{#each columns as column (column.field.name)}
							{@const descriptor = describeCell(
								column.field,
								record.values[column.field.name] ?? null,
								ctx.locale
							)}
							<td>
								{#if openColumn && column.field.name === openColumn.field.name}
									<a
										href={recordRoute(contentType.name, record.id)}
										title={openText(record)}
										onclick={(event) => openRecord(event, record.id)}
									>
										{openText(record)}
									</a>
								{:else if column.isStatus && descriptor.kind === 'text' && (descriptor.text === 'draft' || descriptor.text === 'published')}
									<span class="vega-status-badge" data-status={descriptor.text}>
										{descriptor.text}
									</span>
								{:else}
									{@render cellContent(descriptor, record, column)}
								{/if}
							</td>
						{/each}
					{/if}
					{#if !contentType.readonly}
						<!-- Celda HERMANA de la de apertura, nunca anidada en su `<a>` (ver cabecera): un
						     click aquí no dispara `openRecord` porque no está dentro de ese enlace. -->
						<td class="vega-record-actions">
							<button
								type="button"
								class="vega-delete-button"
								data-action="delete"
								aria-label={ctx.t('list.delete.rowButtonLabel', { label: openText(record) })}
								onclick={() => onDeleteRequest(record, openText(record))}
							>
								{ctx.t('list.delete.rowButton')}
							</button>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

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
	.vega-record-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: 8px;
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
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--ink-2);
		border-bottom: 1px solid var(--line);
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

	.vega-sort-indicator {
		font-size: 0.65rem;
		color: var(--accent-text);
	}

	.vega-record-table tbody tr {
		height: var(--row-h);
		border-bottom: 1px solid var(--line);
	}

	.vega-record-table tbody tr:last-child {
		border-bottom: none;
	}

	.vega-record-table tbody tr:hover {
		background: var(--active);
	}

	.vega-record-table td {
		max-width: 24rem;
		padding: 0.4rem var(--cell-x);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		vertical-align: middle;
	}

	.vega-record-table td a {
		color: var(--accent-text);
		font-weight: 500;
		text-decoration: none;
	}

	.vega-record-table td a:hover {
		text-decoration: underline;
	}

	.vega-cell-empty {
		color: var(--ink-2);
	}

	/* Columna de acciones (Fase 4e): no trunca como el resto de `td` (el botón nunca lleva texto
	   largo) y no queda pegada a la última columna de datos. */
	.vega-record-actions {
		max-width: none;
		overflow: visible;
		white-space: nowrap;
		text-align: right;
	}

	.vega-delete-button {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--danger);
		border-radius: 6px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	.vega-delete-button:hover {
		background: var(--danger);
		color: var(--surface);
	}

	.vega-status-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.5rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.vega-status-badge[data-status='published'] {
		color: var(--success);
	}

	.vega-status-badge[data-status='draft'] {
		color: var(--warning);
		background: var(--warning-soft);
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
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
</style>
