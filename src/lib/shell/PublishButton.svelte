<script lang="ts">
	/** Global site update, advertised only by discovery. Saved data, editorial status and this
	 *  operation are independent. One bounded observer owns GET; POST acceptance is never success.
	 *  /status has no run ID, so newer server timestamps describe a newer global result only. */
	import { onDestroy, onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import {
		BuildRequestError,
		createBuildClient,
		detectUnpublishedChanges,
		pollBuildStatus,
		type BuildStatus
	} from '$lib/backend';
	import {
		announceSiteUpdateStatus,
		hasNewSiteUpdateResult,
		observeSiteUpdate,
		siteUpdateStatusKey,
		type SiteUpdateObservation
	} from './site-update';
	import Icon from '$lib/icons/Icon.svelte';
	let { home = false }: { home?: boolean } = $props();

	const ctx = getVegaContext();
	const client = ctx.port.buildApiUrl
		? createBuildClient({ apiUrl: ctx.port.buildApiUrl, token: ctx.session.token })
		: null;
	const POST_WAIT_MS = 30000;
	const STATUS_WAIT_MS = 120000;
	const UNPUBLISHED_REFRESH_MS = 120000;

	let status = $state<BuildStatus | null>(null);
	let triggering = $state(false);
	let checking = $state(false);
	let rechecking = $state(false);
	let uncertain = $state(false);
	let retryAllowed = $state(false);
	let attempt = $state.raw<{ observation: SiteUpdateObservation; accepted: boolean } | null>(null);
	let fetchProblem = $state<'denied' | 'unreachable' | null>(null);
	/** This detector is a limited hint, not a freshness guarantee or an action guard. */
	let hasChanges = $state<boolean | null>(null);
	let destroyed = false;
	let generation = 0;
	let detectorGeneration = 0;
	let stopPolling: (() => void) | null = null;
	let postController: AbortController | null = null;
	let postWaitTimer: ReturnType<typeof setTimeout> | null = null;
	let unpublishedTimer: ReturnType<typeof setInterval> | null = null;

	function stopObservation(): void {
		stopPolling?.();
		stopPolling = null;
		generation++;
		detectorGeneration++;
	}

	/** A stale collection response must not overwrite the hint for a newer observed result. */
	async function refreshUnpublishedChanges(lastPublishedAt: string | null): Promise<void> {
		const observedGeneration = generation;
		const calculation = ++detectorGeneration;
		const result = await detectUnpublishedChanges(
			ctx.port,
			ctx.model.types.map((t) => t.schema),
			lastPublishedAt
		);
		if (
			destroyed ||
			observedGeneration !== generation ||
			calculation !== detectorGeneration ||
			status?.lastPublishedAt !== lastPublishedAt
		)
			return;
		hasChanges = result.hasChanges;
	}

	/** Rechecking never triggers an update. An unexplained terminal after explicit recheck permits
	 *  a new intentional request with a persistent uncertainty warning, rather than trapping users. */
	function beginPolling(recheck = false): void {
		if (!client || destroyed || triggering) return;
		stopObservation();
		const currentGeneration = generation;
		const current = () => !destroyed && generation === currentGeneration;
		checking = true;
		rechecking = recheck;
		uncertain = false;
		retryAllowed = false;
		stopPolling = pollBuildStatus(client, {
			maxDurationMs: STATUS_WAIT_MS,
			onStatus(next) {
				if (!current()) return;
				const changed =
					status === null || siteUpdateStatusKey(status) !== siteUpdateStatusKey(next);
				status = next;
				if (changed && ctx.port.buildApiUrl) announceSiteUpdateStatus(ctx.port.buildApiUrl, next);
				fetchProblem = null;
				checking = false;
				if (attempt) {
					const observation = observeSiteUpdate(attempt.observation, next);
					attempt = { ...attempt, observation };
					if (hasNewSiteUpdateResult(observation, next)) attempt = null;
					else if (recheck && next.state !== 'running') {
						uncertain = true;
						retryAllowed = true;
					}
				}
				if (next.state !== 'running' && (!attempt || recheck))
					void refreshUnpublishedChanges(next.lastPublishedAt);
			},
			shouldContinue(next) {
				return current() && (next.state === 'running' || (attempt !== null && !recheck));
			},
			onError(err) {
				if (!current()) return;
				fetchProblem =
					err instanceof BuildRequestError && (err.status === 401 || err.status === 403)
						? 'denied'
						: 'unreachable';
				checking = false;
				uncertain = true;
				retryAllowed = false;
				stopObservation();
			},
			onTimeout() {
				if (!current()) return;
				checking = false;
				uncertain = true;
				retryAllowed = false;
				stopObservation();
			}
		});
	}

	function refreshFromLastKnownStatus(): void {
		if (
			document.hidden ||
			!status ||
			triggering ||
			attempt ||
			uncertain ||
			fetchProblem ||
			status.state === 'running'
		)
			return;
		void refreshUnpublishedChanges(status.lastPublishedAt);
	}
	function handleVisibilityChange(): void {
		if (document.visibilityState === 'visible') refreshFromLastKnownStatus();
	}

	onMount(() => {
		beginPolling();
		unpublishedTimer = setInterval(refreshFromLastKnownStatus, UNPUBLISHED_REFRESH_MS);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});
	onDestroy(() => {
		destroyed = true;
		stopObservation();
		postController?.abort();
		if (postWaitTimer !== null) clearTimeout(postWaitTimer);
		postWaitTimer = null;
		if (unpublishedTimer) clearInterval(unpublishedTimer);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	const disabled = $derived(
		triggering ||
			checking ||
			fetchProblem !== null ||
			!status ||
			(status.state === 'running' && !uncertain) ||
			(attempt !== null && !retryAllowed) ||
			(uncertain && !retryAllowed)
	);

	async function handleTrigger(): Promise<void> {
		if (!client || disabled || !status) return;
		stopObservation();
		const currentGeneration = generation;
		const baseline = status;
		triggering = true;
		uncertain = false;
		retryAllowed = false;
		fetchProblem = null;
		attempt = { observation: { baseline, runningStartedAt: null }, accepted: false };
		const controller = new AbortController();
		postController = controller;
		let deadline: ReturnType<typeof setTimeout> | undefined;
		try {
			// Abort only ends the client wait; the server may already have accepted the work.
			await Promise.race([
				client.trigger(controller.signal),
				new Promise<never>((_, reject) => {
					deadline = setTimeout(() => {
						controller.abort();
						reject(new Error('Unconfirmed request'));
					}, POST_WAIT_MS);
					postWaitTimer = deadline;
				})
			]);
			if (destroyed || generation !== currentGeneration) return;
			attempt = { observation: { baseline, runningStartedAt: null }, accepted: true };
		} catch {
			if (destroyed || generation !== currentGeneration) return;
			ctx.feedback.toast(ctx.t('topbar.publish.triggerError'), { kind: 'error' });
		} finally {
			if (deadline !== undefined) clearTimeout(deadline);
			if (postWaitTimer === deadline) postWaitTimer = null;
			if (postController === controller) postController = null;
			if (!destroyed && generation === currentGeneration) {
				triggering = false;
				beginPolling();
			}
		}
	}

	type UiState =
		| 'loading'
		| 'checking'
		| 'requesting'
		| 'accepted'
		| 'ambiguous'
		| 'uncertain'
		| 'unavailable'
		| 'running'
		| 'failed'
		| 'ok'
		| 'ready';
	const uiState = $derived.by((): UiState => {
		if (triggering) return 'requesting';
		if (fetchProblem) return 'unavailable';
		if (checking)
			return attempt && !rechecking
				? attempt.accepted
					? 'accepted'
					: 'ambiguous'
				: status
					? 'checking'
					: 'loading';
		if (uncertain) return 'uncertain';
		if (status?.state === 'running') return 'running';
		if (attempt) return attempt.accepted ? 'accepted' : 'ambiguous';
		if (status?.state === 'failed') return 'failed';
		if (status?.state === 'ok') return 'ok';
		return 'ready';
	});
	const stateLabel = $derived(
		ctx.t(
			uiState === 'running' && attempt && !attempt.accepted
				? 'topbar.publish.ambiguousRunning'
				: uiState === 'unavailable'
					? fetchProblem === 'denied'
						? 'topbar.publish.unavailableDenied'
						: 'topbar.publish.unavailableOffline'
					: uiState === 'ambiguous'
						? 'topbar.publish.triggerError'
						: uiState === 'ready'
							? 'topbar.publish.idle'
							: `topbar.publish.${uiState}`
		)
	);
	/** Estados que no piden nada a quien mira: la barra enseña solo la acción (lámina Inicio v2). */
	const restState = $derived(
		uiState === 'ready' || uiState === 'ok' || uiState === 'loading' || uiState === 'checking'
	);
	const actionLabel = $derived(
		ctx.t(retryAllowed ? 'topbar.publish.again' : home ? 'home.publishNow' : 'topbar.publish.ready')
	);
	const lastPublishedLabel = $derived.by(() => {
		const date = status?.lastPublishedAt ? new Date(status.lastPublishedAt) : null;
		return date && Number.isFinite(date.getTime())
			? ctx.t('topbar.publish.lastPublished', { date: date.toLocaleString(ctx.locale) })
			: null;
	});
	const historyLabel = $derived(
		status
			? ctx.t('topbar.publish.history', {
					result: ctx.t(`topbar.publish.${status.state === 'idle' ? 'idle' : status.state}`)
				})
			: null
	);
</script>

{#if client && home}
	<!-- Inicio (tarjeta de marca): solo la acción, con el MISMO flujo y estados que la barra. El
	     estado detallado vive en la barra; aquí solo se dice en voz alta lo que impide actuar. -->
	<div class="vega-publish home" data-state={uiState}>
		<button
			type="button"
			class="vega-publish-trigger"
			data-state={uiState}
			{disabled}
			onclick={handleTrigger}>{actionLabel}</button
		>
		{#if fetchProblem || uncertain || (attempt && !attempt.accepted)}
			<button
				type="button"
				class="vega-publish-check"
				disabled={triggering || checking}
				onclick={() => beginPolling(true)}>{ctx.t('topbar.publish.check')}</button
			>
		{/if}
		{#if uiState === 'requesting' || uiState === 'accepted' || uiState === 'unavailable' || uiState === 'ambiguous' || uiState === 'uncertain'}
			<p
				class="vega-publish-note"
				role={uiState === 'unavailable' || uiState === 'ambiguous' ? 'alert' : 'status'}
			>
				{stateLabel}
			</p>
		{/if}
		{#if retryAllowed}<p class="vega-publish-note" role="status">
				{ctx.t('topbar.publish.retryUncertain')}
			</p>{/if}
	</div>
{:else if client}
	<div class="vega-publish" data-state={uiState}>
		<details class="vega-publish-state" class:quiet={restState}>
			<!-- En reposo la barra es la de la lámina (solo la píldora): el estado se sigue anunciando
			     y abriendo desde este disparador, pero su texto solo se VE cuando pide atención. -->
			<summary title={restState ? stateLabel : undefined}
				><span
					class="vega-publish-state-label"
					role={uiState === 'unavailable' || uiState === 'failed' || uiState === 'ambiguous'
						? 'alert'
						: 'status'}>{stateLabel}</span
				><Icon id="chevron" size={14} strokeWidth={1.6} /></summary
			>
			<div class="vega-publish-panel">
				<p>{ctx.t('topbar.publish.scope')}</p>
				{#if historyLabel}<p>{historyLabel}</p>{/if}
				{#if lastPublishedLabel}<p>{lastPublishedLabel}</p>{/if}
				<p>
					{ctx.t(
						hasChanges === null
							? 'topbar.publish.unknownChanges'
							: hasChanges
								? 'topbar.publish.changes'
								: 'topbar.publish.noChanges'
					)}
				</p>
				<p>{ctx.t('topbar.publish.resultScope')}</p>
				{#if status?.state === 'failed' && status.detail}
					<p class="vega-publish-detail">{status.detail}</p>
				{/if}
				{#if status?.state === 'failed' && status.logUrl}
					<a href={status.logUrl} target="_blank" rel="noopener noreferrer" class="vega-publish-log"
						>{ctx.t('topbar.publish.viewLog')}</a
					>
				{/if}
				<button
					type="button"
					class="vega-publish-check"
					disabled={triggering || checking}
					onclick={() => beginPolling(true)}>{ctx.t('topbar.publish.check')}</button
				>
			</div>
		</details>
		{#if fetchProblem || uncertain || (attempt && !attempt.accepted)}
			<button
				type="button"
				class="vega-publish-check"
				disabled={triggering || checking}
				onclick={() => beginPolling(true)}>{ctx.t('topbar.publish.check')}</button
			>
		{/if}
		<button
			type="button"
			class="vega-publish-trigger"
			data-state={uiState}
			{disabled}
			onclick={handleTrigger}
		>
			<span>{actionLabel}</span>
		</button>
		{#if retryAllowed}<p class="vega-publish-uncertain" role="status">
				{ctx.t('topbar.publish.retryUncertain')}
			</p>{/if}
	</div>
{/if}

<style>
	.vega-publish {
		position: relative;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
		max-width: 29rem;
		font-size: 0.75rem;
	}
	.vega-publish-state {
		min-width: 0;
		flex: 1 1 8rem;
	}
	.vega-publish-state.quiet {
		flex: none;
	}
	.vega-publish-state summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem;
		min-height: 30px;
		max-width: 15rem;
		color: var(--ink);
		cursor: pointer;
		list-style: none;
	}
	/* Reposo: el disparador del panel es un círculo con la flecha; el texto sigue en el árbol de
	   accesibilidad (región `status`) y en el `title`, pero no ocupa la barra. */
	.vega-publish-state.quiet summary {
		justify-content: center;
		width: 30px;
		min-width: 30px;
		padding: 0;
		border-radius: 50%;
		color: var(--ink-2);
	}
	.vega-publish-state.quiet summary:hover {
		background: var(--btn);
		color: var(--ink);
	}
	.vega-publish-state.quiet .vega-publish-state-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.vega-publish-state summary :global(svg) {
		flex: none;
		transform: rotate(90deg);
	}
	.vega-publish-state[open] summary :global(svg) {
		transform: rotate(-90deg);
	}
	.vega-publish-state summary::-webkit-details-marker {
		display: none;
	}
	.vega-publish-state summary span {
		overflow-wrap: anywhere;
	}
	.vega-publish-panel {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.5rem);
		right: 0;
		width: min(28rem, calc(100vw - 2rem));
		max-height: min(28rem, 70dvh);
		overflow-y: auto;
		padding: 0.8rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}
	.vega-publish-panel p {
		margin: 0 0 0.65rem;
	}
	.vega-publish-trigger,
	.vega-publish-check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 30px;
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	/* Píldora de marca de la lámina (`.btn.primary`): el relleno del tema (degradado donde lo
	   declara), 36 px, 13/500. */
	.vega-publish-trigger {
		min-height: 36px;
		padding: 0 16px;
		border-color: transparent;
		border-radius: var(--r-pill);
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-size: var(--fs-13);
		font-weight: 500;
		white-space: nowrap;
		box-shadow: var(--shadow-card);
	}
	.vega-publish-trigger:hover:not(:disabled) {
		filter: brightness(1.06);
	}
	.vega-publish-check:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink);
	}
	.vega-publish-trigger:disabled,
	.vega-publish-check:disabled {
		cursor: default;
		opacity: 0.65;
	}
	.vega-publish :is(button, summary, a):focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.vega-publish-detail {
		overflow-wrap: anywhere;
	}
	.vega-publish-log {
		display: inline-flex;
		margin: 0 0 0.65rem;
		color: var(--ink);
		text-decoration: underline;
	}
	.vega-publish-uncertain {
		flex-basis: 100%;
		margin: 0;
		color: var(--ink);
	}
	.vega-publish.home {
		max-width: 100%;
		color: inherit;
	}
	/* «Publicar ahora» sobre la tarjeta de marca (`.btn.onbrand`): la tinta del acento como fondo
	   y el acento como texto, el mismo par que el gate exige a AA (accentInk/accent). */
	.vega-publish.home .vega-publish-trigger {
		min-height: 36px;
		padding: 6px 16px;
		border-color: transparent;
		border-radius: var(--r-pill);
		background: var(--accent-ink);
		color: var(--accent);
		font-size: var(--fs-13);
		font-weight: 600;
		box-shadow: none;
	}
	.vega-publish.home .vega-publish-check {
		min-height: 36px;
		border-radius: var(--r-pill);
	}
	.vega-publish-note {
		flex-basis: 100%;
		margin: 0;
		font-size: var(--fs-12);
		color: inherit;
	}
	@media (max-width: 768px) {
		.vega-publish {
			max-width: none;
		}
		.vega-publish-state summary {
			max-width: none;
		}
	}
	@media (pointer: coarse) {
		.vega-publish-trigger,
		.vega-publish-check,
		.vega-publish-state summary,
		.vega-publish-log {
			min-height: 44px;
			min-width: 44px;
		}
	}
</style>
