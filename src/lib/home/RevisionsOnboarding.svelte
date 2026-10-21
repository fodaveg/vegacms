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
	/* `.offer` de la lámina Inicio v2: tarjeta con un filo de marca a la izquierda. */
	.vega-revisions-offer {
		position: relative;
		overflow: hidden;
		box-sizing: border-box;
		width: 100%;
		padding: var(--sp-5);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}
	.vega-revisions-offer::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 4px;
		background: var(--accent-fill);
	}
	h2 {
		margin: 0 0 6px;
		font: 600 var(--fs-17) / 1.3 var(--display);
		font-variation-settings: 'opsz' 96;
		letter-spacing: -0.02em;
		color: var(--ink-hi);
	}
	p {
		margin: 0 0 var(--sp-2);
		max-width: 60ch;
		color: var(--ink-2);
		font-size: var(--fs-13);
	}
	.vega-revisions-offer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin: var(--sp-3) 0 var(--sp-2);
	}
	a,
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 36px;
		padding: 0 var(--sp-4);
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink);
		font: 500 var(--fs-13) var(--sans);
		white-space: nowrap;
		cursor: pointer;
		text-decoration: none;
	}
	a {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
	}
	a:hover {
		filter: brightness(1.06);
	}
	button:hover {
		background: var(--btn);
		border-color: var(--line-strong);
	}
	.vega-revisions-offer-hint {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-12);
	}
	@media (pointer: coarse) {
		a,
		button {
			min-height: 44px;
		}
	}
	@media (max-width: 640px) {
		.vega-revisions-offer {
			padding: var(--sp-4);
		}
		a,
		button {
			flex: 1 1 100%;
		}
	}
</style>
