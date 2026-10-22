<script lang="ts">
	/** Actividad solo para administración, leída por el puerto con cursor y epoch de sesión. */
	import { untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type EditorAccount } from '$lib/backend';
	import SuperuserGate from '$lib/admin/SuperuserGate.svelte';
	import ActivityList from '$lib/activity/ActivityList.svelte';
	import {
		ACTIVITY_COLLECTION,
		hasActivityCollection,
		parseActivity,
		type ActivityEntry
	} from '$lib/activity/activity-collection';
	import {
		activityQuery,
		EMPTY_ACTIVITY_FILTERS,
		type ActivityFilters,
		type ActivityCursor
	} from '$lib/activity/activity-query';
	import { resolveActivityTargets, type ActivityTarget } from '$lib/activity/activity-links';
	import '$lib/admin/admin.css';
	const ctx = getVegaContext();
	const allowed = $derived(ctx.port.capabilities.administration && !!ctx.port.administration);
	const available = $derived(hasActivityCollection(ctx.model.types.map((type) => type.schema)));
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let entries = $state<ActivityEntry[]>([]);
	let targets = $state<Record<string, ActivityTarget>>({});
	let editors = $state<EditorAccount[]>([]);
	let filters = $state<ActivityFilters>({ ...EMPTY_ACTIVITY_FILTERS });
	// El cursor pertenece a la consulta aplicada, no al borrador de los controles.
	let appliedFilters = $state<ActivityFilters>({ ...EMPTY_ACTIVITY_FILTERS });
	let cursor = $state<ActivityCursor>();
	let more = $state(false);
	let loadingMore = $state(false);
	let run = 0;
	let invalidRows = $state(false);
	const filtered = $derived(Object.values(appliedFilters).some(Boolean));

	async function load(append = false): Promise<void> {
		if (!allowed || !available) return;
		const epoch = ++run;
		const token = ctx.session.token;
		const stale = () => epoch !== run || token !== ctx.session.token;
		const currentFilters = { ...(append ? appliedFilters : filters) };
		if (!append) appliedFilters = currentFilters;
		const currentCursor = append ? cursor : undefined;
		if (append) loadingMore = true;
		else {
			status = 'loading';
			entries = [];
			targets = {};
			cursor = undefined;
			invalidRows = false;
		}
		try {
			const page = await ctx.port.list(
				ACTIVITY_COLLECTION,
				activityQuery(currentFilters, currentCursor)
			);
			const parsed = page.items.map(parseActivity);
			const next = parsed.filter((row): row is ActivityEntry => row !== null);
			const resolved = await resolveActivityTargets(ctx.port, ctx.model, next);
			if (stale()) return;
			entries = append ? [...entries, ...next] : next;
			targets = append ? { ...targets, ...resolved } : resolved;
			invalidRows ||= parsed.some((row) => row === null);
			const last = page.items.at(-1);
			cursor = last ? { id: last.id, created: String(last.values.created) } : undefined;
			more = page.items.length === 50;
			status = 'ready';
		} catch (error) {
			if (stale()) return;
			if (error instanceof VegaError && error.kind === 'auth-expired')
				ctx.feedback.reportError(error, { action: 'activity:load' });
			status = 'error';
		} finally {
			if (!stale()) loadingMore = false;
		}
	}
	$effect(() => {
		const token = ctx.session.token;
		const port = ctx.port;
		if (!allowed || !available) {
			run++;
			return;
		}
		void token;
		untrack(() => {
			void load();
		});
		void port
			.administration!.listEditors()
			.then((directory) => {
				if (ctx.session.token === token) editors = directory.editors;
			})
			.catch((error: unknown) => {
				if (error instanceof VegaError && error.kind === 'auth-expired')
					ctx.feedback.reportError(error, { action: 'activity:editors' });
			});
	});
	function apply(event: SubmitEvent): void {
		event.preventDefault();
		void load();
	}
</script>

