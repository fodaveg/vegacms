<script lang="ts">
	/**
	 * `GlobalSearch.svelte` (R1 del rediseño C2 — mockup `vega-propuesta-C2-cabina-con-aire`):
	 * el buscador global centrado de la topbar. Vega todavía no tiene un backend de búsqueda que
	 * cruce todos los tipos de contenido (eso es un P posterior, fuera de este lote) — así que
	 * este componente es deliberadamente NO FUNCIONAL en el sentido de "no dispara ninguna
	 * consulta": el input no hace nada al escribir/enviar. Lo que SÍ es real y accesible:
	 *
	 * - El atajo `/` (documentado en el `<kbd>` visible, igual que el mockup): pulsarlo FUERA de
	 *   un campo editable enfoca el input. Dentro de un `<input>`/`<textarea>`/contenteditable
	 *   (incluido este mismo buscador) el `/` se escribe con normalidad, nunca se roba la tecla.
	 * - `aria-label` propio (el placeholder no es suficiente para lectores de pantalla que no
	 *   asocian placeholder con label).
	 *
	 * Cuando P-siguiente traiga búsqueda global de verdad, este componente gana un `onsubmit`/
	 * `oninput` que dispare la consulta — la interfaz (atajo + foco) no cambia.
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';

	const ctx = getVegaContext();

	let inputEl = $state<HTMLInputElement | null>(null);

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
	}

	function handleGlobalKeydown(event: KeyboardEvent): void {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;
		event.preventDefault();
		inputEl?.focus();
	}

	$effect(() => {
		document.addEventListener('keydown', handleGlobalKeydown);
		return () => document.removeEventListener('keydown', handleGlobalKeydown);
	});
</script>

<label class="vega-search">
	<Icon id="search" size={14} />
	<input
		bind:this={inputEl}
		type="search"
		placeholder={ctx.t('topbar.search.placeholder')}
		aria-label={ctx.t('topbar.search.ariaLabel')}
	/>
	<kbd aria-hidden="true">/</kbd>
</label>

<style>
	.vega-search {
		flex: 1;
		max-width: 28rem;
		/* Fix code-review (lote-1, 🟡): piso propio — sin esto, `flex:1` deja que el resto de la
		   topbar (wordmark/acciones, ambos `flex-shrink:0`) le pase TODO el squeeze en 769-900px
		   y el input se queda casi sin área de escritura. Ver también el `min-width` acotado del
		   wordmark en `Topbar.svelte` para ese mismo rango. */
		min-width: 8rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		padding: 0.42rem 0.75rem;
		color: var(--ink-3);
	}

	/* El mockup añade un halo `color-mix(...)` sobre el borde: `check-theme-coverage.mjs`
	   prohíbe `color-mix(`/color crudo fuera de `src/lib/themes/` (§5.4 del contrato P7, L1) —
	   ningún widget del formulario reconstruye ese halo tampoco, todos se apoyan en el mismo
	   cambio de `border-color` + el `:focus-visible` global (`--ring`, `theme/base.css`). */
	.vega-search:focus-within {
		border-color: var(--accent);
	}

	.vega-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--ink);
	}

	.vega-search input::placeholder {
		color: var(--ink-3);
	}

	.vega-search input:focus {
		outline: none;
	}

	.vega-search kbd {
		flex-shrink: 0;
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-3);
		border: 1px solid var(--line-strong);
		border-bottom-width: 2px;
		border-radius: 4px;
		padding: 0.08rem 0.35rem;
		background: var(--surface-2);
	}

	/* Mismo punto de colapso ESTRUCTURAL (768px) que el resto de la topbar (§4.2): el buscador
	   centrado no cabe en la topbar compacta de móvil junto al hamburguesa + acciones, y no hay
	   pantalla de resultados todavía que justifique un segundo estado dedicado — se oculta, igual
	   que `.density`/`.env` (ver `Topbar.svelte`). */
	@media (max-width: 768px) {
		.vega-search {
			display: none;
		}
	}
</style>
