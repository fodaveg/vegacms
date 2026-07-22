<script lang="ts">
	/**
	 * `VegaLogo.svelte` — isotipo de marca de Vega (concepto «Lyra»: la constelación de la Lira, con
	 * Vega —su estrella más brillante— como único punto de acento). Sustituye al punto de acento
	 * provisional que el topbar usaba como «marca». SVG inline (cero recursos externos, CSP-safe).
	 * L10 enruta las tres paradas de firma (`--brand-a/b/c`) por estrella, trazo y órbita; los
	 * temas sin firma especial resuelven las tres al acento sólido. Decorativo por defecto
	 * (`aria-hidden`): el nombre del sitio contiguo ya aporta el texto accesible.
	 */
	let { size = 20 }: { size?: number } = $props();
</script>

<svg
	class="vega-logo"
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	aria-hidden="true"
>
	<g
		stroke="var(--brand-b)"
		stroke-opacity="0.4"
		stroke-width="1.3"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M9 6.5 L15 12 L13.5 20 L21 25.5 L24 16.5 L15 12" />
	</g>
	<circle
		cx="9"
		cy="6.5"
		r="5.4"
		fill="none"
		stroke="var(--brand-c)"
		stroke-opacity="0.3"
		stroke-width="0.9"
	/>
	<circle cx="15" cy="12" r="1.9" fill="currentColor" />
	<circle cx="24" cy="16.5" r="1.6" fill="currentColor" />
	<circle cx="13.5" cy="20" r="1.7" fill="currentColor" />
	<circle cx="21" cy="25.5" r="1.6" fill="currentColor" />
	<circle cx="9" cy="6.5" r="3.6" fill="var(--brand-a)" />
</svg>

<style>
	.vega-logo {
		display: block;
		flex-shrink: 0;
	}
</style>
