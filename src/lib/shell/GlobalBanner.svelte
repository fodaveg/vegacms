<script lang="ts">
	/**
	 * `GlobalBanner.svelte` (Fase 2c, §2.3/§3.4 del contrato P3): pinta el `VegaError`
	 * 'network'/'backend' que `transportFeedback.report()` acumula cuando aflora a MITAD de sesión
	 * (§2.3, `FeedbackApi.reportError`) — los de ARRANQUE los sigue pintando `+layout.svelte` como
	 * pantalla completa (§3.1.1); este banner vive FUERA de ese árbol condicional, así que su
	 * aparición nunca desmonta el `AppShell` que hay debajo.
	 *
	 * - `'network'` → título honesto + botón "Reintentar" (sondea con un `listContentTypes()`
	 *   barato e idempotente vía `transportFeedback.retry`, sin tocar `modelStatus`).
	 * - `'backend'` → el `message` real del error (NUNCA `err.cause`, P1 §5); solo descartable.
	 * - Ambos: botón de descarte (§2.3, "Descartable").
	 */
	import { getVegaContext } from '$lib/app-context';
	import { transportFeedback } from './transport-feedback.svelte';
	import Icon from '$lib/icons/Icon.svelte';

	const ctx = getVegaContext();

	const err = $derived(transportFeedback.bannerError);
	const retrying = $derived(transportFeedback.state === 'retrying');

	async function handleRetry(): Promise<void> {
		await transportFeedback.retry(async () => {
			await ctx.port.listContentTypes();
		});
	}
</script>

{#if err}
	<div class="vega-global-banner" role="alert" data-kind={err.kind}>
		<Icon id="warning" size={16} />
		<p class="vega-global-banner-message">
			{err.kind === 'network' ? ctx.t('errors.network.title') : err.message}
		</p>
		<div class="vega-global-banner-actions">
			{#if err.kind === 'network'}
				<button type="button" onclick={handleRetry} disabled={retrying}>
					{retrying ? ctx.t('common.loading') : ctx.t('errors.network.retry')}
				</button>
			{/if}
			<button
				type="button"
				class="vega-global-banner-dismiss"
				aria-label={ctx.t('common.close')}
				onclick={() => transportFeedback.dismiss()}
			>
				<Icon id="close" size={14} />
			</button>
		</div>
	</div>
{/if}

<style>
	.vega-global-banner {
		/* Posicionamiento FIJO delegado en `.vega-banner-stack` (`+layout.svelte`): ese wrapper es
		   quien se ancla bajo la topbar y apila este banner con `UpdateBanner` (P8) si ambos están
		   presentes a la vez, sin que se solapen. Este componente solo aporta su propia franja. */
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem var(--vega-space-gutter);
		border-bottom: 1px solid var(--danger);
		background: var(--danger-soft);
		color: var(--ink);
	}

	.vega-global-banner-message {
		flex: 1;
		margin: 0;
		font-size: 0.9rem;
	}

	.vega-global-banner-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.vega-global-banner-actions button {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-global-banner-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-global-banner-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0 !important;
	}
</style>
