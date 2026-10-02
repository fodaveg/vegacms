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
	 * - `'backend'` → el texto del catálogo si el error trae un `code` conocido (`vega-error-message.ts`) o, si no, el `message` real (NUNCA `err.cause`, P1 §5); solo descartable. Con texto del catálogo, el `message` original va debajo como detalle técnico secundario (si difiere).
	 * - Ambos: botón de descarte (§2.3, "Descartable").
	 */
	import { getVegaContext } from '$lib/app-context';
	import { transportFeedback } from './transport-feedback.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { vegaErrorMessage } from './vega-error-message';

	const ctx = getVegaContext();

	const err = $derived(transportFeedback.bannerError);
	const retrying = $derived(transportFeedback.state === 'retrying');
	// Texto principal y, si es el del catálogo (hay `backendCode`) y difiere del mensaje original,
	// ese mensaje como detalle técnico para quien administra. NUNCA `err.cause` (P1 §5).
	const shown = $derived(
		err
			? err.kind === 'network'
				? ctx.t('errors.network.title')
				: vegaErrorMessage(err, ctx.t)
			: ''
	);
	const detail = $derived(
		err && err.kind !== 'network' && err.backendCode && err.message !== shown ? err.message : null
	);

	async function handleRetry(): Promise<void> {
		await transportFeedback.retry(async () => {
			await ctx.port.listContentTypes();
		});
	}
</script>

{#if err}
	<div class="vega-global-banner" role="alert" data-kind={err.kind}>
		<Icon id="warning" size={16} />
		<div class="vega-global-banner-text">
			<p class="vega-global-banner-message">{shown}</p>
			{#if detail}
				<p class="vega-global-banner-detail" data-banner-detail>{detail}</p>
			{/if}
		</div>
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

	.vega-global-banner-text {
		flex: 1;
		min-width: 0;
	}

	.vega-global-banner-message {
		margin: 0;
		font-size: 0.9rem;
	}

	/* Detalle técnico (mensaje original del backend): secundario y pequeño; envuelve también las
	   cadenas largas sin espacios para no desbordar a 390 px. */
	.vega-global-banner-detail {
		margin: 0.15rem 0 0;
		font-size: 0.78rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
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

	/* Objetivo táctil de 44×44 (`scripts/check-touch-targets.mjs`, mismo patrón que `Topbar.svelte`):
	   con puntero basto el cierre y «Reintentar» llegan a 44 px; con ratón nada cambia. */
	@media (pointer: coarse) {
		.vega-global-banner-dismiss {
			width: 44px;
			height: 44px;
			min-width: 44px;
			min-height: 44px;
		}

		.vega-global-banner-actions button {
			min-height: 44px;
		}
	}
</style>
