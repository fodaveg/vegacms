<script lang="ts">
	/**
	 * `DensityToggle.svelte` (Fase 2b, §3.6 del contrato P3): toggle Cómoda ⇄ Compacta de la
	 * topbar. Al montar, lee la densidad YA aplicada al documento (`+layout.svelte` llama
	 * `applyInitialTheme()` antes de que el shell renderice, así que `data-density` siempre está
	 * escrito quando este componente monta); cada toggle la persiste y la refleja en la raíz vía
	 * el setter de `theme/apply.ts` (`vega.density.v1`, §2.6). `aria-pressed` = modo compacto
	 * activo.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { setDensity } from '$lib/theme/apply';
	import type { Density } from '$lib/theme/preferences';

	const ctx = getVegaContext();

	function currentDensity(): Density {
		return document.documentElement.dataset.density === 'compact' ? 'compact' : 'comfortable';
	}

	let density = $state<Density>(currentDensity());

	function toggle(): void {
		density = density === 'comfortable' ? 'compact' : 'comfortable';
		setDensity(density);
	}
</script>

<button
	type="button"
	class="vega-density-toggle"
	aria-pressed={density === 'compact'}
	onclick={toggle}
>
	{ctx.t('topbar.density.toggleLabel')}: {ctx.t(`topbar.density.${density}`)}
</button>

<style>
	.vega-density-toggle {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font-size: 0.8rem;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-density-toggle[aria-pressed='true'] {
		border-color: var(--vega-color-accent);
		color: var(--vega-color-accent);
	}
</style>
