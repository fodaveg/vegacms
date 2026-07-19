<script lang="ts">
	/**
	 * Widget `relation` (F5-e, `type:'relation'`): busca candidatos del tipo destino
	 * (`field.schema.target`) por su `titleField` y los pinta como una selección de botones-toggle,
	 * mismo espíritu que `Chips.svelte` (grupo `role="group"`, `aria-labelledby={ids.labelId}` — un
	 * grupo de botones no es un control "labelable" por `<label for>`) pero con un buscador delante
	 * en vez de un vocabulario cerrado.
	 *
	 * - **Sin `expand` (D-P5.9 opción a)**: los YA seleccionados se resuelven con `ctx.port.get`
	 *   (uno por id, nunca visto) y se cachean por id (`relation-search.ts`, `TitleCache`) para no
	 *   re-pedir uno ya resuelto. Un `get` que falla con `not-found` pinta el id con la marca
	 *   "no encontrado" (registro borrado entre tanto) en vez de reventar.
	 * - **[Audit Finding 3] Degradado sin `titleField`**: si el destino no admite `contains` sobre
	 *   su `titleField` (`supportsTitleSearch`, `relation-search.ts`), NO hay buscador — se ofrece
	 *   un listado paginado (`Pagination.svelte`, reusado tal cual de P4) representando cada
	 *   candidato por su id.
	 * - **Anti-carrera (landmine)**: la autocancelación de PB está desactivada, así que dos
	 *   búsquedas en vuelo pueden resolver fuera de orden. `RelationSearchSequencer`
	 *   (`relation-search.ts`, mismo patrón que `RequestSequencer` de `$lib/list/list-load.ts`,
	 *   usado por `list-state.svelte.ts`) descarta cualquier respuesta que ya no sea la última
	 *   llamada emitida — se comparte entre la búsqueda por título Y el listado degradado (ambos
	 *   tocan el mismo puerto, una sola "última llamada" tiene sentido).
	 * - **Debounce (~250ms)**: solo aplica al buscador (modo no degradado); el listado degradado
	 *   pagina al instante (clic en Anterior/Siguiente, sin tecleo de por medio).
	 * - **`maxSelect` (múltiple)**: al alcanzarlo, los candidatos NO seleccionados se deshabilitan
	 *   (`toggleRelationSelection`, afordancia UX — la validación dura ya la hace F5-c/backend).
	 */
	import { onMount } from 'svelte';
	import type { WidgetProps } from './types';
	import type { RecordId, VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { fieldIds } from '../field-ids';
	import { getVegaContext } from '$lib/app-context';
	import Pagination from '$lib/list/Pagination.svelte';
	import {
		buildDegradedListQuery,
		buildTitleSearchQuery,
		candidatesFromPage,
		idsNeedingTitles,
		RelationSearchSequencer,
		supportsTitleSearch,
		titleOf,
		toggleRelationSelection,
		withCachedTitle,
		type RelationCandidate,
		type TitleCache,
		type TitleCacheEntry
	} from './relation-search';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);
	const schema = $derived(field.schema.type === 'relation' ? field.schema : null);
	const multiple = $derived(schema?.multiple ?? false);

	// Destino resuelto vía `ctx.model` (D-P5.9): el widget NUNCA conoce PocketBase, solo el
	// `ContentModel` ya resuelto por P2 y el `BackendPort` de P1.
	const target = $derived(
		schema ? (ctx.model.types.find((t) => t.name === schema.target) ?? null) : null
	);
	// Defensivo (no debería pasar — el manifiesto/esquema garantiza `target` válido, L11): sin
	// destino resuelto, degrada como si no soportara búsqueda (nada que listar/paginar).
	const degraded = $derived(target ? !supportsTitleSearch(target) : true);
	const titleField = $derived(target?.titleField ?? null);

	const selectedIds = $derived<RecordId[]>(
		multiple
			? Array.isArray(value)
				? (value as RecordId[])
				: []
			: typeof value === 'string' && value !== ''
				? [value]
				: []
	);
	const limitReached = $derived(
		multiple && schema?.maxSelect !== undefined && selectedIds.length >= schema.maxSelect
	);

	// Caché de títulos de los YA seleccionados (D-P5.9): objeto PLANO reemplazado por completo en
	// cada escritura (`withCachedTitle`, inmutable) — nunca mutado in-place, así que un `$state`
	// normal (no `$state.raw`) es seguro aquí (el landmine de F5-d era sobre mutar un Proxy
	// in-place, no sobre reasignar un objeto plano entero).
	let titleCache = $state<TitleCache>({});

	// Búsqueda por título (modo no degradado).
	let searchTerm = $state('');
	let searching = $state(false);
	let candidates = $state<RelationCandidate[]>([]);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const SEARCH_DEBOUNCE_MS = 250;

	// Listado paginado (modo degradado, Audit Finding 3).
	let degradedItems = $state<RelationCandidate[]>([]);
	let degradedLoading = $state(false);
	let degradedPage = $state(1);
	let degradedTotalPages = $state(1);
	let degradedTotalItems = $state(0);
	// Variable PLANA (no `$state`, mismo patrón que `lastCall` de `list-state.svelte.ts`): recuerda
	// para qué destino ya se disparó la carga inicial del listado degradado, para no repetirla en
	// cada re-render mientras el `$effect` de abajo sigue viendo el mismo `target`.
	let degradedLoadedFor: string | null = null;

	// Compartida entre la búsqueda por título y el listado degradado: ambas tocan el mismo puerto,
	// una sola "última llamada" basta (ver cabecera).
	const sequencer = new RelationSearchSequencer();

	// Ids con un `ctx.port.get` EN VUELO ahora mismo (fix de code-review de F5-e): registro
	// IMPERATIVO, nunca leído en el template (no necesita reactividad de Svelte) — mismo criterio
	// que `timers` de `toasts.svelte.ts`/`exitGuards` de `+layout.svelte`. Sin esto, el `$effect` de
	// resolución de títulos (más abajo) se reevalúa cada vez que CUALQUIER id cachea su título y
	// vuelve a ver "sin caché" a los que siguen en vuelo (aún no resueltos) — cascada O(n²) de
	// `get`s duplicados para n ids seleccionados a la vez, y un toast de error repetido si el fallo
	// no era `not-found` (no se cachea, así que sin este set se reintentaba en cada ciclo).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pendingTitleFetches = new Set<RecordId>();

	// `true` tras desmontar: una promesa en vuelo que resuelve después no debe escribir `$state`
	// (landmine, ver cabecera) — además del propio `sequencer`, que ya descarta lo obsoleto pero no
	// sabe de desmontaje.
	let destroyed = false;
	onMount(() => {
		return () => {
			destroyed = true;
			if (debounceTimer !== null) clearTimeout(debounceTimer);
		};
	});

	function reportUnexpected(err: unknown, action: string): void {
		ctx.feedback.reportError(
			err instanceof VegaError ? err : VegaError.backend('Error inesperado', err),
			{ action }
		);
	}

	async function runSearch(term: string): Promise<void> {
		if (!target || titleField === null) return;
		const seq = sequencer.next();
		searching = true;
		try {
			const page = await ctx.port.list(target.name, buildTitleSearchQuery(titleField, term));
			if (destroyed || !sequencer.isLatest(seq)) return; // stale: se descarta sin pintar
			candidates = candidatesFromPage(page, titleField);
		} catch (err) {
			if (destroyed || !sequencer.isLatest(seq)) return;
			candidates = [];
			reportUnexpected(err, 'relation:search');
		} finally {
			if (!destroyed && sequencer.isLatest(seq)) searching = false;
		}
	}

	function scheduleSearch(term: string): void {
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			void runSearch(term);
		}, SEARCH_DEBOUNCE_MS);
	}

	function handleSearchInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		searchTerm = raw;
		scheduleSearch(raw);
	}

	async function loadDegradedPage(page: number): Promise<void> {
		if (!target) return;
		const seq = sequencer.next();
		degradedLoading = true;
		try {
			const result = await ctx.port.list(target.name, buildDegradedListQuery(page));
			if (destroyed || !sequencer.isLatest(seq)) return;
			degradedItems = candidatesFromPage(result, null);
			degradedPage = result.page;
			degradedTotalPages = result.totalPages;
			degradedTotalItems = result.totalItems;
		} catch (err) {
			if (destroyed || !sequencer.isLatest(seq)) return;
			degradedItems = [];
			reportUnexpected(err, 'relation:degradedList');
		} finally {
			if (!destroyed && sequencer.isLatest(seq)) degradedLoading = false;
		}
	}

	// Carga inicial del listado degradado (única vía para ver candidatos: no hay buscador). Se
	// dispara una sola vez por destino (`degradedLoadedFor`), no en cada recálculo del `$effect`.
	$effect(() => {
		if (degraded && target && degradedLoadedFor !== target.name) {
			degradedLoadedFor = target.name;
			void loadDegradedPage(1);
		}
	});

	async function resolveTitle(id: RecordId): Promise<void> {
		if (!target) return;
		pendingTitleFetches.add(id); // ANTES del `get`: cierra la ventana en la que el próximo
		// recálculo del `$effect` (disparado por OTRO id resolviendo en el mismo tick) volvería a
		// verlo como "sin caché, sin pending" y lo pediría por segunda vez.
		try {
			const record: VegaRecord = await ctx.port.get(target.name, id);
			if (destroyed) return;
			titleCache = withCachedTitle(titleCache, id, {
				status: 'ok',
				title: titleOf(record, titleField)
			});
		} catch (err) {
			if (destroyed) return;
			if (err instanceof VegaError && err.kind === 'not-found') {
				titleCache = withCachedTitle(titleCache, id, { status: 'not-found' });
				return;
			}
			reportUnexpected(err, 'relation:resolveTitle');
		} finally {
			pendingTitleFetches.delete(id);
		}
	}

	// Resuelve el título de cada id seleccionado que todavía no esté en caché NI en vuelo (D-P5.9,
	// fix de code-review de F5-e): se re-evalúa cuando cambian los seleccionados o la propia caché
	// (cualquier resolución dispara este efecto de nuevo), pero `idsNeedingTitles` con
	// `pendingTitleFetches` descarta tanto los ya cacheados como los que ya están en curso, así que
	// SÍ evita re-pedirlos (antes de este fix, sí se re-pedían: ver `pendingTitleFetches` arriba).
	$effect(() => {
		const need = idsNeedingTitles(selectedIds, titleCache, pendingTitleFetches);
		for (const id of need) void resolveTitle(id);
	});

	/** Selecciona/deselecciona `candidate` (búsqueda o listado degradado). El título YA se conoce
	 *  (viene del propio resultado de `list()`) — se puebla la caché de inmediato (fix de
	 *  code-review: sin esto, el `$effect` de arriba disparaba un `get` redundante y el chip
	 *  parpadeaba mostrando el id crudo hasta que resolvía). Cachear también en el caso de
	 *  DESELECCIONAR es inofensivo: la caché es un mapa global por id, no depende de si `id` sigue
	 *  seleccionado ahora mismo. */
	function selectCandidate(candidate: RelationCandidate): void {
		if (inert) return;
		const { id, title } = candidate;
		if (multiple) {
			if (limitReached && !selectedIds.includes(id)) return;
			onChange(toggleRelationSelection(selectedIds, id, schema?.maxSelect));
		} else {
			onChange(selectedIds.includes(id) ? null : id);
		}
		titleCache = withCachedTitle(titleCache, id, { status: 'ok', title });
	}

	function removeSelected(id: RecordId): void {
		if (inert) return;
		onChange(multiple ? selectedIds.filter((x) => x !== id) : null);
	}

	/** Título a pintar para `id`, a partir de la entrada YA leída de `titleCache` (evita indexar la
	 *  caché dos veces cuando el llamador ya tiene `cached` de un `{@const}`). */
	function titleFor(cached: TitleCacheEntry | undefined, id: RecordId): string {
		return cached?.status === 'ok' ? cached.title : id;
	}
