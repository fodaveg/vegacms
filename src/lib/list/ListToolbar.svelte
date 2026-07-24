<script lang="ts">
	/**
	 * `ListToolbar.svelte` (Fase 4d del contrato P4; R2 del rediseño C2 la reduce a SOLO
	 * búsqueda; M6 la reabre para sumar el MENÚ de elegir filtro): la búsqueda libre por-lista
	 * (D-P4.3) más, desde M6, el botón/desplegable "Filtrar" que ofrece las opciones crudas de
	 * `contentType.statusField` — por debajo de la cabecera de listado (`+page.svelte`).
	 * Componente TONTO a propósito, mismo reparto que `Pagination.svelte`: no navega por su
	 * cuenta, solo emite `onSearch`/`onStatusChange` — es `+page.svelte` quien decide la URL vía
	 * su `navigateView` (resetea `page` a 1, D-P4.9).
	 *
	 * **El filtro de estado se MUDÓ a `FilterChips.svelte` (R2) y ahora se REPARTE en dos piezas
	 * (M6, reabre R2)**: David decidió sustituir las chips CON RECUENTO (siempre visibles, una
	 * por opción) por chips de filtro ACTIVO removibles — ver `ActiveFilterChips.svelte`, que
	 * PINTA el filtro ya aplicado. El mecanismo para ELEGIR un filtro nuevo pasa a vivir AQUÍ,
	 * en la toolbar, como un menú diferido (patrón APG "menu button", mismo criterio que el
	 * submenú de usuario de `Topbar.svelte`): un botón "Filtrar" que despliega la lista de
	 * opciones CRUDAS de `statusFilterOptions` (compartida con `ActiveFilterChips`, `search.ts`),
	 * SIN recuentos (el porqué de quitarlos: ya no hace falta consultar el puerto solo para
	 * pintar un número que las chips de recuento antes mostraban). Elegir una opción cierra el
	 * menú y emite `onStatusChange`; quitar el filtro activo es responsabilidad de la ✕ de
	 * `ActiveFilterChips`, no de este menú.
	 *
	 * - **Búsqueda oculta/inerte sin campos elegibles (Audit H3)**: si `isSearchEnabled(contentType)`
	 *   es `false` (ningún campo `text`/`richtext`/`email`/`url` elegible), el input NO se pinta —
	 *   no hay forma de que el usuario teclee algo sin ningún efecto posible.
	 * - **Debounce del input (~300 ms)**: reduce cuántas `Query` dispara `list-state.svelte.ts` por
	 *   tecla — el anti-carrera de esa capa (L-P4.10) ya garantiza que una respuesta obsoleta nunca
	 *   pisa a la última, el debounce es solo higiene de tráfico, no una garantía de corrección.
	 * - **Controlado por `viewState.q` sin bucle input↔URL**: `searchText` es el estado LOCAL del
	 *   input (lo que se ve mientras el debounce está en vuelo); `lastKnownQ` recuerda el último
	 *   valor que este componente ya emitió (o con el que se hidrató), para distinguir un cambio de
	 *   `viewState.q` que llega de FUERA (deep-link, "Limpiar filtros", navegación atrás/adelante)
	 *   de la URL simplemente poniéndose al día con lo que el propio usuario acaba de teclear — sin
	 *   esa distinción, el `$effect` de sincronización pisaría el cursor del usuario en cada tecleo.
	 * - **Menú "Filtrar" ausente sin `statusField` (mismo criterio que `ActiveFilterChips`)**: si
	 *   `statusFilterOptions(contentType)` es `null`, el botón no se pinta — igual que las chips
	 *   viejas, un tipo sin convención de estado no ofrece nada que filtrar.
	 */
	import { untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { isSearchEnabled, statusFilterOptions } from './search';
	import Icon from '$lib/icons/Icon.svelte';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { ViewState } from './query-state';

	interface Props {
		contentType: ResolvedContentType;
		viewState: ViewState;
		/** Se dispara (con debounce) cuando el texto de búsqueda cambia. */
		onSearch: (q: string) => void;
		/** Se dispara al elegir una opción del menú "Filtrar" (M6). Nunca `null` desde aquí — quitar
		 *  el filtro activo es cosa de la ✕ de `ActiveFilterChips`, no de este menú. */
		onStatusChange: (status: string) => void;
	}

	let { contentType, viewState, onSearch, onStatusChange }: Props = $props();

	const ctx = getVegaContext();

	/** Espera tras la última tecla antes de emitir `onSearch` (ver cabecera). */
	const SEARCH_DEBOUNCE_MS = 300;

	const searchEnabled = $derived(isSearchEnabled(contentType));
	const filterOptions = $derived(statusFilterOptions(contentType));

	// Semilla inicial (`untrack`, mismo patrón que `ManifestEditor.svelte`): un `$state` poblado a
	// partir de una prop reactiva solo captura su valor INICIAL — es justo lo que queremos aquí (el
	// `$effect` de abajo es el único responsable de mantenerlo al día tras el montaje), pero sin
	// `untrack` Svelte lo marca como sospechoso (`state_referenced_locally`).
	let searchText = $state(untrack(() => viewState.q));
	let lastKnownQ = untrack(() => viewState.q);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Sincroniza `searchText` cuando `viewState.q` cambia por una vía QUE NO es este mismo
	// componente (ver cabecera): compara contra `lastKnownQ`, no contra `searchText` (que puede
	// llevar la delantera mientras el debounce todavía no ha emitido).
	//
	// FIX (code-review, bug real): un cambio EXTERNO de `q` (deep-link, "Limpiar filtros", el
	// select de estado navegando y reseteando la vista…) tiene que CANCELAR cualquier debounce
	// pendiente de un tecleo previo — si no, el `setTimeout` sigue vivo y ~300ms después emite
	// `onSearch` con el texto VIEJO, revirtiendo silenciosamente el cambio externo (p.ej. teclear
	// "xyzw" y pulsar "Limpiar filtros" antes de que dispare: sin este fix, el timer viejo navega
	// de vuelta a `?q=xyzw`). El mismo hueco podía colar un `onSearch`/`goto` tardío tras cambiar
	// de tipo (SvelteKit reutiliza el componente entre params de ruta) o tras desmontar.
	$effect(() => {
		const externalQ = viewState.q;
		if (externalQ !== lastKnownQ) {
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			searchText = externalQ;
			lastKnownQ = externalQ;
		}
	});

	// Cleanup al desmontar (mismo motivo que arriba): un debounce en vuelo no debe sobrevivir al
	// componente — evita un `onSearch`/`goto` disparado sobre una instancia ya fuera de escena.
	$effect(() => {
		return () => {
			if (debounceTimer !== null) clearTimeout(debounceTimer);
		};
	});

	/** `oninput` del buscador: actualiza el eco local al instante (`bind:value`) y reprograma el
	 *  debounce. Un tecleo nuevo cancela el timer anterior — solo el último valor tras la pausa
	 *  llega a emitirse. */
	function scheduleSearch(): void {
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		const value = searchText;
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			lastKnownQ = value;
			onSearch(value);
		}, SEARCH_DEBOUNCE_MS);
	}

	// ————— Menú "Filtrar" (M6, patrón APG "menu button" — mismo criterio que el submenú de
	// usuario de `Topbar.svelte`: click-fuera, `Escape`, y foco que sale del menú lo cierran). —————
	let filterMenuOpen = $state(false);
	let filterTriggerEl = $state<HTMLElement | null>(null);
	let filterMenuEl = $state<HTMLElement | null>(null);

	function toggleFilterMenu(): void {
		filterMenuOpen = !filterMenuOpen;
	}

	function closeFilterMenu(): void {
		filterMenuOpen = false;
	}

	/** Click en cualquier punto de la ventana mientras el menú está abierto: lo cierra salvo que
	 *  el click caiga dentro del disparador o del propio menú (mismo criterio que `Topbar`). */
	function handleFilterWindowClick(event: MouseEvent): void {
		if (!filterMenuOpen) return;
		const target = event.target as Node;
		if (filterTriggerEl?.contains(target) || filterMenuEl?.contains(target)) return;
		closeFilterMenu();
	}

	/** `Escape` cierra el menú y devuelve el foco al disparador (mismo criterio de a11y que
	 *  `Topbar.handleWindowKeydown`). */
	function handleFilterWindowKeydown(event: KeyboardEvent): void {
		if (!filterMenuOpen || event.key !== 'Escape') return;
		event.preventDefault();
		closeFilterMenu();
		filterTriggerEl?.focus();
	}

	/** El foco sale del disparador o del menú hacia otro control de la toolbar: cierra el menú
	 *  (mismo criterio que `Topbar.handleUserFocusOut`, evita un popover "colgado" tras Tab). */
	function handleFilterFocusOut(event: FocusEvent): void {
		if (!filterMenuOpen) return;
		const next = event.relatedTarget as Node | null;
		if (next && (filterTriggerEl?.contains(next) || filterMenuEl?.contains(next))) return;
		closeFilterMenu();
	}

	/** Elegir una opción del menú: cierra y emite `onStatusChange` — `+page.svelte` navega y
	 *  resetea a página 1 (D-P4.9), igual que el resto de controles de esta toolbar. */
	function selectStatus(option: string): void {
		closeFilterMenu();
		onStatusChange(option);
	}
