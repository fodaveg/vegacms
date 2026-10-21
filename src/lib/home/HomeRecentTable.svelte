<script lang="ts">
	/** Registros recientes en tarjetas (lámina `inicio-v2.html`, nota 3); la imagen es decorativa y
	 * solo sale de un campo file de imagen declarado por el tipo. Las URL de archivo las construye
	 * el puerto activo.
	 *
	 * Sin imagen, una miniatura tipográfica: la inicial del tipo sobre el tenue del acento, en
	 * neutro si el registro es un borrador; los tipos de personas (icono `user`/`team`) llevan las
	 * iniciales del título en un círculo. El estado sale UNA vez: sobre la miniatura en escritorio
	 * y en la línea de datos en móvil (la otra copia no se pinta, tampoco para lectores). */
	import { getVegaContext } from '$lib/app-context';
	import { formatDayTime } from '$lib/admin/format';
	import { selectThumbSpec } from '$lib/backend/thumb-select';
	import { describeCell, describeStatusBadge, formatDateCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import { recordRoute } from '$lib/nav/routes';
	import type { RecentRow } from './recent-load';

	let { rows, now }: { rows: RecentRow[]; now: number } = $props();
	const ctx = getVegaContext();
	const untitled = ctx.t('list.untitled');

	function titleText(row: RecentRow): string {
		const field = row.type.fields.find((candidate) => candidate.name === row.type.titleField);
		if (!field) return row.record.id;
		return resolveTitleCellText(
			describeCell(field, row.record.values[field.name] ?? null, ctx.locale),
			untitled
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

	/** Tipo de personas: lo dice su icono del manifiesto, no el nombre de la colección. */
	function isPerson(row: RecentRow): boolean {
		return row.type.icon === 'user' || row.type.icon === 'team';
	}

	/** Iniciales de un nombre («Marta Ferrer Soler» → «MF»), o la inicial del tipo si no hay. */
	function initialsOf(title: string, row: RecentRow): string {
		const words = title === untitled ? [] : title.split(/\s+/).filter(Boolean);
		const letters = words
			.slice(0, 2)
			.map((word) => word.charAt(0).toLocaleUpperCase(ctx.locale))
			.join('');
		return letters || typeInitial(row);
	}

	function typeInitial(row: RecentRow): string {
		return row.type.labelSingular.charAt(0).toLocaleUpperCase(ctx.locale) || 'V';
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
		{@const person = isPerson(row)}
		<a
			class="card"
			class:continue={index === 0}
			href={recordRoute(row.type.name, row.record.id)}
			onclick={(event) => openRecord(event, row)}
			{title}
		>
			<div class="thumb">
				{#if person}
					<div class="fallback person" aria-hidden="true">
						<span>{initialsOf(title, row)}</span>
					</div>
				{:else}
					<div class="fallback" class:neutral={badge?.kind === 'draft'} aria-hidden="true">
						{typeInitial(row)}
					</div>
				{/if}
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
				<h3 class:untitled={title === untitled}>{title}</h3>
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
		color: var(--ink-hi);
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
		font: 700 56px / 1 var(--display);
		font-variation-settings: 'opsz' 96;
		letter-spacing: -0.04em;
	}
	.fallback.neutral {
		background: var(--btn);
		color: var(--ink-3);
	}
	.fallback.person {
		background: linear-gradient(135deg, var(--info-soft), var(--surface));
	}
	/* Iniciales sobre el semántico informativo: `surface` sobre `info` es un par del gate AA. */
	.fallback.person span {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: var(--info);
		color: var(--surface);
		font: 600 20px / 1 var(--sans);
		letter-spacing: 0.02em;
	}
	img {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* Píldora con punto (lámina `.pill`): el color del estado tiñe texto y punto. */
	.pill,
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: var(--r-pill);
		font-weight: 500;
		white-space: nowrap;
		color: var(--ink-2);
	}
	.pill::before,
	.status::before {
		content: '';
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: currentColor;
	}
	.pill {
		position: absolute;
		top: 10px;
		left: 10px;
		height: 22px;
		box-sizing: border-box;
		padding: 0 9px 0 7px;
		background: var(--surface);
		box-shadow: var(--shadow-card);
		font-size: var(--fs-12);
	}
	[data-status-kind='pub'] {
		color: var(--success);
	}
	[data-status-kind='scheduled'] {
		color: var(--accent-text);
	}
	[data-status-kind='overdue'] {
		color: var(--warning);
	}
	[data-status-kind='other'] {
		color: var(--info);
	}
	.continue-label {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 2px 8px;
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--accent-text);
		font-size: 11px;
		font-weight: 600;
	}
	.card-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		padding: 12px 14px 14px;
	}
	h3 {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		margin: 0;
		overflow: hidden;
		font-size: var(--fs-15);
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.3;
	}
	h3.untitled {
		color: var(--ink-2);
		font-style: italic;
		font-weight: 400;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		color: var(--ink-2);
		font-size: var(--fs-12);
	}
	.meta > span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* En escritorio el estado va sobre la miniatura; esta copia es la de móvil. */
	.status {
		display: none;
		height: 18px;
		padding: 0 7px 0 6px;
		background: var(--btn);
		font-size: 11px;
	}
	.status[data-status-kind='pub'] {
		background: var(--success-soft);
	}
	.status[data-status-kind='scheduled'] {
		background: var(--accent-soft);
	}
	.status[data-status-kind='overdue'] {
		background: var(--warning-soft);
	}
	.status[data-status-kind='other'] {
		background: var(--info-soft);
	}
	.when {
		margin-left: auto;
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
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
	@media (max-width: 760px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
		.card {
			flex-direction: row;
			align-items: stretch;
		}
		.thumb {
			flex: none;
			width: 96px;
			aspect-ratio: auto;
		}
		.fallback {
			font-size: 32px;
		}
		.fallback.person span {
			width: 40px;
			height: 40px;
			font-size: 14px;
		}
		.pill,
		.continue-label {
			display: none;
		}
		.status {
			display: inline-flex;
		}
		.card-body {
			flex: 1;
			justify-content: center;
			padding: 10px 12px;
		}
		h3 {
			font-size: var(--fs-14);
		}
		.meta {
			flex-wrap: wrap;
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
