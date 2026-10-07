<script lang="ts">
	/** Una apertura, una URL efímera. AdminDialog conserva foco/cierre; el cliente existente hace HTTP. */
	import { onMount, tick, untrack } from 'svelte';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import '$lib/admin/admin.css';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import {
		createPreviewShareClient,
		type PreviewShareLink
	} from '$lib/backend/preview-share-client';
	import {
		PreviewShareController,
		type PreviewShareState,
		type ShareUnit
	} from './preview-share-state';

	interface Props {
		apiUrl: string;
		collection: string;
		recordId: string;
		dirty: boolean;
		allowed: boolean;
		opener: HTMLElement | null;
		fallback: HTMLElement | null;
		onClose: () => void;
	}
	let { apiUrl, collection, recordId, dirty, allowed, opener, fallback, onClose }: Props = $props();
	const ctx = getVegaContext();
	const id = $props.id();
	const initial = untrack(() => ({
		collection,
		recordId,
		token: ctx.session.token,
		userId: ctx.session.user.id
	}));
	const controller = untrack(
		() =>
			new PreviewShareController(
				createPreviewShareClient({ apiUrl, token: initial.token }),
				collection,
				recordId,
				(value) => {
					shareState = value;
				}
			)
	);
	let shareState = $state<PreviewShareState>(controller.state);
	let view = $state<'list' | 'create' | 'copy' | 'close' | 'revoke'>('list');
	let label = $state('');
	let amount = $state('1');
	let unit = $state<ShareUnit>('days');
	let now = $state(Date.now());
	let revokeTarget = $state.raw<PreviewShareLink | null>(null);
	let copyBusy = $state(false);
	let copyFailed = $state(false);
	let root = $state<HTMLElement | undefined>();
	let alive = true;
	let sessionErrorReported = false;
	const busy = $derived(shareState.pending !== null || copyBusy);
	const title = $derived(ctx.t(`editor.share.title.${view}`));
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const createBlocked = $derived(
		busy || !allowed || shareState.listPhase !== 'ready' || shareState.uncertain
	);

	function date(value: string): string {
		const parsed = new Date(value);
		if (!Number.isFinite(parsed.getTime())) return ctx.t('editor.share.dateUnknown');
		return new Intl.DateTimeFormat(ctx.locale, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			timeZoneName: 'short'
		}).format(parsed);
	}
	function expired(link: PreviewShareLink): boolean {
		return Date.parse(link.expiresAt) <= now;
	}
	function linkName(link: PreviewShareLink): string {
		return link.label || `${ctx.t('editor.share.noLabel')} · ${link.id}`;
	}
	async function focusView(): Promise<void> {
		await tick();
		if (!alive) return;
		const selector =
			view === 'create'
				? '[data-share-label]'
				: view === 'copy'
					? '[data-share-url]'
					: view === 'close'
						? '[data-share-keep]'
						: view === 'revoke'
							? '[data-share-revoke-cancel]'
							: '[data-share-new]';
		root?.querySelector<HTMLElement>(selector)?.focus();
	}
	function finishClose(): void {
		controller.dispose();
		shareState = controller.state;
		onClose();
	}
	function close(): void {
		if (busy) return;
		if (view === 'close') {
			view = 'copy';
			void focusView();
			return;
		}
		if (shareState.created && !shareState.copied) {
			view = 'close';
			void focusView();
		} else finishClose();
	}
	async function load(): Promise<void> {
		await controller.load();
		if (alive && shareState.listPhase === 'ready') await focusView();
	}
	async function create(): Promise<void> {
		if (createBlocked) return;
		await controller.create(amount, unit, label);
		if (!alive) return;
		if (shareState.created) {
			view = 'copy';
			await focusView();
		} else if (shareState.inputError) {
			root
				?.querySelector<HTMLElement>(
					shareState.inputError === 'label' ? '[data-share-label]' : '[data-share-amount]'
				)
				?.focus();
		}
	}
	async function copy(): Promise<void> {
		if (busy || !shareState.created) return;
		copyBusy = true;
		copyFailed = false;
		try {
			await navigator.clipboard.writeText(shareState.created.url);
			if (alive) controller.markCopied();
		} catch {
			if (alive) {
				copyFailed = true;
				await focusView();
				root?.querySelector<HTMLTextAreaElement>('[data-share-url]')?.select();
			}
		} finally {
			if (alive) copyBusy = false;
		}
	}
	function confirmRevoke(link: PreviewShareLink): void {
		if (busy || !allowed || expired(link)) return;
		revokeTarget = link;
		view = 'revoke';
		void focusView();
	}
	async function cancelRevoke(): Promise<void> {
		const linkId = revokeTarget?.id;
		view = 'list';
		revokeTarget = null;
		await tick();
		if (!alive) return;
		Array.from(root?.querySelectorAll<HTMLElement>('[data-share-link]') ?? [])
			.find((el) => el.dataset.shareLink === linkId)
			?.focus();
	}
	async function revoke(): Promise<void> {
		if (busy || !allowed || !revokeTarget) return;
		if (await controller.revoke(revokeTarget.id)) {
			if (!alive) return;
			revokeTarget = null;
			view = 'list';
			await focusView();
		}
	}
	function enter(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		event.stopPropagation();
		void create();
	}

	$effect(() => {
		if (
			collection !== initial.collection ||
			recordId !== initial.recordId ||
			ctx.session.token !== initial.token ||
			ctx.session.user.id !== initial.userId
		)
			finishClose();
	});
	$effect(() => {
		if (shareState.error === 'session' && !sessionErrorReported) {
			sessionErrorReported = true;
			ctx.feedback.reportError(VegaError.authExpired(), { action: 'preview-share:manage' });
		}
	});
	onMount(() => {
		void load();
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => {
			alive = false;
			clearInterval(timer);
			controller.dispose();
		};
	});
