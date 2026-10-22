<script lang="ts">
	/** Lista semántica: cabeceras por día, guardados juntos e importaciones desplegables. */
	import { getVegaContext } from '$lib/app-context';
	import type { ActivityEntry } from './activity-collection';
	import { groupActivity, activityVerb, type ActivityGroup } from './activity-groups';
	import { targetKey, type ActivityTarget } from './activity-links';
	let {
		entries,
		targets,
		now = Date.now()
	}: { entries: ActivityEntry[]; targets: Record<string, ActivityTarget>; now?: number } = $props();
	const ctx = getVegaContext();
	const days = $derived.by(() => {
		const result: { key: string; groups: ActivityGroup[] }[] = [];
		for (const group of groupActivity(entries)) {
			const key = group.entries[0].created.slice(0, 10);
			const last = result.at(-1);
			if (last?.key === key) last.groups.push(group);
			else result.push({ key, groups: [group] });
		}
		return result;
	});
	function actor(entry: ActivityEntry): string {
		return entry.actorEmail || ctx.t('activity.deletedAccount');
	}
	function relative(created: string): string {
		const minutes = Math.round((Date.parse(created) - now) / 60000);
		const formatter = new Intl.RelativeTimeFormat(ctx.locale, { numeric: 'auto' });
		return Math.abs(minutes) < 60
			? formatter.format(minutes, 'minute')
			: Math.abs(minutes) < 1440
				? formatter.format(Math.round(minutes / 60), 'hour')
				: formatter.format(Math.round(minutes / 1440), 'day');
	}
	function day(created: string): string {
		return new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
			new Date(created)
		);
	}
	function typeLabel(entry: ActivityEntry): string {
		return entry.collection === 'vega_media'
			? ctx.t('nav.media')
			: ctx.model.types.find((type) => type.name === entry.collection)?.label || entry.collection;
	}
</script>

{#snippet row(entry: ActivityEntry, count = 1)}
	{@const type = ctx.model.types.find((type) => type.name === entry.collection)}
	{@const target = targets[targetKey(entry)]}
	<div class="activity-row">
		<div class="activity-initial" aria-hidden="true">{actor(entry).charAt(0).toUpperCase()}</div>
		<div class="activity-description">
			<p>
				<strong>{actor(entry)}</strong>
				{ctx.t(`activity.${count > 1 ? 'edited' : activityVerb(entry, type)}`)}
				{#if target?.href}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href ya compuesto por nav/routes.ts. -->
					<a href={target.href}>{target.label}</a>{:else}<span
						>{target?.label || entry.label || entry.recordId}</span
					>{/if}
				{#if count > 1}<span class="activity-detail">
						· {ctx.t('activity.saves', { count })}</span
					>{/if}
			</p>
			<p class="activity-detail">
				{typeLabel(entry)}
				{#if entry.action === 'update' && entry.changes.length > 0}
					· {entry.changes
						.map(
							(change) =>
								type?.fields.find((field) => field.name === change.field)?.label || change.field
						)
						.join(', ')}
				{/if}
				{#if target?.missing && entry.action === 'delete'}
					· {ctx.t(target.copied ? 'activity.trashCopy' : 'activity.noTrashCopy')}{/if}
			</p>
		</div>
		<time
			datetime={new Date(entry.created).toISOString()}
			title={new Intl.DateTimeFormat(ctx.locale, {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(new Date(entry.created))}>{relative(entry.created)}</time
		>
	</div>
{/snippet}

<div class="activity-list">
	{#each days as date (date.key)}
		<section aria-labelledby={`activity-day-${date.key}`}>
			<h2 id={`activity-day-${date.key}`}>{day(date.groups[0].entries[0].created)}</h2>
			<ol>
				{#each date.groups as group (group.entries[0].id)}
					{@const entry = group.entries[0]}
					<li>
						{#if group.kind === 'bulk'}
							<details class="activity-bulk">
								<summary
									>{actor(entry)} · {ctx.t(`activity.${activityVerb(entry)}`)}
									{ctx.t('activity.bulk', {
										count: group.entries.length,
										collection: typeLabel(entry)
									})}</summary
								>
								<ol>
									{#each group.entries as item (item.id)}<li>{@render row(item)}</li>{/each}
								</ol>
							</details>
						{:else}{@render row(entry, group.entries.length)}{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>

<style>
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.activity-list {
		border: 1px solid var(--line);
		border-radius: var(--r);
		overflow: hidden;
	}
	h2 {
		margin: 0;
		padding: 0.75rem 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.activity-row {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		border-top: 1px solid var(--line);
		align-items: start;
	}
	.activity-initial {
		flex: 0 0 2rem;
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--surface-2);
		font-size: 0.85rem;
	}
	.activity-description {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		line-height: 1.6;
	}
	a {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.activity-detail,
	time {
		color: var(--ink-2);
		font-size: 0.8rem;
	}
	time {
		white-space: nowrap;
		padding-top: 0.25rem;
	}
	summary {
		min-height: 44px;
		padding: 0.75rem 1rem;
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	summary:hover {
		background: var(--surface-2);
	}
	a:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	@media (pointer: coarse) {
		a {
			display: inline-flex;
			align-items: center;
			min-height: 44px;
			min-width: 44px;
		}
	}
	@media (max-width: 600px) {
		.activity-row {
			flex-wrap: wrap;
		}
		time {
			margin-left: 2.75rem;
		}
		.activity-description {
			flex-basis: calc(100% - 3rem);
		}
	}
</style>
