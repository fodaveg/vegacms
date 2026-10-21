<script lang="ts">
	/** Bento de Inicio: cifras independientes y estado global del sitio cuando se puede conocer.
	 *
	 * Tarjeta de marca (lámina `inicio-v2.html`): el degradado del tema SOLO cuando hay algo que
	 * hacer (cambios sin publicar, o una actualización en curso); al día se calma con su punto
	 * verde; un fallo pide atención sin el degradado; carga, error y «no se sabe» esperan en
	 * superficie normal. «Publicar ahora» es la variante `home` de `PublishButton`: el mismo
	 * flujo que la barra, que nunca afirma haber guardado nada.
	 *
	 * Sin build anunciado no hay tarjeta de marca y el bento son solo los tiles, a todo el ancho
	 * (4×2 a 1440 px): la columna de 360 px es la de la tarjeta, no la de los tiles. */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { BuildState, BuildStatus } from '$lib/backend/build-client';
	import Icon from '$lib/icons/Icon.svelte';
	import PublishButton from '$lib/shell/PublishButton.svelte';
	import {
		isStaleSiteUpdateStatus,
		onSiteUpdateStatus,
		siteUpdateStatusKey,
		type SiteUpdateStatus
	} from '$lib/shell/site-update';
	import {
		formatPublishedAt,
		loadPendingCount,
		loadUnpublishedStatus,
		pendingCards,
		type PendingCard,
		type PendingKind
	} from './pending';

	const ctx = getVegaContext();
	const labels: Record<PendingKind, string> = {
		drafts: 'home.pending.drafts',
		scheduled: 'home.pending.scheduled',
		description: 'home.pending.description',
		'media-alt': 'home.pending.mediaAlt'
	};
	const cards = pendingCards(ctx.model);
	const hasBuild = Boolean(ctx.port.buildApiUrl);
	let counts = $state<Record<string, number | 'loading' | 'error'>>({});
	let unpublished = $state<
		| 'loading'
		| 'error'
		| {
				hasChanges: boolean | null;
				lastPublishedAt: string | null;
				startedAt: string | null;
				finishedAt: string | null;
				state: BuildState;
		  }
		| null
	>(hasBuild ? 'loading' : null);
	const lastPublished = $derived.by(() => {
		if (!unpublished || typeof unpublished === 'string' || !unpublished.lastPublishedAt)
			return null;
		return formatPublishedAt(unpublished.lastPublishedAt, ctx.locale);
	});
	/** Tono de la tarjeta: `brand` (hay algo que hacer), `calm` (al día), `alert` (falló) o
	 *  `quiet` (cargando, error o no se sabe: superficie normal, punto neutro). */
	const tone = $derived.by((): 'brand' | 'calm' | 'alert' | 'quiet' => {
		if (unpublished === null || typeof unpublished === 'string') return 'quiet';
		if (unpublished.state === 'failed') return 'alert';
		if (unpublished.state === 'running') return 'brand';
		if (unpublished.hasChanges === true) return 'brand';
		if (unpublished.hasChanges === false && unpublished.lastPublishedAt !== null) return 'calm';
		return 'quiet';
	});
	let alive = false;
	let publicationGeneration = 0;
	let observedStatusKey: string | null = null;
	let latestStatus: SiteUpdateStatus | null = null;

	/** Reintenta una cifra sin bloquear las demás tarjetas. */
	async function loadCard(card: PendingCard): Promise<void> {
		counts[card.key] = 'loading';
		try {
			const value = await loadPendingCount(ctx.port, card);
			if (alive) counts[card.key] = value;
		} catch {
			if (alive) counts[card.key] = 'error';
		}
	}

	/** Un resultado desconocido no afirma que el sitio esté al día. */
	async function loadUnpublished(observedStatus?: BuildStatus): Promise<void> {
		if (!hasBuild) return;
		const generation = ++publicationGeneration;
		unpublished = observedStatus
			? {
					hasChanges: null,
					lastPublishedAt: observedStatus.lastPublishedAt,
					startedAt: observedStatus.startedAt,
					finishedAt: observedStatus.finishedAt,
					state: observedStatus.state
				}
			: 'loading';
		try {
			const value = await loadUnpublishedStatus(
				ctx.port,
				ctx.model,
				ctx.session.token,
				undefined,
				observedStatus
			);
			if (alive && generation === publicationGeneration) {
				unpublished = value;
				if (value) {
					latestStatus = value;
					observedStatusKey = siteUpdateStatusKey(value);
				}
			}
		} catch {
			if (alive && generation === publicationGeneration) unpublished = 'error';
		}
	}

	onMount(() => {
		alive = true;
		for (const card of cards) void loadCard(card);
		void loadUnpublished();
		const unsubscribe = ctx.port.buildApiUrl
			? onSiteUpdateStatus(ctx.port.buildApiUrl, (status) => {
					const key = siteUpdateStatusKey(status);
					if (key === observedStatusKey) return;
					if (latestStatus && isStaleSiteUpdateStatus(latestStatus, status)) return;
					latestStatus = status;
					observedStatusKey = key;
					void loadUnpublished(status);
				})
			: null;
		return () => {
			alive = false;
			publicationGeneration++;
			unsubscribe?.();
		};
	});

	function labelOf(card: PendingCard): string {
		return ctx.t(labels[card.kind], { label: card.typeLabel ?? '' });
	}

	/** Color con significado (lámina, nota 2): ámbar en calidad, índigo en programadas. */
	function toneOf(card: PendingCard): 'warn' | 'scheduled' | null {
		if (card.kind === 'description' || card.kind === 'media-alt') return 'warn';
		if (card.kind === 'scheduled') return 'scheduled';
		return null;
	}
