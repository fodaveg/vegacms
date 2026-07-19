<script lang="ts">
	/**
	 * `ListToolbar.svelte` (Fase 4d del contrato P4; R2 del rediseño C2 la reduce a SOLO
	 * búsqueda): la búsqueda libre por-lista (D-P4.3) por debajo de la cabecera de listado
	 * (`ListHeader`-equivalente en `+page.svelte`, R2). Componente TONTO a propósito, mismo
	 * reparto que `Pagination.svelte`: no navega por su cuenta, solo emite `onSearch` — es
	 * `+page.svelte` quien decide la URL vía su `navigateView` (resetea `page` a 1, D-P4.9).
	 *
	 * **El filtro de estado se MUDÓ a `FilterChips.svelte` (R2)**: antes este componente pintaba
	 * un `<select id="vega-list-status">` con las opciones de `contentType.statusField` — el
	 * mockup C2 (`.listhead .filters`) lo sustituye por chips CON RECUENTO en la cabecera, junto
	 * al `<h1>` y el botón "Nueva". `statusFilterOptions` (antes una `$derived.by` privada de
	 * aquí) vive ahora en `search.ts`, compartida con `FilterChips`.
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
	 */
	import { untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { isSearchEnabled } from './search';
	import Icon from '$lib/icons/Icon.svelte';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { ViewState } from './query-state';

	interface Props {
		contentType: ResolvedContentType;
		viewState: ViewState;
		/** Se dispara (con debounce) cuando el texto de búsqueda cambia. */
		onSearch: (q: string) => void;
	}

	let { contentType, viewState, onSearch }: Props = $props();

	const ctx = getVegaContext();

	/** Espera tras la última tecla antes de emitir `onSearch` (ver cabecera). */
	const SEARCH_DEBOUNCE_MS = 300;

	const searchEnabled = $derived(isSearchEnabled(contentType));

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
</script>

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

<style>
	.vega-list-search {
		max-width: 22rem;
		min-width: 10rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;
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
</style>
