<script lang="ts">
	/** Oferta contextual sin autoactivar: navega al bootstrap existente y permite descartarla. */
	import { getVegaContext } from '$lib/app-context';
	import { settingsRoute } from '$lib/nav/routes';
	import { backendInstallationKey, backendIsDemo } from '$lib/session/backend';
	import {
		dismissRevisionsOffer,
		isRevisionsOfferDismissed,
		shouldOfferRevisions
	} from './revisions-onboarding';
	let { onDismiss }: { onDismiss?: () => void } = $props();
	const ctx = getVegaContext();
	const identity = backendInstallationKey();
	let dismissed = $state(isRevisionsOfferDismissed(identity));
	const offered = $derived(
		!dismissed && shouldOfferRevisions(ctx.model, ctx.port.capabilities.schemaBootstrap)
	);
	function dismiss(): void {
		dismissed = true;
		dismissRevisionsOffer(identity);
		onDismiss?.();
	}
</script>

{#if offered}
	<section class="vega-revisions-offer" aria-labelledby="vega-revisions-offer-title">
		<h2 id="vega-revisions-offer-title">{ctx.t('home.revisions.title')}</h2>
		<p>{ctx.t('home.revisions.body')}</p>
		<p>{ctx.t('home.revisions.limits')}</p>
		{#if backendIsDemo()}<p>{ctx.t('home.revisions.demo')}</p>{/if}
		<div class="vega-revisions-offer-actions">
			<a href={`${settingsRoute()}#vega-revisions-settings-title`}
				>{ctx.t('home.revisions.prepare')}</a
			>
			<button type="button" onclick={dismiss}>{ctx.t('home.revisions.later')}</button>
		</div>
		<p class="vega-revisions-offer-hint">{ctx.t('home.revisions.dismissHint')}</p>
	</section>
{/if}

<style>
	.vega-revisions-offer {
		margin-block: 1.5rem;
		padding: 1.5rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}
	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}
	p {
		margin: 0 0 0.75rem;
		max-width: 64ch;
	}
	.vega-revisions-offer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-block: 1rem;
	}
	a,
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0.6rem 1rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
		text-decoration: none;
	}
	a {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
		font-weight: 600;
	}
	a:hover {
		background: var(--accent-hover);
	}
	button:hover {
		background: var(--active);
	}
	.vega-revisions-offer-hint {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.82rem;
	}
	@media (max-width: 640px) {
		.vega-revisions-offer {
			padding: 1rem;
		}
		a,
		button {
			flex: 1 1 100%;
		}
	}
</style>