</script>

{#if cards.length > 0 || hasBuild}
	<section
		class="vega-home-bento"
		class:with-brand={hasBuild}
		aria-label={ctx.t('home.pending.title')}
	>
		{#if hasBuild}
			<div
				class="brandcard"
				class:calm={tone === 'calm'}
				class:alert={tone === 'alert'}
				class:quiet={tone === 'quiet'}
				data-pending="unpublished"
				aria-busy={unpublished === 'loading'}
			>
				<p class="eyebrow">
					<span class="dot" aria-hidden="true"><span class="ring"></span></span>{ctx.t(
						'home.pending.unpublished'
					)}
				</p>
				{#if unpublished === 'loading'}
					<h2 class="sr-only">{ctx.t('common.loading')}</h2>
					<span class="sk sk-title" aria-hidden="true"></span>
					<span class="sk sk-line" aria-hidden="true"></span>
				{:else if unpublished === 'error'}
					<h2>{ctx.t('home.pending.unpublishedError')}</h2>
					<div class="acts">
						<button type="button" class="retry" onclick={() => loadUnpublished()}
							><Icon id="update" size={16} strokeWidth={1.6} />{ctx.t('common.retry')}</button
						>
					</div>
				{:else if unpublished?.state === 'failed'}
					<h2>{ctx.t('home.pending.buildFailed')}</h2>
				{:else if unpublished?.state === 'running'}
					<h2>{ctx.t('home.pending.buildRunning')}</h2>
				{:else if unpublished === null || unpublished.hasChanges === null}
					<h2>{ctx.t('home.pending.unpublishedUnknown')}</h2>
				{:else if unpublished.hasChanges === false && unpublished.lastPublishedAt === null}
					<h2>{ctx.t('home.pending.unpublishedUnknown')}</h2>
				{:else}
					<h2>
						{ctx.t(
							unpublished.hasChanges ? 'home.pending.unpublishedHeadline' : 'home.pending.upToDate'
						)}
					</h2>
				{/if}
				{#if lastPublished}<p class="published-at">
						{ctx.t('home.pending.lastPublished', { date: lastPublished })}
					</p>{/if}
				{#if tone === 'brand' || tone === 'alert'}
					<!-- La variante `home` conserva comprobaciones, estados y permisos del botón de la barra. -->
					<div class="acts"><PublishButton home /></div>
				{/if}
			</div>
		{/if}
		{#if cards.length > 0}
			<ul class="tiles">
				{#each cards as card (card.key)}
					{@const count = counts[card.key] ?? 'loading'}
					{@const cardTone = toneOf(card)}
					<li>
						{#if card.href !== null && typeof count === 'number'}
							<a
								class="tile"
								class:zero={count === 0}
								class:warn={cardTone === 'warn'}
								class:scheduled={cardTone === 'scheduled'}
								href={card.href}
								data-pending={card.key}
								data-zero={count === 0}
							>
								<strong>{new Intl.NumberFormat(ctx.locale).format(count)}</strong>
								<span>{labelOf(card)}</span>
								<span class="arrow" aria-hidden="true"
									><Icon id="arrow-up-right" size={14} strokeWidth={1.6} /></span
								>
							</a>
						{:else}
							<div
								class="tile"
								class:zero={count === 0}
								class:warn={cardTone === 'warn'}
								class:scheduled={cardTone === 'scheduled'}
								class:skeleton={count === 'loading'}
								data-pending={card.key}
								data-zero={count === 0}
								aria-busy={count === 'loading'}
							>
								{#if count === 'error'}
									<strong>—</strong><span>{labelOf(card)}</span>
									<button
										type="button"
										onclick={() => loadCard(card)}
										aria-label={ctx.t('home.pending.retry', { label: labelOf(card) })}
										><Icon id="update" size={16} strokeWidth={1.6} /></button
									>
								{:else if count === 'loading'}
									<strong class="sk sk-val" aria-hidden="true"></strong>
									<span class="sk sk-lab" aria-hidden="true"></span>
									<span class="sr-only">{labelOf(card)}</span>
								{:else}
									<strong>{new Intl.NumberFormat(ctx.locale).format(count)}</strong><span
										>{labelOf(card)}</span
									>
									{#if cardTone && count > 0}<i class="mark" aria-hidden="true"></i>{/if}
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.vega-home-bento {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: stretch;
	}
	.vega-home-bento.with-brand {
		grid-template-columns: 360px minmax(0, 1fr);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* ————— Tarjeta de marca ————— */
	.brandcard {
		position: relative;
		overflow: hidden;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		min-height: 220px;
		box-sizing: border-box;
		padding: var(--sp-5);
		border-radius: var(--r-md);
		background: var(--accent-fill);
		color: var(--accent-ink);
		box-shadow: var(--shadow-brand);
	}
	/* Círculo decorativo de la lámina (blanco al 12 %): la tinta del acento con opacidad, sin
	   color crudo. */
	.brandcard::before {
		content: '';
		position: absolute;
		z-index: -1;
		right: -40px;
		bottom: -60px;
		width: 240px;
		height: 240px;
		border-radius: 50%;
		background: var(--accent-ink);
		opacity: 0.12;
		filter: blur(2px);
	}
	.brandcard.calm,
	.brandcard.alert,
	.brandcard.quiet {
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink-hi);
		box-shadow: var(--shadow-card);
	}
	.brandcard.calm::before,
	.brandcard.alert::before,
	.brandcard.quiet::before {
		display: none;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
		font-size: var(--fs-12);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.calm .eyebrow,
	.alert .eyebrow,
	.quiet .eyebrow {
		color: var(--ink-2);
	}
	.dot {
		position: relative;
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 50%;
		background: currentColor;
	}
	.dot .ring {
		position: absolute;
		inset: -3px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.3;
	}
	.calm .dot {
		color: var(--success);
	}
	.alert .dot {
		color: var(--danger);
	}
	.quiet .dot {
		color: var(--ink-3);
	}
	.quiet .dot .ring {
		display: none;
	}
	h2 {
		margin: 0;
		font: 600 var(--fs-28) / 1.05 var(--display);
		font-variation-settings: 'opsz' 96;
		letter-spacing: -0.03em;
	}
	.published-at {
		margin: 0;
		font-size: var(--fs-13);
	}
	.calm .published-at,
	.alert .published-at,
	.quiet .published-at {
		color: var(--ink-2);
	}
	.acts {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin-top: auto;
	}
	.retry {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 36px;
		padding: 0 var(--sp-4);
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink);
		font: 500 var(--fs-13) var(--sans);
		cursor: pointer;
	}
	.retry:hover {
		background: var(--btn);
		border-color: var(--line-strong);
	}

	/* ————— Esqueleto (carga) con brillo ————— */
	.sk {
		position: relative;
		display: block;
		overflow: hidden;
		height: 12px;
		border-radius: 6px;
		background: var(--btn);
	}
	.sk::after {
		content: '';
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(90deg, transparent, var(--surface), transparent);
		animation: vega-home-shimmer 1.4s infinite;
	}
	.sk-title {
		width: 70%;
		height: 24px;
		border-radius: 8px;
	}
	.sk-line {
		width: 40%;
	}
	@keyframes vega-home-shimmer {
		to {
			transform: translateX(100%);
		}
	}

	/* ————— Tiles ————— */
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-3);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tiles li {
		display: flex;
		min-width: 0;
	}
	.tile {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: space-between;
		gap: 6px;
		min-height: 104px;
		min-width: 0;
		box-sizing: border-box;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		color: var(--ink-hi);
		text-decoration: none;
	}
	a.tile:hover {
		border-color: var(--accent-line);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}
	.tile strong {
		font: 600 var(--fs-36) / 1 var(--display);
		font-variation-settings: 'opsz' 96;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.03em;
	}
	.tile > span:not(.arrow, .sk, .sr-only) {
		padding-right: 18px;
		color: var(--ink-2);
		font-size: var(--fs-12);
		line-height: 1.3;
		overflow-wrap: break-word;
	}
	/* Apagado a cero: la cifra pierde peso y color. Texto informativo: `ink-2`, no el `ink-3` de
	   la lámina (P7 reserva `ink-3` a la decoración; ver docs/INICIO-V2-P7.md). */
	.tile.zero strong {
		color: var(--ink-2);
		font-weight: 500;
	}
	.tile.warn:not(.zero) strong {
		color: var(--warning);
	}
	.tile.scheduled:not(.zero) strong {
		color: var(--accent-text);
	}
	.arrow {
		position: absolute;
		top: 12px;
		right: 12px;
		display: inline-flex;
		color: var(--ink-3);
	}
	a.tile:hover .arrow {
		color: var(--accent-text);
	}
	/* Punto de color de los tiles que no enlazan (lámina): mismo significado que la cifra. */
	.mark {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.warn .mark {
		background: var(--warning);
	}
	.scheduled .mark {
		background: var(--accent);
	}
	.sk-val {
		width: 44px;
		height: 32px;
		border-radius: 8px;
	}
	.sk-lab {
		width: 70%;
	}
	.tile button {
		position: absolute;
		top: 8px;
		right: 8px;
		display: inline-grid;
		place-items: center;
		min-width: 36px;
		min-height: 36px;
		border: 0;
		border-radius: var(--r-sm);
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}
	@media (max-width: 1180px) {
		.vega-home-bento.with-brand {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 900px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 760px) {
		.brandcard {
			min-height: 0;
		}
		.tiles {
			gap: 10px;
		}
		.tile {
			min-height: 88px;
			padding: 12px 14px;
		}
		.tile strong {
			font-size: var(--fs-28);
		}
	}
	@media (pointer: coarse) {
		.retry,
		.tile button {
			min-height: 44px;
			min-width: 44px;
		}
	}
</style>