</script>

<div
	id={ids.inputId}
	class="vega-widget-relation"
	role="group"
	aria-labelledby={ids.labelId}
	data-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
	data-degraded={degraded ? 'true' : undefined}
>
	<ul class="vega-relation-selected">
		{#each selectedIds as id (id)}
			{@const cached = titleCache[id]}
			<li class="vega-relation-chip">
				<span>{titleFor(cached, id)}</span>
				{#if cached?.status === 'not-found'}
					<span class="vega-relation-not-found">{ctx.t('form.relation.notFound')}</span>
				{/if}
				{#if !inert}
					<button
						type="button"
						class="vega-relation-remove"
						onclick={() => removeSelected(id)}
						aria-label={ctx.t('form.relation.removeLabel', { title: titleFor(cached, id) })}
					>
						{ctx.t('form.relation.remove')}
					</button>
				{/if}
			</li>
		{/each}
		{#if selectedIds.length === 0}
			<li class="vega-relation-empty">{ctx.t('form.relation.emptySelection')}</li>
		{/if}
	</ul>

	{#if degraded}
		<p class="vega-relation-degraded-note">{ctx.t('form.relation.degradedNote')}</p>
		<ul class="vega-relation-candidates">
			{#if degradedLoading}
				<li class="vega-relation-status">{ctx.t('form.relation.searching')}</li>
			{:else if degradedItems.length === 0}
				<li class="vega-relation-status">{ctx.t('form.relation.noResults')}</li>
			{:else}
				{#each degradedItems as candidate (candidate.id)}
					{@const isSelected = selectedIds.includes(candidate.id)}
					<li>
						<button
							type="button"
							class="vega-relation-candidate"
							aria-pressed={isSelected}
							disabled={inert || (limitReached && !isSelected)}
							onclick={() => selectCandidate(candidate)}
						>
							{candidate.title}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
		{#if target}
			<Pagination
				page={degradedPage}
				totalPages={degradedTotalPages}
				totalItems={degradedTotalItems}
				onPrev={() => void loadDegradedPage(degradedPage - 1)}
				onNext={() => void loadDegradedPage(degradedPage + 1)}
			/>
		{/if}
	{:else}
		<input
			type="search"
			class="vega-relation-search"
			value={searchTerm}
			placeholder={ctx.t('form.relation.searchPlaceholder')}
			aria-label={ctx.t('form.relation.searchAriaLabel', { label: field.label })}
			disabled={inert}
			oninput={handleSearchInput}
		/>
		<ul class="vega-relation-candidates">
			{#if searching}
				<li class="vega-relation-status">{ctx.t('form.relation.searching')}</li>
			{:else if candidates.length === 0}
				<li class="vega-relation-status">
					{searchTerm.trim() === ''
						? ctx.t('form.relation.typeToSearch')
						: ctx.t('form.relation.noResults')}
				</li>
			{:else}
				{#each candidates as candidate (candidate.id)}
					{@const isSelected = selectedIds.includes(candidate.id)}
					<li>
						<button
							type="button"
							class="vega-relation-candidate"
							aria-pressed={isSelected}
							disabled={inert || (limitReached && !isSelected)}
							onclick={() => selectCandidate(candidate)}
						>
							{candidate.title}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.vega-widget-relation {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-relation-selected {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-relation-chip {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--vega-color-accent);
		border-radius: 999px;
		background: var(--vega-color-accent);
		color: var(--vega-color-accent-contrast);
		font-size: 0.85rem;
	}

	.vega-relation-not-found {
		font-style: italic;
		opacity: 0.85;
	}

	.vega-relation-remove {
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
	}

	.vega-relation-empty {
		color: var(--vega-color-text-muted);
		font-size: 0.85rem;
		list-style: none;
	}

	.vega-relation-search {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
	}

	.vega-relation-search:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-relation-candidates {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 12rem;
		overflow-y: auto;
	}

	.vega-relation-status {
		color: var(--vega-color-text-muted);
		font-size: 0.85rem;
	}

	.vega-relation-candidate {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 999px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-relation-candidate[aria-pressed='true'] {
		border-color: var(--vega-color-accent);
		background: var(--vega-color-accent);
		color: var(--vega-color-accent-contrast);
	}

	.vega-relation-candidate:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-relation-degraded-note {
		margin: 0;
		color: var(--vega-color-text-muted);
		font-size: 0.8rem;
	}

	.vega-widget-relation[data-invalid='true'] .vega-relation-search,
	.vega-widget-relation[data-invalid='true'] .vega-relation-candidate {
		border-color: var(--vega-color-danger);
	}
</style>
