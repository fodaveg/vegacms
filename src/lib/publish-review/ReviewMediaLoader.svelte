<script lang="ts">
	/** Load the media editor only when a review finding opens it. Both editor surfaces share this
	 * boundary so the media detail and its dependencies stay out of their initial bundles. */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { RecordId } from '$lib/backend/types';
	import type { MediaItemView } from '$lib/media/media-item';
	import { tick } from 'svelte';

	interface Props {
		mediaId: RecordId | null;
		onClose: () => void;
		onSaved: (item: MediaItemView) => void;
		onDeleted: (id: RecordId) => void;
		fallbackFocusEl: HTMLElement | null;
	}

	let { mediaId, onClose, onSaved, onDeleted, fallbackFocusEl }: Props = $props();
	const ctx = getVegaContext();
	let Dialog = $state.raw<typeof import('./ReviewMediaDialog.svelte').default | null>(null);
	let loadingCloseEl = $state<HTMLButtonElement | null>(null);
	let loadingOpener: HTMLElement | null = null;
	let loadingRequest: { current: boolean } | null = null;

	/** Close the loading shell as the parent would close the real editor. The parent handles focus
	 * when the opener disappeared (the visual review popover); otherwise restore the opener. */
	function closeLoading(): void {
		const opener = loadingOpener;
		if (loadingRequest) loadingRequest.current = false;
		onClose();
		void tick().then(() => {
			if (opener?.isConnected) opener.focus();
		});
	}

	function handleLoadingKeydown(event: KeyboardEvent): void {
		// The editor screens listen on `window` for shortcuts. Keep every key from the focused
		// loading shell inside this modal before it reaches either screen's save/selection handler.
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			closeLoading();
		} else if (event.key === 'Tab') {
			event.preventDefault();
			loadingCloseEl?.focus();
		} else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
		}
	}

	$effect(() => {
		if (mediaId === null || Dialog !== null) return;
		const request = { current: true };
		loadingRequest = request;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		loadingOpener = opener;
		void tick().then(() => {
			if (request.current) loadingCloseEl?.focus();
		});
		void import('./ReviewMediaDialog.svelte')
			.then(({ default: component }) => {
				if (!request.current) return;
				if (opener?.isConnected) opener.focus();
				Dialog = component;
			})
			.catch((err: unknown) => {
				if (!request.current) return;
				ctx.feedback.reportError(
					err instanceof VegaError ? err : VegaError.backend('No se pudo abrir el medio', err),
					{ action: 'review:media' }
				);
				closeLoading();
			});
		return () => {
			request.current = false;
			if (loadingRequest === request) loadingRequest = null;
		};
	});
</script>

{#if Dialog}
	<Dialog {mediaId} {onClose} {onSaved} {onDeleted} {fallbackFocusEl} />
{:else if mediaId !== null}
	<div
		class="vega-review-media-loading"
		role="dialog"
		aria-modal="true"
		aria-label={ctx.t('common.loading')}
		tabindex="-1"
		onkeydown={handleLoadingKeydown}
	>
		<p role="status">{ctx.t('common.loading')}</p>
		<button
			class="vega-review-media-close"
			type="button"
			bind:this={loadingCloseEl}
			onclick={closeLoading}
		>
			{ctx.t('common.close')}
		</button>
	</div>
{/if}

<style>
	.vega-review-media-loading {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 1rem;
		background: var(--surface);
		color: var(--ink-2);
	}

	.vega-review-media-loading p {
		margin: 0;
	}

	.vega-review-media-close {
		min-height: 44px;
		padding: 0 1rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	.vega-review-media-close:hover {
		border-color: var(--line-strong);
	}
</style>
