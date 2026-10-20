<script lang="ts">
	/** Inicio de Vega: el modelo decide qué se puede crear; cada bloque carga de forma
	 * independiente para conservar las acciones cuando falla una consulta. */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { VegaError } from '$lib/backend/errors';
	import Icon from '$lib/icons/Icon.svelte';
	import { normalizeListError } from '$lib/list/list-load';
	import RevisionsOnboarding from '$lib/home/RevisionsOnboarding.svelte';
	import { isRevisionsOfferDismissed, shouldOfferRevisions } from '$lib/home/revisions-onboarding';
	import { backendInstallationKey } from '$lib/session/backend';
	import HomePending from '$lib/home/HomePending.svelte';
	import HomeRecentTable from '$lib/home/HomeRecentTable.svelte';
	import { creatableTypes } from '$lib/home/home-types';
	import { forgetRecentEdits, readRecentEdits } from '$lib/home/recent-edits-store';
	import { loadRecentRows, type RecentRow } from '$lib/home/recent-load';

	const ctx = getVegaContext();
	const hasNav = $derived(ctx.model.nav.groups.some((group) => group.items.length > 0));
	const createTypes = $derived(creatableTypes(ctx.model));
	const isAdmin = ctx.port.capabilities.schemaBootstrap;
	let offerDismissed = $state(isRevisionsOfferDismissed(backendInstallationKey()));
	const hasRevisionsOffer = $derived(!offerDismissed && shouldOfferRevisions(ctx.model, isAdmin));
	type RecentStatus =
		| { kind: 'loading' }
		| { kind: 'error'; error: VegaError }
		| { kind: 'ready'; rows: RecentRow[]; now: number };
	let recent = $state<RecentStatus>({ kind: 'loading' });
	let loadToken = 0;
	const today = new Date();
	const greetingKey =
		today.getHours() < 12
			? 'home.greeting.morning'
			: today.getHours() < 20
				? 'home.greeting.afternoon'
				: 'home.greeting.evening';
	const dateLabel = new Intl.DateTimeFormat(ctx.locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(today);

	/** Releer la lista local y resolver sus registros actuales; descartar respuestas obsoletas. */
	async function loadRecent(): Promise<void> {
		const token = ++loadToken;
		const userId = ctx.session.user.id;
		const edits = readRecentEdits(userId);
		if (edits.length === 0) {
			recent = { kind: 'ready', rows: [], now: Date.now() };
			return;
		}
		recent = { kind: 'loading' };
		try {
			const result = await loadRecentRows(ctx.port, ctx.model, edits);
			if (token !== loadToken) return;
			forgetRecentEdits(userId, result.gone);
			recent = { kind: 'ready', rows: result.rows, now: Date.now() };
		} catch (err) {
			if (token !== loadToken) return;
			recent = { kind: 'error', error: normalizeListError(err) };
		}
	}

	onMount(() => {
		if (hasNav) void loadRecent();
		return () => {
			loadToken++;
		};
	});
</script>

{#if !hasNav}
	<div class="vega-home-empty vega-empty-nav">
		<div class="glyph"><Icon id="generic" size={24} /></div>
		<h1>{ctx.t('nav.emptyTitle')}</h1>
		{#if isAdmin}
			<p>{ctx.t('nav.emptyBody')}</p>
			{#if !hasRevisionsOffer}<button type="button" onclick={() => ctx.nav.toSettings()}
					>{ctx.t('nav.emptyCta')}</button
				>{/if}
			<RevisionsOnboarding
				onDismiss={() => {
					offerDismissed = true;
				}}
			/>
		{:else}
			<p>{ctx.t('nav.emptyBodyEditor')}</p>
		{/if}
	</div>
{:else}
	<div class="vega-home">
		<header class="hero">
			<div>
				<h1>{ctx.t(greetingKey)}</h1>
				<p>{dateLabel}<span aria-hidden="true"> · </span>{ctx.model.site.name}</p>
			</div>
			{#if createTypes.length > 0}
				<section class="create" aria-label={ctx.t('home.create.title')}>
					<span>{ctx.t('home.create.title')}</span>
					{#each createTypes as type (type.name)}
						<button
							type="button"
							class="chip"
							data-create-type={type.name}
							aria-label={ctx.t('home.create.button', { label: type.labelSingular })}
							onclick={() => ctx.nav.toNew(type.name)}
						>
							<span class="chip-icon"><Icon id={type.icon ?? 'document'} size={14} /></span
							>{type.labelSingular}
						</button>
					{/each}
				</section>
			{/if}
		</header>

		<RevisionsOnboarding />
		<HomePending />

		<section class="recent" aria-labelledby="vega-home-recent-title">
			<div class="recent-head">
				<h2 id="vega-home-recent-title">{ctx.t('home.recent.title')}</h2>
				{#if recent.kind === 'ready' && recent.rows.length > 0}<span class="count"
						>{recent.rows.length}</span
					>{/if}
				<span class="hint">{ctx.t('home.recent.localHint')}</span>
			</div>
			{#if recent.kind === 'loading'}
				<div
					class="skeletons"
					data-home-recent="loading"
					aria-label={ctx.t('common.loading')}
					aria-busy="true"
				>
					{#each [1, 2, 3, 4] as slot (slot)}<div class="skeleton">
							<div></div>
							<span></span><span></span>
						</div>{/each}
				</div>
			{:else if recent.kind === 'error'}
				<div class="state" data-home-recent="error" role="alert">
					<div class="state-glyph"><Icon id="warning" size={20} /></div>
					<h3>{ctx.t('home.recent.errorTitle')}</h3>
					<p>{ctx.t('home.recent.errorBody', { message: recent.error.message })}</p>
					<button type="button" onclick={() => loadRecent()}>{ctx.t('common.retry')}</button>
				</div>
			{:else if recent.rows.length === 0}
				<div class="state" data-home-recent="empty">
					<div class="state-glyph"><Icon id="document" size={20} /></div>
					<h3>{ctx.t('home.recent.emptyTitle')}</h3>
					<p>{ctx.t('home.recent.emptyBody')}</p>
				</div>
			{:else}
				<div data-home-recent="ready"><HomeRecentTable rows={recent.rows} now={recent.now} /></div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.vega-home {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		max-width: 1160px;
		margin: 0 auto;
	}
	.hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--sp-5);
		padding-top: var(--sp-3);
	}
	h1 {
		margin: 0;
		font: 600 var(--fs-44)/1.02 var(--display);
		letter-spacing: -0.035em;
		color: var(--ink-hi);
	}
	.hero p {
		margin: 10px 0 0;
		color: var(--ink-2);
		font-size: var(--fs-14);
	}
	.create {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.create > span {
		margin-right: 2px;
		color: var(--ink-2);
		font-size: var(--fs-13);
		font-weight: 500;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 38px;
		padding: 4px 14px 4px 6px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		color: var(--ink);
		font: 500 var(--fs-13) var(--sans);
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--accent-line);
		box-shadow: var(--shadow-raised);
	}
	.chip-icon {
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.recent {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.recent-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.recent-head h2 {
		margin: 0;
		font: 600 var(--fs-22)/1.2 var(--display);
		letter-spacing: -0.025em;
	}
	.count {
		padding: 1px 8px;
		border-radius: var(--r-pill);
		background: var(--btn);
		color: var(--ink-2);
		font: var(--fs-12) var(--mono);
	}
	.hint {
		margin-left: auto;
		color: var(--ink-2);
		font-size: var(--fs-12);
	}
	.state {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-2);
		min-height: 180px;
		box-sizing: border-box;
		padding: var(--sp-8) var(--sp-6);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}
	.state-glyph {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--r-sm);
		background: var(--btn);
		color: var(--ink-2);
	}
	.state[role='alert'] .state-glyph {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.state h3 {
		margin: 0;
		font-size: var(--fs-15);
	}
	.state p {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-13);
	}
	.state button,
	.vega-home-empty button {
		min-height: 36px;
		margin-top: var(--sp-2);
		padding: 0 var(--sp-4);
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.skeletons {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.skeleton {
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
	}
	.skeleton div {
		aspect-ratio: 16/10;
		background: var(--btn);
	}
	.skeleton span {
		display: block;
		width: 75%;
		height: 12px;
		margin: 12px;
		border-radius: var(--r-sm);
		background: var(--btn);
	}
	.skeleton span:last-child {
		width: 45%;
	}
	.vega-home-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-3);
		max-width: 560px;
		margin: var(--sp-10) auto;
	}
	.vega-home-empty .glyph {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: var(--r-md);
		background: var(--accent-fill);
		color: var(--accent-ink);
		box-shadow: var(--shadow-brand);
	}
	.vega-home-empty h1 {
		font-size: var(--fs-36);
	}
	.vega-home-empty p {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-15);
	}
	@media (max-width: 1180px) {
		.skeletons {
			grid-template-columns: repeat(3, 1fr);
		}
		.skeleton:last-child {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.skeletons {
			grid-template-columns: repeat(2, 1fr);
		}
		.skeleton:nth-child(3) {
			display: none;
		}
	}
	@media (max-width: 600px) {
		.vega-home {
			gap: var(--sp-5);
		}
		h1 {
			font-size: var(--fs-36);
		}
		.hint {
			display: none;
		}
		.skeletons {
			grid-template-columns: 1fr;
		}
		.skeleton:nth-child(2) {
			display: none;
		}
	}
	@media (pointer: coarse) {
		.chip,
		.state button,
		.vega-home-empty button {
			min-height: 44px;
		}
	}
</style>
