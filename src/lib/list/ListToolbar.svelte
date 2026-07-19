<script lang="ts">
	/**
	 * `ListToolbar.svelte` (Fase 4d del contrato P4): búsqueda libre (D-P4.3) + filtro de estado
	 * (D-P4.4) por encima del listado de `/c/[type]`. Componente TONTO a propósito, mismo reparto
	 * que `Pagination.svelte` (4c): no navega por su cuenta, solo emite `onSearch`/`onStatusChange`
	 * — es `+page.svelte` quien decide la URL vía su `navigateView` (resetea `page` a 1, D-P4.9).
	 *
	 * - **Búsqueda oculta/inerte sin campos elegibles (Audit H3)**: si `isSearchEnabled(contentType)`
	 *   es `false` (ningún campo `text`/`richtext`/`email`/`url` elegible), el input NO se pinta —
	 *   no hay forma de que el usuario teclee algo sin ningún efecto posible.
	 * - **Filtro de estado solo si `statusField` existe**: se resuelve el `ResolvedField` de
	 *   `contentType.statusField` y se leen sus `schema.options` (garantizado `select` no-múltiple
	 *   por la convención de P2, `resolveStatusField`); sin ese campo, sin select.
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
	import type { ResolvedContentType } from '$lib/model/types';
	import type { ViewState } from './query-state';

	interface Props {
		contentType: ResolvedContentType;
		viewState: ViewState;
		/** Se dispara (con debounce) cuando el texto de búsqueda cambia. */
		onSearch: (q: string) => void;
		/** Se dispara al instante al cambiar el select de estado; `null` = "Todos". */
		onStatusChange: (status: string | null) => void;
	}

	let { contentType, viewState, onSearch, onStatusChange }: Props = $props();

	const ctx = getVegaContext();

	/** Espera tras la última tecla antes de emitir `onSearch` (ver cabecera). */
	const SEARCH_DEBOUNCE_MS = 300;

	const searchEnabled = $derived(isSearchEnabled(contentType));

	/** Opciones del `statusField` resuelto, o `null` si el tipo no tiene convención de estado
	 *  (§D-P4.4). `schema.type !== 'select'` es defensivo: la convención de P2 ya lo garantiza,
	 *  pero este módulo no confía ciegamente en esa invariante ajena (mismo criterio que el resto
	 *  de `src/lib/list/**`, que degrada en vez de asumir). */
	const statusOptions = $derived.by((): string[] | null => {
		if (contentType.statusField === null) return null;
		const field = contentType.fields.find((f) => f.name === contentType.statusField);
		if (!field || field.schema.type !== 'select') return null;
		return field.schema.options;
	});

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

	function handleStatusChange(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		onStatusChange(value === '' ? null : value);
	}
</script>

{#if searchEnabled || statusOptions}
	<div class="vega-list-toolbar">
		{#if searchEnabled}
			<input
				class="vega-list-toolbar-search"
				type="search"
				placeholder={ctx.t('list.search.placeholder')}
				aria-label={ctx.t('list.search.ariaLabel')}
				bind:value={searchText}
				oninput={scheduleSearch}
			/>
		{/if}
		{#if statusOptions}
			<div class="vega-list-toolbar-field">
				<label for="vega-list-status">{ctx.t('list.filter.status.label')}</label>
				<select id="vega-list-status" value={viewState.status ?? ''} onchange={handleStatusChange}>
					<option value="">{ctx.t('list.filter.status.all')}</option>
					{#each statusOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>
{/if}

<style>
	.vega-list-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--vega-space-gutter);
	}

	.vega-list-toolbar-search {
		flex: 1 1 16rem;
		min-width: 10rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
	}

	.vega-list-toolbar-field {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}

	.vega-list-toolbar-field label {
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-list-toolbar-field select {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.85rem;
	}
</style>
