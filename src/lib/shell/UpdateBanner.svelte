<script lang="ts">
	/**
	 * `UpdateBanner.svelte` (P8): franja discreta y descartable que avisa de una versión de Vega
	 * más nueva. Se monta UNA vez en `+layout.svelte`, hermano de `GlobalBanner` — mismo criterio
	 * (fuera del árbol condicional de estados globales, visible sobre cualquier ruta protegida sin
	 * desmontar el shell) — pero es un componente y una fuente de datos totalmente independientes:
	 * `GlobalBanner` pinta errores de TRANSPORTE del propio backend (`transportFeedback`); este
	 * banner solo lee `updateBannerState`, que a su vez solo lee lo que YA hay cacheado en
	 * `localStorage` (nunca dispara red por sí mismo, ver la cabecera de ese módulo).
	 *
	 * Renderiza `null` (el `{#if}` de abajo) salvo que haya una actualización disponible sin
	 * descartar — así montarlo siempre en el layout es seguro, igual que `ToastHost`/`GlobalBanner`.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { updateBannerState } from './update-banner.svelte';
	import Icon from '$lib/icons/Icon.svelte';

	const ctx = getVegaContext();

	const status = $derived(updateBannerState.status);
</script>

{#if updateBannerState.visible && status?.kind === 'update-available'}
	<div class="vega-update-banner" role="status" data-kind={status.kind}>
		<Icon id="update" size={16} />
		<p class="vega-update-banner-message">
			{ctx.t('update.banner.message', { version: status.latest })}
		</p>
		<div class="vega-update-banner-actions">
			<a href={status.releaseUrl} target="_blank" rel="noopener noreferrer">
				{ctx.t('update.banner.link')}
			</a>
			<button
				type="button"
				class="vega-update-banner-dismiss"
				aria-label={ctx.t('update.banner.dismiss')}
				onclick={() => updateBannerState.dismiss()}
			>
				<Icon id="close" size={14} />
			</button>
		</div>
	</div>
{/if}

<style>
	.vega-update-banner {
		/* Posicionamiento FIJO delegado en `.vega-banner-stack` (`+layout.svelte`, mismo criterio
		   que `.vega-global-banner`): ese wrapper ancla la pila bajo la topbar. Si `GlobalBanner`
		   también está visible (edge case raro: un error de transporte Y una actualización
		   pendiente a la vez), el wrapper los apila en columna en vez de solaparlos. */
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem var(--vega-space-gutter);
		border-bottom: 1px solid var(--accent);
		background: var(--surface-2);
		color: var(--ink);
	}

	.vega-update-banner-message {
		flex: 1;
		margin: 0;
		font-size: 0.9rem;
	}

	.vega-update-banner-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.vega-update-banner-actions a {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--accent-text);
		font-size: 0.85rem;
		text-decoration: none;
	}

	.vega-update-banner-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
</style>
