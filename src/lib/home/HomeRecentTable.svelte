<script lang="ts">
	/**
	 * Tabla de «Lo último que editaste» de la portada (lámina 1 del lote 12): la tabla del listado
	 * con cuatro columnas FIJAS (Título, Tipo, Estado, Editado), sin ordenación, sin acción de
	 * fila y sin paginación. Cada fila lleva a editar su registro.
	 *
	 * **Por qué no es `RecordTable`**: esa tabla pinta las columnas de UN tipo de contenido
	 * (`ColumnSpec` sale de sus campos) y aquí cada fila puede ser de un tipo distinto, con dos
	 * columnas que no son campos de ninguno («Tipo» y la hora del guardado, que es local). Le
	 * faltan las props para eso, así que esta tabla repite su marcado y su CSS (mismas clases y
	 * mismos valores, igual que hace `MergedViewTable`) y reutiliza sus funciones: el texto del
	 * título (`resolveTitleCellText`), la píldora de estado (`describeStatusBadge`) y la fecha
	 * relativa (`formatDateCell`). En estrecho se comporta como cualquier listado: la columna Estado
	 * se oculta y el estado baja bajo el título.
	 *
	 * TONTA: recibe las filas ya resueltas (`recent-load.ts`); no consulta nada.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { formatDayTime } from '$lib/admin/format';
	import { describeCell, describeStatusBadge, formatDateCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import { recordRoute } from '$lib/nav/routes';
	import type { RecentRow } from './recent-load';

	interface Props {
		rows: RecentRow[];
		/** Instante de referencia de «hace 2 horas» (epoch ms). */
		now: number;
	}

	let { rows, now }: Props = $props();

	const ctx = getVegaContext();

	/** Título de la fila: el campo título del tipo, «(sin título)» si está vacío (como en el
	 *  listado) y el id si el tipo no tiene campo título del que tirar. */
	function titleText(row: RecentRow): string {
		const field = row.type.fields.find((candidate) => candidate.name === row.type.titleField);
		if (!field) return row.record.id;
		const descriptor = describeCell(field, row.record.values[field.name] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	}

	function badgeOf(row: RecentRow) {
		return describeStatusBadge(
			row.type,
			row.record.values,
			ctx.model.scheduledPublishing ?? 'unknown',
			ctx.locale,
			ctx.t
		);
	}

	/** Mismo gesto que la fila del listado: un clic normal navega por `nav.toRecord`; con
	 *  Cmd/Ctrl/Mayús o el botón central manda el `href` y abre en otra pestaña. */
	function openRecord(event: MouseEvent, row: RecentRow): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toRecord(row.type.name, row.record.id);
	}
</script>

<div class="vega-record-table-wrap">
	<table class="vega-record-table">
		<thead>
			<tr>
				<th scope="col">{ctx.t('home.recent.column.title')}</th>
				<th scope="col">{ctx.t('home.recent.column.type')}</th>
				<th scope="col" class="vega-col-status">{ctx.t('home.recent.column.status')}</th>
				<th scope="col" class="vega-th-right">{ctx.t('home.recent.column.edited')}</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (`${row.type.name}/${row.record.id}`)}
				{@const badge = badgeOf(row)}
				{@const title = titleText(row)}
				<tr>
					<td class="vega-cell-title">
						<!-- `recordRoute` (`nav/routes.ts`) ya antepone `base`; mismo patrón que `RecordTable`. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a
							href={recordRoute(row.type.name, row.record.id)}
							{title}
							onclick={(event) => openRecord(event, row)}
						>
							{title}
						</a>
						<!-- Copia del estado bajo el título, solo en estrecho (la columna se oculta ahí).
						     `aria-hidden`: el lector de pantalla ya lo recibe por la celda de su columna. -->
						{#if badge}
							<span
								class="vega-status-badge-inline"
								aria-hidden="true"
								data-inline-status-kind={badge.kind}
							>
								{badge.label}
							</span>
						{/if}
					</td>
					<td><span title={row.type.labelSingular}>{row.type.labelSingular}</span></td>
					<td class="vega-col-status">
						{#if badge}
							<span class="vega-status-badge" data-status={badge.raw} data-status-kind={badge.kind}>
								{badge.label}
							</span>
						{:else}
							<span class="vega-cell-empty">—</span>
						{/if}
					</td>
					<td class="vega-cell-mono vega-cell-right">
						<span title={formatDayTime(new Date(row.savedAt).toISOString(), ctx.locale)}>
							{formatDateCell(row.savedAt, ctx.locale, now)}
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	/* Todo este bloque repite, con los mismos valores, las reglas de `RecordTable.svelte` que usa
	   esta tabla (ver cabecera). Si allí cambia una, aquí también. */
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
		font-size: 0.6875rem;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
		background: var(--paper);
		border-bottom: 1px solid var(--line-strong);
	}

	.vega-record-table thead th.vega-th-right {
		text-align: right;
	}

	.vega-cell-right {
		text-align: right;
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

	.vega-cell-title {
		width: 52%;
		max-width: 0;
	}

	.vega-record-table td a {
		color: var(--ink-hi);
		font-weight: 500;
		text-decoration: none;
		line-height: 1.3;
	}

	.vega-record-table td a:hover {
		text-decoration: underline;
	}

	.vega-cell-mono {
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-2);
	}

	.vega-cell-empty {
		color: var(--ink-2);
	}

	.vega-status-badge,
	.vega-status-badge-inline {
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

	.vega-status-badge::before,
	.vega-status-badge-inline::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.vega-status-badge[data-status-kind='pub'],
	.vega-status-badge-inline[data-inline-status-kind='pub'] {
		color: var(--success);
		background: var(--success-soft);
	}

	.vega-status-badge[data-status-kind='draft'],
	.vega-status-badge-inline[data-inline-status-kind='draft'] {
		color: var(--ink-2);
		background: var(--btn);
	}

	.vega-status-badge[data-status-kind='other'],
	.vega-status-badge-inline[data-inline-status-kind='other'] {
		color: var(--info);
		background: var(--info-soft);
	}

	.vega-status-badge[data-status-kind='scheduled'],
	.vega-status-badge-inline[data-inline-status-kind='scheduled'] {
		color: var(--accent-text);
		background: var(--accent-soft);
	}

	.vega-status-badge[data-status-kind='overdue'],
	.vega-status-badge-inline[data-inline-status-kind='overdue'] {
		color: var(--warning);
		background: var(--warning-soft);
	}

	.vega-status-badge-inline {
		display: none;
	}

	@media (max-width: 640px) {
		.vega-record-table td.vega-cell-title {
			width: 14rem;
			min-width: 14rem;
			max-width: 14rem;
		}

		.vega-col-status {
			display: none;
		}

		.vega-status-badge-inline {
			display: inline-flex;
			margin-top: 0.3rem;
		}

		.vega-cell-title a {
			display: block;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	/* Objetivo táctil de 44 px con puntero basto: la fila, como en el listado. */
	@media (pointer: coarse) {
		.vega-record-table tbody tr {
			height: max(var(--row-h), 44px);
		}
	}
</style>
