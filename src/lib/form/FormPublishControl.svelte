<script lang="ts">
	/** Keep the compact action available without loading the publication engine before intent.
	 * The existing control owns confirmation, writes and retry state once the person activates it. */
	import { onDestroy, tick, type ComponentProps } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import { describeScheduleControl } from './schedule';
	import { captureEditorIdentity, currentEditorIdentity } from './deferred-editor-identity';

	type ControlComponent = typeof import('$lib/visual/VisualPublishControl.svelte').default;
	let props: Omit<ComponentProps<ControlComponent>, 'compact'> = $props();
	const ctx = getVegaContext();
	let Control = $state.raw<ControlComponent | null>(null);
	let control = $state<{ requestChange(): Promise<void>; focus(): void } | null>(null);
	let actionEl = $state<HTMLButtonElement | null>(null);
	let loading = $state(false);
	let loadFailed = $state(false);
	let alive = true;
	const mountedControl = () => control;
	onDestroy(() => {
		alive = false;
	});

	const canEdit = $derived(
		props.type.permissions.update &&
			!props.type.readonly &&
			props.type.statusField !== null &&
			props.type.fields.some(
				(field) => field.name === props.type.statusField && !field.schema.readonly
			)
	);
	const target = $derived(
		props.type.statusField && props.record.values[props.type.statusField] === 'published'
			? 'draft'
			: 'published'
	);
	const schedule = $derived(
		describeScheduleControl(
			props.type,
			props.record.values,
			ctx.model.scheduledPublishing ?? 'unknown',
			!canEdit
		)
	);
	const asksConfirmation = $derived(
		target === 'published' &&
			(props.pendingBlocks.length > 0 || (props.review?.enabled && props.review.needsAttention))
	);
	const actionLabel = $derived(
		loading
			? ctx.t('common.loading')
			: loadFailed
				? ctx.t('common.retry')
				: ctx.t(
						target === 'draft'
							? 'editor.visual.status.unpublish'
							: schedule.kind === 'overdue'
								? 'editor.schedule.publishNow'
								: 'editor.visual.status.publish'
					)
	);

	/** One activation while loading; discard stale identity or permission without writing. */
	export async function requestChange(): Promise<void> {
		const identity = captureEditorIdentity(ctx, props.type.name, props.record.id);
		if (!alive || !identity || loading || props.disabled || !canEdit) return;
		if (control) {
			await control.requestChange();
			return;
		}
		const intendedTarget = target;
		const current = () =>
			alive &&
			!props.disabled &&
			canEdit &&
			intendedTarget === target &&
			currentEditorIdentity(ctx, identity, props.type.name, props.record.id);
		loading = true;
		loadFailed = false;
		try {
			const component = (await import('$lib/visual/VisualPublishControl.svelte')).default;
			if (!current()) return;
			Control = component;
			await tick();
			if (!current()) return;
			const loaded = mountedControl();
			loaded?.focus();
			await loaded?.requestChange();
		} catch {
			if (current()) {
				loadFailed = true;
				await tick();
				actionEl?.focus();
			}
		} finally {
			if (alive) loading = false;
		}
	}
	export function focus(): void {
		if (control) control.focus();
		else actionEl?.focus();
	}
</script>

{#if Control}
	<Control {...props} bind:this={control} compact />
{:else if canEdit}
	<span
		class="vega-visual-publish"
		role="group"
		aria-label={ctx.t('editor.visual.status.groupLabel')}
	>
		<button
			type="button"
			class="vega-visual-publish-btn"
			class:vega-visual-publish-btn--primary={target === 'published'}
			bind:this={actionEl}
			aria-disabled={loading || props.disabled ? 'true' : undefined}
			aria-busy={loading ? 'true' : undefined}
			aria-expanded={asksConfirmation ? false : undefined}
			data-status-target={target}
			onclick={() => void requestChange()}
		>
			{#if target === 'published'}<Icon id="publish" size={16} />{/if}{actionLabel}
		</button>
		{#if loadFailed}<span class="vega-visual-publish-error" role="alert"
				>{ctx.t(
					target === 'published'
						? 'editor.visual.status.error.publish'
						: 'editor.visual.status.error.unpublish'
				)}</span
			>{/if}
	</span>
{/if}

<style>
	/* Same compact entry as the full control, before its interaction-only code is fetched. */
	.vega-visual-publish {
		position: relative;
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-left: 0.75rem;
		border-left: 1px solid var(--line);
	}
	.vega-visual-publish-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 30px;
		padding: 0 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		white-space: nowrap;
		cursor: pointer;
	}
	.vega-visual-publish-btn:hover:not([aria-disabled='true']) {
		border-color: var(--line-strong);
	}
	.vega-visual-publish-btn--primary {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.vega-visual-publish-btn--primary:hover:not([aria-disabled='true']) {
		border-color: transparent;
		box-shadow: 0 0 0 1.5px var(--accent-line);
	}
	.vega-visual-publish-btn[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.vega-visual-publish-btn:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.vega-visual-publish-error {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--danger);
	}
</style>
