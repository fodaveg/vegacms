<script lang="ts">
	/**
	 * `ActiveFilterChips.svelte` (M6 del rediseño de la lista, reabre R2, mockup `.toolbar .chip`):
	 * sustituye a `FilterChips.svelte` — las chips CON RECUENTO ("Todas · N", "draft · 12"…)
	 * siempre visibles se cambian por chips de **filtro ACTIVO removibles** (decisión de David,
	 * 2026-07-24): solo se pinta un chip por cada filtro que el usuario YA aplicó, con una ✕ que
	 * lo quita. Elegir un filtro NUEVO ya no pasa por aquí — vive en el menú diferido "Filtrar" de
	 * `ListToolbar.svelte` (botón + popup con las opciones de `statusFilterOptions`, sin
	 * recuentos). Componente TONTO en navegación, mismo reparto que el resto de `src/lib/list/**`:
	 * solo emite `onStatusChange`, `+page.svelte` decide la URL vía `navigateView`.
	 *
	 * **v1 pinta SOLO el chip de estado**, si `activeStatus !== null` — el ÚNICO filtro real de
	 * esta fase. Etiqueta legible vía `contentType.statusLabels?.[value] ?? value` (M4): degrada
	 * al valor CRUDO si el manifiesto no declara `statusLabels` para ese valor, o si
	 * `statusLabels` mismo es `null` — nunca revienta por un campo opcional.
	 *
	 * **Sin stub de autor (match 1:1 con el mockup, corrección tras QA de rediseño)**: una versión
	 * anterior pintaba SIEMPRE un chip "Autor: —" no interactivo como hueco de diseño para cuando
	 * hubiera un filtro de autor real. El mockup `aquelarre-dark.html` (`.toolbar .chip`) solo
	 * enseña chips de filtro REALMENTE activos — con 0 filtros, la fila queda vacía. Quitado sin
	 * sustituto: cuando exista un filtro de autor de verdad, este componente ganará su propio chip
	 * removible con el mismo patrón que el de estado, gateado por `activeAuthor !== null` (nunca
	 * un stub permanente).
	 *
	 * **Gate de visibilidad (mismo criterio que la extinta `FilterChips`)**: si
	 * `statusFilterOptions(contentType)` es `null` (el tipo no tiene convención de estado), este
	 * componente no pinta NADA — no puede haber un chip de estado activo si el tipo ni siquiera
	 * ofrece el menú "Filtrar".
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import { statusFilterOptions } from './search';
	import type { ResolvedContentType } from '$lib/model/types';

	interface Props {
		contentType: ResolvedContentType;
		/** Valor activo del filtro de estado (`viewState.status`), o `null` = sin filtro. */
		activeStatus: string | null;
		onStatusChange: (status: string | null) => void;
	}

	let { contentType, activeStatus, onStatusChange }: Props = $props();

	const ctx = getVegaContext();

	const hasFilterCapability = $derived(statusFilterOptions(contentType) !== null);

	/** Etiqueta legible del valor activo (ver cabecera): defensiva ante `statusLabels` ausente. */
	const activeStatusLabel = $derived(
		activeStatus !== null ? (contentType.statusLabels?.[activeStatus] ?? activeStatus) : ''
	);
</script>

{#if hasFilterCapability && activeStatus !== null}
	<div
		class="vega-active-filter-chips"
		role="group"
		aria-label={ctx.t('list.activeFilter.groupLabel')}
	>
		<span class="vega-afchip">
			<strong>{ctx.t('list.activeFilter.status.key')}</strong>
			{activeStatusLabel}
			<button
				type="button"
				aria-label={ctx.t('list.activeFilter.status.remove')}
				onclick={() => onStatusChange(null)}
			>
				<Icon id="close" size={10} />
			</button>
		</span>
	</div>
{/if}

<style>
	.vega-active-filter-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}

	/* Chip de filtro activo (mockup `.toolbar .chip`): píldora con acento, valor + ✕. */
	.vega-afchip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 28px;
		padding: 0 0.4rem 0 0.7rem;
		border-radius: 999px;
		font-size: 0.82rem;
		background: var(--accent-soft);
		color: var(--accent-text);
		border: 1px solid var(--accent-line);
		white-space: nowrap;
	}

	.vega-afchip strong {
		font-weight: 650;
	}

	.vega-afchip button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.vega-afchip button:hover {
		background: var(--active);
	}
</style>
