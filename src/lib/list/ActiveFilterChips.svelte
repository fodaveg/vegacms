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
	 * **v1 pinta dos piezas** (alcance de M6, ver la tarea):
	 * 1. Chip de **estado**, solo si `activeStatus !== null` — el ÚNICO filtro real de esta fase.
	 *    Etiqueta legible vía `contentType.statusLabels?.[value] ?? value` (M4, en curso en
	 *    paralelo): degrada al valor CRUDO si el manifiesto no declara `statusLabels` para ese
	 *    valor, o si `statusLabels` mismo es `null` — nunca revienta por un campo opcional.
	 * 2. Chip de **autor**: STUB DE DISEÑO, no funcional (David: "el diseño lo quiero igual, las
	 *    funciones ya las añadiremos" — no hay todavía ningún filtro de autor real en `ViewState`
	 *    ni en `buildListQuery`). A diferencia del chip de estado, es un `<span>` NO interactivo
	 *    (no un `<button>` inerte): un control focusable que no hace nada al activarlo sería peor
	 *    a11y que no ofrecer ningún control — mismo espíritu que el botón "Exportar" de M2 (visual
	 *    puro), pero aquí sin siquiera el affordance de "botón". Valor genérico (`—`), NUNCA un
	 *    nombre de la semilla de demo (`author: 'David'` de `blog` en `demo-seed.ts`): este
	 *    componente es compartido por CUALQUIER tipo de contenido (§ "Vega es GENÉRICO por
	 *    contrato"), no puede asumir que existe un campo `author` ni mucho menos su valor.
	 *
	 * **Gate de visibilidad (mismo criterio que la extinta `FilterChips`)**: si
	 * `statusFilterOptions(contentType)` es `null` (el tipo no tiene convención de estado), este
	 * componente no pinta NADA — ni el chip de estado (no puede haber uno activo) ni el stub de
	 * autor (sin ninguna capacidad de filtrado, mostrar el stub sería ruido en tipos que ni
	 * siquiera ofrecen el menú "Filtrar").
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

{#if hasFilterCapability}
	<div
		class="vega-active-filter-chips"
		role="group"
		aria-label={ctx.t('list.activeFilter.groupLabel')}
	>
		{#if activeStatus !== null}
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
		{/if}

		<!-- Stub de diseño, ver cabecera: `<span>` no interactivo a propósito, sin `<button>`. -->
		<span class="vega-afchip vega-afchip-stub" title={ctx.t('list.activeFilter.author.stubHint')}>
			<strong>{ctx.t('list.activeFilter.author.key')}</strong>
			{ctx.t('list.activeFilter.author.stubValue')}
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

	/* Stub de autor (ver cabecera): tratamiento neutro/apagado (NO `--accent-soft`) para no dar a
	   entender que es un filtro real ya aplicado — es solo el hueco de diseño para cuando exista
	   la función. */
	.vega-afchip-stub {
		background: var(--surface);
		color: var(--ink-3);
		border-color: var(--line-strong);
	}
</style>
