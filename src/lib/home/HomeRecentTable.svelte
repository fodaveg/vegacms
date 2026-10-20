<script lang="ts">
	/** Registros recientes en tarjetas; la imagen es decorativa y solo sale de un campo file
	 * de imagen declarado por el tipo. Las URL de archivo las construye el puerto activo. */
	import { getVegaContext } from '$lib/app-context';
	import { formatDayTime } from '$lib/admin/format';
	import { selectThumbSpec } from '$lib/backend/thumb-select';
	import { describeCell, describeStatusBadge, formatDateCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import { recordRoute } from '$lib/nav/routes';
	import type { RecentRow } from './recent-load';

	let { rows, now }: { rows: RecentRow[]; now: number } = $props();
	const ctx = getVegaContext();

	function titleText(row: RecentRow): string {
		const field = row.type.fields.find((candidate) => candidate.name === row.type.titleField);
		if (!field) return row.record.id;
		return resolveTitleCellText(
			describeCell(field, row.record.values[field.name] ?? null, ctx.locale),
			ctx.t('list.untitled')
		);
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

	/** Solo pide un thumb declarado; si el campo no lo declara, usa el 100×100 universal de PB. */
	function imageUrl(row: RecentRow): string | null {
		const name = row.type.social?.imageField;
		if (!name) return null;
		const value = row.record.values[name];
		const filename = Array.isArray(value) ? value[0] : value;
		if (typeof filename !== 'string' || !/\.(avif|gif|jpe?g|png|webp)$/i.test(filename))
			return null;
		const field = row.type.fields.find((candidate) => candidate.name === name);
		const declaredThumbs = field?.schema.type === 'file' ? field.schema.thumbs : undefined;
		const opts = ctx.port.capabilities.thumbs
			? { thumb: selectThumbSpec({ width: 400, height: 250, fit: 'crop' }, declaredThumbs) }
			: undefined;
		return ctx.port.fileUrl(row.record, name, filename, opts);
	}

	/** Navegación con guard de salida; click modificado conserva el href real. */
	function openRecord(event: MouseEvent, row: RecentRow): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		ctx.nav.toRecord(row.type.name, row.record.id);
	}
</script>

<div class="cards">
	{#each rows as row, index (`${row.type.name}/${row.record.id}`)}
		{@const title = titleText(row)}
		{@const badge = badgeOf(row)}
		{@const image = imageUrl(row)}
		<a
			class="card"
			class:continue={index === 0}
			href={recordRoute(row.type.name, row.record.id)}
			onclick={(event) => openRecord(event, row)}
			{title}
		>
			<div class="thumb">
				<div class="fallback" aria-hidden="true">
					{row.type.labelSingular.charAt(0).toLocaleUpperCase(ctx.locale) || 'V'}
				</div>
				{#if image}<img
						src={image}
						alt=""
						loading="lazy"
						decoding="async"
						onerror={(event) => {
							(event.currentTarget as HTMLImageElement).hidden = true;
						}}
					/>{/if}
				{#if badge}<span class="pill" data-status-kind={badge.kind}>{badge.label}</span>{/if}
				{#if index === 0}<span class="continue-label">{ctx.t('home.recent.continue')}</span>{/if}
			</div>
			<div class="card-body">
				<h3>{title}</h3>
				<div class="meta">
					<span>{row.type.labelSingular}</span>
					{#if badge}<span class="status" data-status-kind={badge.kind}>{badge.label}</span>{/if}
					<time
						class="when"
						datetime={new Date(row.savedAt).toISOString()}
						title={formatDayTime(new Date(row.savedAt).toISOString(), ctx.locale)}
						>{formatDateCell(row.savedAt, ctx.locale, now)}</time
					>
				</div>
			</div>
		</a>
	{/each}
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		color: var(--ink);
		text-decoration: none;
		transition:
			transform 0.15s,
			box-shadow 0.15s;
	}
	.card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-raised);
	}
	.card.continue {
		border-color: var(--accent-line);
		box-shadow:
			0 0 0 3px var(--accent-soft),
			var(--shadow-card);
	}
	.thumb {
		position: relative;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		background: var(--btn);
	}
	.fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent-text);
		font: 700 56px/1 var(--display);
	}
	img {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.pill,
	.continue-label {
		position: absolute;
		top: 10px;
		padding: 3px 9px;
		border-radius: var(--r-pill);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		font-size: var(--fs-12);
		font-weight: 600;
	}
	.pill {
		left: 10px;
		color: var(--ink-2);
	}
	.pill[data-status-kind='published'] {
		color: var(--success);
	}
	.pill[data-status-kind='scheduled'] {
		color: var(--accent-text);
	}
	.pill[data-status-kind='overdue'] {
		color: var(--warning);
	}
	.continue-label {
		right: 10px;
		color: var(--accent-text);
	}
	.card-body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
		padding: 12px 14px 14px;
	}
	h3 {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		min-height: 2.6em;
		margin: 0;
		overflow: hidden;
		font-size: var(--fs-15);
		font-weight: 600;
		line-height: 1.3;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
		color: var(--ink-2);
		font-size: var(--fs-12);
	}
	.meta > span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status {
		padding: 1px 6px;
		border-radius: var(--r-pill);
		background: var(--btn);
		white-space: nowrap;
	}
	.status[data-status-kind='published'] {
		color: var(--success);
		background: var(--success-soft);
	}
	.status[data-status-kind='scheduled'] {
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.status[data-status-kind='overdue'] {
		color: var(--warning);
		background: var(--warning-soft);
	}
	.when {
		margin-left: auto;
		font-family: var(--mono);
		white-space: nowrap;
	}
	@media (max-width: 1180px) {
		.cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 900px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.cards {
			grid-template-columns: 1fr;
			gap: var(--sp-2);
		}
		.card {
			flex-direction: row;
		}
		.thumb {
			flex: 0 0 96px;
			aspect-ratio: 1;
		}
		.fallback {
			font-size: var(--fs-36);
		}
		.pill {
			display: none;
		}
		.continue-label {
			top: auto;
			bottom: 6px;
			right: 6px;
			font-size: 10px;
		}
		.card-body {
			flex: 1;
			justify-content: center;
		}
		h3 {
			min-height: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
		.card:hover {
			transform: none;
		}
	}
</style>
