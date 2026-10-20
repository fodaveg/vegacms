<script lang="ts">
	/** Bento de Inicio: cifras independientes y estado global del sitio cuando se puede conocer. */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { BuildState, BuildStatus } from '$lib/backend/build-client';
	import Icon from '$lib/icons/Icon.svelte';
	import PublishButton from '$lib/shell/PublishButton.svelte';
	import { onSiteUpdateStatus, siteUpdateStatusKey } from '$lib/shell/site-update';
	import {
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
		| { hasChanges: boolean | null; lastPublishedAt: string | null; state: BuildState }
		| null
	>(hasBuild ? 'loading' : null);
	const lastPublished = $derived.by(() => {
		if (!unpublished || typeof unpublished === 'string' || !unpublished.lastPublishedAt)
			return null;
		const date = new Date(unpublished.lastPublishedAt);
		return Number.isFinite(date.getTime()) ? date.toLocaleDateString(ctx.locale) : null;
	});
	let alive = false;
	let publicationGeneration = 0;
	let observedStatusKey: string | null = null;

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
			if (alive && generation === publicationGeneration) unpublished = value;
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
</script>

{#if cards.length > 0 || hasBuild}
	<section class="vega-home-bento" aria-label={ctx.t('home.pending.title')}>
		{#if hasBuild}
			<div
				class="brandcard"
				class:calm={unpublished !== null &&
					typeof unpublished === 'object' &&
					unpublished.hasChanges === false &&
					unpublished.lastPublishedAt !== null &&
					unpublished.state !== 'failed' &&
					unpublished.state !== 'running'}
				data-pending="unpublished"
				aria-busy={unpublished === 'loading'}
			>
				<p class="eyebrow">
					<span class="dot" aria-hidden="true"></span>{ctx.t('home.pending.unpublished')}
				</p>
				{#if unpublished === 'loading'}
					<h2>{ctx.t('common.loading')}</h2>
				{:else if unpublished === 'error'}
					<h2>{ctx.t('home.pending.unpublishedError')}</h2>
					<button type="button" class="retry" onclick={() => loadUnpublished()}
						>{ctx.t('common.retry')}</button
					>
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
				<!-- El componente existente conserva las comprobaciones, estados y permisos de publicación. -->
				<div class="action"><PublishButton home /></div>
			</div>
		{/if}
		{#if cards.length > 0}
			<ul class="tiles">
				{#each cards as card (card.key)}
					{@const count = counts[card.key] ?? 'loading'}
					<li>
						{#if card.href !== null && typeof count === 'number'}
							<a
								class="tile"
								class:zero={count === 0}
								class:warn={card.kind === 'description' || card.kind === 'media-alt'}
								class:scheduled={card.kind === 'scheduled'}
								href={card.href}
								data-pending={card.key}
								data-zero={count === 0}
							>
								<strong>{new Intl.NumberFormat(ctx.locale).format(count)}</strong>
								<span>{labelOf(card)}</span><Icon id="chevron" size={14} />
							</a>
						{:else}
							<div
								class="tile"
								class:zero={count === 0}
								class:warn={card.kind === 'description' || card.kind === 'media-alt'}
								class:scheduled={card.kind === 'scheduled'}
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
										><Icon id="update" size={16} /></button
									>
								{:else}
									<strong
										>{count === 'loading'
											? '…'
											: new Intl.NumberFormat(ctx.locale).format(count)}</strong
									><span>{labelOf(card)}</span>
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
		grid-template-columns: 360px minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: stretch;
	}
	.brandcard {
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
	.brandcard.calm {
		background: var(--surface);
		color: var(--ink-hi);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-card);
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
	.dot {
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 50%;
		background: currentColor;
	}
	.calm .dot {
		background: var(--success);
	}
	h2 {
		margin: 0;
		font: 600 var(--fs-28)/1.08 var(--display);
		letter-spacing: -0.03em;
	}
	.action {
		margin-top: auto;
	}
	.published-at {
		margin: 0;
		font-size: var(--fs-12);
		opacity: 0.86;
	}
	.retry {
		align-self: flex-start;
		min-height: 36px;
		padding: 0 var(--sp-4);
		border: 0;
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
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
		gap: var(--sp-2);
		min-height: 104px;
		min-width: 0;
		box-sizing: border-box;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		color: var(--ink);
		text-decoration: none;
	}
	a.tile:hover {
		border-color: var(--accent-line);
		box-shadow: var(--shadow-raised);
	}
	.tile strong {
		font: 600 var(--fs-36)/1 var(--display);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.03em;
	}
	.tile span {
		color: var(--ink-2);
		font-size: var(--fs-12);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
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
	.tile :global(svg) {
		position: absolute;
		top: 14px;
		right: 14px;
		color: var(--ink-2);
	}
	.tile button {
		position: absolute;
		top: 8px;
		right: 8px;
		min-width: 36px;
		min-height: 36px;
		border: 0;
		border-radius: var(--r-sm);
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}
	@media (max-width: 1180px) {
		.vega-home-bento {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 900px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.tiles {
			gap: var(--sp-2);
		}
		.tile {
			min-height: 88px;
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