</script>

<svelte:window onclick={handleFilterWindowClick} onkeydown={handleFilterWindowKeydown} />

{#if searchEnabled}
	<!-- Mismo tratamiento visual que `.gsearch` de la topbar (`GlobalSearch.svelte`, R1), pero SIN
	     el `<kbd>` de atajo (este buscador no tiene uno propio): campo por-lista, funcional de
	     verdad (a diferencia del global). -->
	<label class="vega-list-search">
		<Icon id="search" size={14} />
		<input
			type="search"
			placeholder={ctx.t('list.search.placeholder')}
			aria-label={ctx.t('list.search.ariaLabel')}
			bind:value={searchText}
			oninput={scheduleSearch}
		/>
	</label>
{/if}

{#if filterOptions !== null}
	<!-- Menú "Filtrar" (M6, mockup `aquelarre-dark.html` no lo dibuja explícito — es la pieza
	     nueva que sustituye a "elegir entre chips siempre visibles"): botón + popup ancorado
	     debajo, SIN recuentos (ver cabecera). -->
	<div class="vega-list-filter" onfocusout={handleFilterFocusOut}>
		<button
			type="button"
			bind:this={filterTriggerEl}
			class="vega-list-filter-trigger"
			aria-haspopup="menu"
			aria-expanded={filterMenuOpen}
			aria-controls="vega-list-filter-menu"
			onclick={toggleFilterMenu}
		>
			{ctx.t('list.filter.menu.trigger')}
			<Icon id="chevron" size={12} />
		</button>
		{#if filterMenuOpen}
			<div
				id="vega-list-filter-menu"
				class="vega-list-filter-menu"
				role="menu"
				aria-label={ctx.t('list.filter.groupLabel')}
				bind:this={filterMenuEl}
			>
				{#each filterOptions as option (option)}
					<button
						type="button"
						role="menuitem"
						aria-current={viewState.status === option ? 'true' : undefined}
						onclick={() => selectStatus(option)}
					>
						{contentType.statusLabels?.[option] ?? option}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Sin `margin-bottom` propio (a diferencia de antes de M6): ahora vive dentro de
	   `.vega-list-toolbar` (`+page.svelte`), el flex row que reparte el espaciado entre la
	   búsqueda, el menú "Filtrar" y las chips activas — mismo criterio que `.toolbar` del mockup. */
	.vega-list-search {
		max-width: 22rem;
		min-width: 10rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		padding: 0.42rem 0.75rem;
		color: var(--ink-3);
	}

	.vega-list-search:focus-within {
		border-color: var(--accent);
	}

	.vega-list-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--ink);
	}

	.vega-list-search input::placeholder {
		color: var(--ink-3);
	}

	.vega-list-search input:focus {
		outline: none;
	}

	/* Menú "Filtrar" (M6, patrón APG "menu button" — mismos tokens que el submenú de usuario de
	   `Topbar.svelte`, tratamiento neutro como el resto de botones secundarios de la toolbar). */
	.vega-list-filter {
		position: relative;
	}

	.vega-list-filter-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 34px;
		padding: 0 0.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink-2);
		font-size: 0.85rem;
		font-weight: 550;
		cursor: pointer;
	}

	.vega-list-filter-trigger:hover,
	.vega-list-filter-trigger[aria-expanded='true'] {
		border-color: var(--accent);
		color: var(--ink);
	}

	.vega-list-filter-trigger :global(svg) {
		transform: rotate(90deg);
		transition: transform 0.12s ease;
	}

	.vega-list-filter-trigger[aria-expanded='true'] :global(svg) {
		transform: rotate(-90deg);
	}

	/* Popup: misma tarjeta mínima que `.vega-topbar-user-menu` (`--surface`/`--line`/
	   `--shadow-card`), anclada bajo el disparador. */
	.vega-list-filter-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		min-width: 10rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-list-filter-menu button {
		display: flex;
		align-items: center;
		border: 0;
		background: none;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		color: var(--ink);
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-list-filter-menu button:hover,
	.vega-list-filter-menu button:focus-visible {
		background: var(--active);
		color: var(--ink-hi);
	}

	.vega-list-filter-menu button[aria-current='true'] {
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
	}
</style>