</script>

<div class="vega-share" bind:this={root} data-preview-share>
	<AdminDialog
		open={true}
		{title}
		{busy}
		returnFocusEl={opener}
		fallbackFocusEl={fallback}
		onClose={close}
	>
		<p class="vega-admin-dialog-text">{ctx.t('editor.share.scope')}</p>
		{#if dirty}<p class="vega-share-notice" role="status">{ctx.t('editor.share.dirty')}</p>{/if}
		{#if !allowed}<p class="vega-share-error" role="alert">
				{ctx.t('editor.share.error.forbidden')}
			</p>{/if}
		{#if shareState.error}<p class="vega-share-error" role="alert">
				{ctx.t(`editor.share.error.${shareState.error}`)}
			</p>{/if}
		{#if shareState.uncertain}<p class="vega-share-notice" role="status">
				{ctx.t('editor.share.uncertain')}
			</p>{/if}
		{#if view === 'list'}
			{#if shareState.listPhase === 'loading'}<p role="status">{ctx.t('editor.share.loading')}</p>
			{:else if shareState.listPhase === 'error'}
				<p class="vega-admin-dialog-text">{ctx.t('editor.share.listError')}</p>
				<button type="button" class="vega-admin-btn" onclick={() => void load()}
					>{ctx.t('common.retry')}</button
				>
			{:else}
				{#if shareState.revokedId}<p role="status" class="vega-admin-dialog-text">
						{ctx.t('editor.share.revoked')}
					</p>{/if}
				{#if shareState.links.length === 0}<p class="vega-admin-dialog-text">
						{ctx.t('editor.share.empty')}
					</p>{/if}
				<ul class="vega-share-list">
					{#each shareState.links as link (link.id)}
						<li>
							<strong>{linkName(link)}</strong>
							<span>{ctx.t(expired(link) ? 'editor.share.expired' : 'editor.share.active')}</span>
							<span>{ctx.t('editor.share.createdAt', { date: date(link.createdAt) })}</span>
							<span>{ctx.t('editor.share.expiresAt', { date: date(link.expiresAt) })}</span>
							<button
								type="button"
								class="vega-admin-btn"
								data-share-link={link.id}
								aria-label={ctx.t('editor.share.revokeNamed', { label: linkName(link) })}
								aria-disabled={busy || !allowed || expired(link)}
								onclick={() => confirmRevoke(link)}>{ctx.t('editor.share.revoke')}</button
							>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="vega-admin-dialog-text">{ctx.t('editor.share.noRecovery')}</p>
			{#if shareState.uncertain && shareState.listPhase === 'ready'}<button
					type="button"
					class="vega-admin-btn"
					aria-disabled={busy}
					onclick={() => void load()}>{ctx.t('editor.share.refresh')}</button
				>{/if}
		{:else if view === 'create'}
			<div class="vega-admin-form">
				<div class="vega-admin-field">
					<label for={`${id}-label`}>{ctx.t('editor.share.label')}</label>
					<input
						id={`${id}-label`}
						data-share-label
						class="vega-admin-input"
						bind:value={label}
						disabled={busy}
						aria-invalid={shareState.inputError === 'label'}
						aria-describedby={`${id}-label-help`}
						onkeydown={enter}
					/>
					<p id={`${id}-label-help`} class="vega-admin-dialog-text">
						{ctx.t('editor.share.labelHelp')}
					</p>
				</div>
				<div class="vega-admin-field">
					<label for={`${id}-amount`}>{ctx.t('editor.share.duration')}</label>
					<div class="vega-share-duration">
						<input
							id={`${id}-amount`}
							data-share-amount
							class="vega-admin-input"
							type="text"
							inputmode="numeric"
							bind:value={amount}
							disabled={busy}
							aria-invalid={shareState.inputError === 'duration'}
							aria-describedby={`${id}-duration-help`}
							onkeydown={enter}
						/>
						<select
							class="vega-admin-input"
							aria-label={ctx.t('editor.share.unit')}
							bind:value={unit}
							disabled={busy}
						>
							{#each ['seconds', 'minutes', 'hours', 'days'] as unitName (unitName)}<option
									value={unitName}>{ctx.t(`editor.share.unit.${unitName}`)}</option
								>{/each}
						</select>
					</div>
					<p id={`${id}-duration-help`} class="vega-admin-dialog-text">
						{ctx.t('editor.share.durationHelp')}
					</p>
				</div>
				{#if shareState.inputError}<p class="vega-share-error" role="alert">
						{ctx.t(`editor.share.validation.${shareState.inputError}`)}
					</p>{/if}
				{#if shareState.uncertain}<button
						type="button"
						class="vega-admin-btn"
						aria-disabled={busy}
						onclick={() => {
							if (!busy) {
								view = 'list';
								void load();
							}
						}}>{ctx.t('editor.share.refresh')}</button
					>{/if}
			</div>
		{:else if view === 'copy' && shareState.created}
			<p role="status" class="vega-admin-dialog-text">{ctx.t('editor.share.created')}</p>
			<p class="vega-admin-dialog-text">
				{ctx.t('editor.share.expiresAt', { date: date(shareState.created.expiresAt) })}
			</p>
			<div class="vega-admin-field">
				<label for={`${id}-url`}>{ctx.t('editor.share.url')}</label>
				<textarea
					id={`${id}-url`}
					data-share-url
					class="vega-admin-input vega-share-url"
					readonly
					rows="3"
					value={shareState.created.url}
					onfocus={(event) => event.currentTarget.select()}></textarea>
			</div>
			<p class="vega-admin-dialog-text">{ctx.t('editor.share.oneTime')}</p>
			{#if shareState.copied}<p role="status">{ctx.t('editor.share.copied')}</p>{/if}
			{#if copyFailed}<p class="vega-share-error" role="alert">
					{ctx.t('editor.share.copyFailed')}
				</p>{/if}
		{:else if view === 'close'}
			<p class="vega-admin-dialog-text">{ctx.t('editor.share.closeWarning')}</p>
		{:else if view === 'revoke' && revokeTarget}
			<p class="vega-admin-dialog-text"><b>{linkName(revokeTarget)}</b></p>
			<p class="vega-admin-dialog-text">{ctx.t('editor.share.revokeWarning')}</p>
		{/if}
		<p class="vega-share-zone">{ctx.t('editor.share.zone', { zone })}</p>
		{#snippet actions()}
			{#if view === 'close'}
				<button
					type="button"
					class="vega-admin-btn"
					data-share-keep
					onclick={() => {
						view = 'copy';
						void focusView();
					}}>{ctx.t('editor.share.keep')}</button
				>
				<button type="button" class="vega-admin-btn" onclick={finishClose}
					>{ctx.t('editor.share.closeWithoutCopy')}</button
				>
			{:else if view === 'revoke'}
				<button
					type="button"
					class="vega-admin-btn"
					data-share-revoke-cancel
					aria-disabled={busy}
					onclick={() => {
						if (!busy) void cancelRevoke();
					}}>{ctx.t('common.cancel')}</button
				>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--danger"
					aria-disabled={busy || !allowed}
					onclick={() => void revoke()}
					>{ctx.t(busy ? 'editor.share.revoking' : 'editor.share.revokeConfirm')}</button
				>
			{:else if view === 'create'}
				<button
					type="button"
					class="vega-admin-btn"
					aria-disabled={busy}
					onclick={() => {
						if (!busy) {
							view = 'list';
							void focusView();
						}
					}}>{ctx.t('common.cancel')}</button
				>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--primary"
					aria-disabled={createBlocked}
					onclick={() => void create()}
					>{ctx.t(
						shareState.pending === 'create' ? 'editor.share.creating' : 'editor.share.create'
					)}</button
				>
			{:else if view === 'copy'}
				<button type="button" class="vega-admin-btn" aria-disabled={busy} onclick={close}
					>{ctx.t('common.close')}</button
				>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--primary"
					aria-disabled={busy}
					onclick={() => void copy()}>{ctx.t('editor.share.copy')}</button
				>
			{:else}
				<button type="button" class="vega-admin-btn" onclick={close}>{ctx.t('common.close')}</button
				>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--primary"
					data-share-new
					aria-disabled={createBlocked}
					onclick={() => {
						if (!createBlocked) {
							view = 'create';
							void focusView();
						}
					}}>{ctx.t('editor.share.create')}</button
				>
			{/if}
		{/snippet}
	</AdminDialog>
</div>

<style>
	.vega-share-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
	}
	.vega-share-list li {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		padding: var(--pad-field);
		border: 1px solid var(--line);
		border-radius: var(--r);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.vega-share-list span,
	.vega-share-zone {
		color: var(--ink-2);
		font-size: 0.82rem;
		margin: 0;
	}
	.vega-share-duration {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--gap-field);
	}
	.vega-share-error {
		margin: 0;
		color: var(--danger);
		overflow-wrap: anywhere;
	}
	.vega-share-notice {
		padding: var(--pad-field);
		margin: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		color: var(--ink);
		background: var(--surface-2);
	}
	.vega-share-url {
		resize: vertical;
		font-family: var(--mono);
		overflow-wrap: anywhere;
	}
	.vega-share :global(.vega-admin-btn),
	.vega-share :global(.vega-admin-input) {
		min-height: 44px;
		height: auto;
		white-space: normal;
	}
	.vega-share :global(.vega-admin-icon-btn) {
		min-width: 44px;
		min-height: 44px;
	}
	@media (max-width: 600px) {
		.vega-share :global(.vega-admin-dialog-actions) {
			flex-direction: column;
		}
		.vega-share :global(.vega-admin-dialog-actions button) {
			width: 100%;
		}
	}
</style>