<svelte:head><title>{ctx.t('activity.title')} · Vega</title></svelte:head>
{#if !allowed}
	<SuperuserGate body={ctx.t('activity.gate')} />
{:else}
	<section
		class="activity-page"
		aria-labelledby="activity-heading"
		data-activity-state={!available ? 'unavailable' : status}
	>
		<header>
			<div>
				<h1 id="activity-heading" tabindex="-1">{ctx.t('activity.title')}</h1>
				<p>{ctx.t('activity.intro')}</p>
			</div>
			<button type="button" onclick={() => load()} disabled={status === 'loading' || !available}
				>{ctx.t('activity.refresh')}</button
			>
		</header>
		{#if !available}
			<div class="activity-state">
				<h2>{ctx.t('activity.unavailable')}</h2>
				<p>{ctx.t('activity.unavailableBody')}</p>
				<a href="https://github.com/fodaveg/vegacms/blob/main/docs/CONFIG.md#registro-de-actividad"
					>{ctx.t('activity.install')}</a
				>
			</div>
		{:else}
			<form class="activity-filters" onsubmit={apply}>
				<label
					>{ctx.t('activity.person')}<select bind:value={filters.actor}
						><option value="">{ctx.t('activity.allPeople')}</option><option value="_superusers"
							>{ctx.t('activity.superusers')}</option
						>{#each editors as editor (editor.id)}<option value={editor.id}>{editor.email}</option
							>{/each}</select
					></label
				>
				<label
					>{ctx.t('activity.type')}<select bind:value={filters.collection}
						><option value="">{ctx.t('activity.allTypes')}</option
						>{#each ctx.model.types.filter((type) => !type.hidden || type.name === 'vega_media') as type (type.name)}<option
								value={type.name}
								>{type.name === 'vega_media' ? ctx.t('nav.media') : type.label}</option
							>{/each}</select
					></label
				>
				<label
					>{ctx.t('activity.action')}<select bind:value={filters.action}
						><option value="">{ctx.t('activity.allActions')}</option><option value="create"
							>{ctx.t('activity.create')}</option
						><option value="update">{ctx.t('activity.update')}</option><option value="delete"
							>{ctx.t('activity.delete')}</option
						></select
					></label
				>
				<label>{ctx.t('activity.from')}<input type="date" bind:value={filters.from} /></label><label
					>{ctx.t('activity.to')}<input
						type="date"
						bind:value={filters.to}
						min={filters.from || undefined}
					/></label
				>
				<button type="submit">{ctx.t('activity.filter')}</button>
			</form>
			{#if status === 'loading'}<div class="activity-state" role="status" aria-busy="true">
					<p>{ctx.t('activity.loading')}</p>
					{#each [1, 2, 3, 4] as n (n)}<div class="activity-skeleton"></div>{/each}
				</div>
			{:else if status === 'error'}<div class="activity-state" role="alert">
					<h2>{ctx.t('activity.error')}</h2>
					<button type="button" onclick={() => load()}>{ctx.t('activity.retry')}</button>
				</div>
			{:else}
				{#if invalidRows}<p role="status">{ctx.t('activity.invalidRows')}</p>{/if}
				{#if entries.length === 0}<div class="activity-state">
						<h2>{ctx.t(filtered ? 'activity.noResults' : 'activity.empty')}</h2>
						<p>{ctx.t(filtered ? 'activity.noResultsBody' : 'activity.emptyBody')}</p>
					</div>
				{:else}<ActivityList {entries} {targets} />{/if}
				{#if more}<button
						class="activity-more"
						type="button"
						onclick={() => load(true)}
						disabled={loadingMore}
						>{ctx.t(loadingMore ? 'activity.loading' : 'activity.more')}</button
					>{/if}
			{/if}
			<p class="activity-footnote">{ctx.t('activity.limit')}</p>
		{/if}
	</section>
{/if}

<style>
	.activity-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem;
		color: var(--ink);
	}
	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	h1 {
		margin: 0 0 0.5rem;
		font-size: 1.75rem;
	}
	header p,
	.activity-footnote {
		color: var(--ink-2);
		margin: 0;
	}
	.activity-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
		margin-bottom: 1.5rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8rem;
		flex: 1 1 120px;
		min-width: 0;
	}
	select,
	input,
	button {
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		max-width: 100%;
	}
	button {
		cursor: pointer;
	}
	button:hover:enabled {
		background: var(--surface-2);
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.activity-state {
		border: 1px solid var(--line);
		border-radius: var(--r);
		padding: 2rem;
	}
	.activity-state h2 {
		font-size: 1.125rem;
	}
	.activity-skeleton {
		height: 3rem;
		margin-top: 0.75rem;
		background: var(--surface-2);
		border-radius: var(--r);
	}
	.activity-more {
		display: block;
		margin: 1rem auto;
	}
	.activity-footnote {
		font-size: 0.8rem;
		margin-top: 1rem;
	}
	@media (max-width: 600px) {
		.activity-page {
			padding: 1rem;
		}
		header {
			flex-wrap: wrap;
		}
		.activity-state {
			padding: 1rem;
		}
	}
</style>
