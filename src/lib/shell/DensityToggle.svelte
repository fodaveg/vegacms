<script lang="ts">
	/**
	 * `DensityToggle.svelte` (R1 del rediseño C2, §3.6 del contrato P3): control SEGMENTADO
	 * Cómoda│Compacta de la topbar (mockup `.density`), en vez del botón único que ciclaba antes.
	 * Al montar, lee la densidad YA aplicada al documento (`+layout.svelte` llama
	 * `applyInitialTheme()` antes de que el shell renderice, así que `data-density` siempre está
	 * escrito cuando este componente monta); cada click FIJA (no cicla) la densidad pulsada y la
	 * persiste vía el setter de `theme/apply.ts` (`vega.density.v1`, §2.6). `aria-pressed` marca
	 * el segmento activo en cada botón (patrón de grupo segmentado: cada opción es su propio
	 * `aria-pressed`, no un único booleano).
	 *
	 * Estado activo (F7w-b, conservado): texto en `--accent-text` no aplica aquí (el segmento
	 * activo usa `--active`/`--ink` per mockup, el acento queda para "activo de navegación"); ver
	 * `.vega-density-toggle button[aria-pressed='true']`.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { setDensity } from '$lib/theme/apply';
	import type { Density } from '$lib/theme/preferences';

	const ctx = getVegaContext();

	function currentDensity(): Density {
		return document.documentElement.dataset.density === 'compact' ? 'compact' : 'comfortable';
	}

	let density = $state<Density>(currentDensity());

	function select(next: Density): void {
		if (next === density) return;
		density = next;
		setDensity(next);
	}
</script>

<span class="vega-density-toggle" role="group" aria-label={ctx.t('topbar.density.toggleLabel')}>
	<button
		type="button"
		aria-pressed={density === 'comfortable'}
		onclick={() => select('comfortable')}
	>
		{ctx.t('topbar.density.comfortable')}
	</button>
	<button type="button" aria-pressed={density === 'compact'} onclick={() => select('compact')}>
		{ctx.t('topbar.density.compact')}
	</button>
</span>

<style>
	.vega-density-toggle {
		display: inline-flex;
		border: 1px solid var(--line-strong);
		border-radius: 99px;
		overflow: hidden;
	}

	.vega-density-toggle button {
		border: 0;
		background: none;
		color: var(--ink-3);
		font-size: 0.6875rem;
		padding: 0.22rem 0.65rem;
		cursor: pointer;
	}

	.vega-density-toggle button[aria-pressed='true'] {
		background: var(--active);
		color: var(--ink);
		font-weight: 600;
	}

	/* Mismo punto de colapso ESTRUCTURAL (768px) que Topbar.svelte/Sidebar.svelte/
	   ConnectionStatus.svelte (§4.2): sin espacio en la topbar compacta de móvil, igual que
	   `.env` en el mockup. */
	@media (max-width: 768px) {
		.vega-density-toggle {
			display: none;
		}
	}
</style>
