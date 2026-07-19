<script lang="ts">
	/**
	 * `ToastHost.svelte` (Fase 2c, §2.3/§4.1 del contrato P3): pinta la cola de `toasts.svelte.ts`.
	 * Montado UNA VEZ en `+layout.svelte`, fuera del árbol condicional de estados globales (queda
	 * visible en cualquier estado del shell, incluida la carcasa autenticada).
	 *
	 * Dos regiones `aria-live` SEPARADAS, no una sola: los `error` persistentes son
	 * `assertive`/`role="alert"` (interrumpen la lectura en curso — es lo que justifica que sean
	 * persistentes, §2.3); `success`/`info` son `polite` (no interrumpen). Mezclarlas forzaría el
	 * nivel más agresivo para todo, y un `success` efímero no merece interrumpir.
	 *
	 * Ambas regiones solo se RENDERIZAN cuando tienen algo que mostrar (`{#if}`, no CSS
	 * `display:none`): un landmark `role="alert"` vacío y permanente en el DOM colisionaría con
	 * `getByRole('alert')` de otras superficies honestas del shell (p.ej. el error inline de
	 * `/login`, `ReloginModal`), que ya usan ese rol y esperan ser el único match.
	 *
	 * Fondo del toast (F7w-b): `--surface` (tarjeta), no `--surface-2` — flota sobre el lienzo,
	 * no está apilado sobre otra tarjeta.
	 */
	import { toastStore } from './toasts.svelte';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';

	const ctx = getVegaContext();

	const politeToasts = $derived(toastStore.entries.filter((entry) => entry.kind !== 'error'));
	const errorToasts = $derived(toastStore.entries.filter((entry) => entry.kind === 'error'));
</script>

<div class="vega-toast-host">
	{#if politeToasts.length > 0}
		<div class="vega-toast-region" aria-live="polite">
			{#each politeToasts as toastEntry (toastEntry.id)}
				<div class="vega-toast" data-kind={toastEntry.kind}>
					<span>{toastEntry.message}</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Persistente HASTA descartar (§2.3): siempre lleva botón de cierre; las efímeras de arriba
	     nunca lo necesitan porque desaparecen solas. -->
	{#if errorToasts.length > 0}
		<div class="vega-toast-region" role="alert" aria-live="assertive">
			{#each errorToasts as toastEntry (toastEntry.id)}
				<div class="vega-toast" data-kind="error">
					<span>{toastEntry.message}</span>
					<button
						type="button"
						class="vega-toast-dismiss"
						aria-label={ctx.t('toast.dismiss')}
						onclick={() => toastStore.dismiss(toastEntry.id)}
					>
						<Icon id="close" size={12} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.vega-toast-host {
		position: fixed;
		z-index: 60;
		right: var(--vega-space-gutter);
		bottom: var(--vega-space-gutter);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: min(22rem, calc(100vw - 2 * var(--vega-space-gutter)));
		pointer-events: none;
	}

	.vega-toast-region {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-toast {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
		font-size: 0.9rem;
		pointer-events: auto;
	}

	.vega-toast span {
		flex: 1;
	}

	.vega-toast[data-kind='success'] {
		border-color: var(--success);
	}

	.vega-toast[data-kind='error'] {
		border-color: var(--danger);
		background: var(--danger-soft);
	}

	.vega-toast-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.vega-toast-dismiss:hover {
		background: rgb(0 0 0 / 8%);
	}

	@media (prefers-reduced-motion: reduce) {
		.vega-toast {
			transition: none;
		}
	}
</style>
