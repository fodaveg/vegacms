<script lang="ts">
	/**
	 * `/c/[type]` (§2.4, §3.3 del contrato P3; Fase 4c del contrato P4): marco de LISTADO + el
	 * resolutor de singleton por deep-link de 3a (§3.3, §7.B.12), intacto. Resuelve tres
	 * desenlaces que dependen solo del `ContentModel` ya cargado (P3-L2 garantiza sesión y modelo
	 * listos aquí, `getVegaContext()` nunca lanza en esta ruta):
	 *
	 * - `type` inexistente u oculto → `not-found` en contexto (§6.5): NO redirige a `/login`.
	 * - `type` con `singleton: true` → nunca pinta listado: resuelve la regla runtime de P2 §4.6
	 *   con `ctx.nav.toSingleton()`, el MISMO camino que usa un click de sidebar (`NavItem.svelte`)
	 *   — incluida su captura de errores de transporte vía `feedback.reportError` (P3-L3: ninguna
	 *   promesa rechazada suelta).
	 * - `type` normal → la tabla READ-ONLY montada de 4c/4d (columnas de 4a + estado de vista de
	 *   4b) + la toolbar de 4d (búsqueda D-P4.3, filtro de estado D-P4.4, orden por cabecera
	 *   D-P4.6) + el borrado de 4e: loading/vacío-colección/vacío-búsqueda/error + paginación, con
	 *   la insignia "Solo lectura" si `type.readonly` (view). Un `?page=` fuera de rango
	 *   (`items: []` pero `totalItems > 0`, ningún adaptador clampa `page`) NO se confunde con la
	 *   colección vacía: redirige a la última página válida (fix de code-review, L-P4.13, ver
	 *   `pageOutOfRange` más abajo). Un 0-resultados CON búsqueda/filtro activos tampoco se
	 *   confunde con la colección vacía de verdad: es `empty-search` (L-P4.12, ver `hasActiveFilters`
	 *   y el orden de ramas del marcado).
	 *
	 * **Borrado (Fase 4e, L-P4.11/L-P4.4/Audit H6)**: `RecordTable` emite `onDeleteRequest` por
	 * fila (ausente en tipos `readonly`, L-P4.9); esta ruta guarda el registro pendiente
	 * (`pendingDelete`) y monta `DeleteConfirm` — SIN ese diálogo NUNCA se llama a `ctx.port.delete`
	 * (L-P4.11). Al confirmar: éxito → toast + `listState.reload()` (repite la carga actual; si la
	 * fila borrada era la última de la página, el MISMO `$effect` de "página fuera de rango" de
	 * arriba retrocede solo, sin lógica nueva, L-P4.13); fallo → `ctx.feedback.reportError` (nunca
	 * el `status.error` del listado, que es solo para fallos de CARGA, L-P4.4) y la fila sigue en
	 * la tabla porque nunca se quitó de forma optimista (solo `reload()` en el camino de éxito).
	 *
	 * Guard P3-L9 (router-ready antes de navegar): esta ruta usa `onMount`, NO el patrón
	 * `afterNavigate` + `routerReady` del índice (`routes/+page.svelte`). Motivo (bug real
	 * encontrado al implementar esta fase, anotado para no repetirlo): `+layout.svelte` NO monta
	 * `{@render children()}` hasta que `modelStatus === 'ready'` (async); un deep-link DIRECTO
	 * (`page.goto('/c/tipo')`, sin navegación cliente previa) dispara UNA sola vez el evento
	 * `afterNavigate` de SvelteKit, en el instante de la hidratación — ANTES de que este
	 * componente llegue a montarse (el `{#if}` del layout aún lo tiene oculto). El callback local
	 * de `afterNavigate` registrado aquí llegaría tarde a ese único evento y JAMÁS se dispararía
	 * (no hay una segunda navegación que lo rescate), dejando el efecto de abajo bloqueado para
	 * siempre. El índice sale indemne solo porque SIEMPRE llega aquí vía una navegación cliente
	 * real (el `goto()` del guard de sesión tras el login), que sí genera un evento nuevo — pero
	 * el mismo hueco existe ahí para una recarga/deep-link directo a `/` con sesión ya válida.
	 * `onMount` es equivalente y robusto en ambos casos: este componente SOLO llega a existir
	 * después de que el layout resolvió sesión+modelo, momento en el que el router YA está
	 * asentado sin ninguna duda (la ventana de riesgo de la landmine de Lumbre — navegar durante
	 * el primer render síncrono, antes de hidratar — ya ha pasado hace rato). El mismo guard cubre
	 * ahora también la carga del listado (4c) y la navegación de `Pagination.goToPage`: ninguna de
	 * las dos dispara antes de `routerReady`.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import { deriveColumns } from '$lib/list/columns';
	import { parseViewState, viewStateToParams, type ViewStatePatch } from '$lib/list/query-state';
	import { cycleSort } from '$lib/list/sort';
	import { createListState } from '$lib/list/list-state.svelte';
	import { listRoute } from '$lib/nav/routes';
	import RouteState from '$lib/shell/RouteState.svelte';
	import RecordTable from '$lib/list/RecordTable.svelte';
	import Pagination from '$lib/list/Pagination.svelte';
	import ListToolbar from '$lib/list/ListToolbar.svelte';
	import DeleteConfirm from '$lib/list/DeleteConfirm.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));
	const columns = $derived(contentType ? deriveColumns(contentType) : []);
	// Estado de vista EFÍMERO de la URL (4b, D-P4.9): esta fase solo escribe `?page=`, pero
	// respeta el round-trip completo de `q`/`sort`/`status` si ya estuvieran en la URL (L-P4.13).
	const viewState = $derived(parseViewState(page.url.searchParams));

	let routerReady = $state(false);
	onMount(() => {
		routerReady = true;
	});

	$effect(() => {
		if (!routerReady || !contentType?.singleton) return;
		void ctx.nav.toSingleton(contentType.name);
	});

	const listState = createListState();

	// Dispara/recarga la carga del listado cuando cambian el tipo o la vista (deep-link, click de
	// paginación...). El anti-carrera (L-P4.10) vive en `list-state.svelte.ts`: una respuesta que
	// llega y ya no es la última emitida se descarta sin pisar `listState.status`.
	$effect(() => {
		if (!routerReady || !contentType || contentType.singleton) return;
		void listState.load(ctx, contentType, viewState);
	});

	// Snapshots reactivos de `listState.status` (en vez de `{@const}` en el marcado: `{@const}`
	// exige ser hijo INMEDIATO de un bloque `{#if}`/`{:else}`/… y aquí vive dentro de un `<div>`
	// de envoltorio) — `readyPage` no-null habilita las ramas "vacío"/"ready" sin repetir el
	// `status.kind === 'ready'` en cada una.
	const listStatus = $derived(listState.status);
	const readyPage = $derived(listStatus.kind === 'ready' ? listStatus.page : null);
	// El adaptador `memory` (y PB) NO clampan `page` a `totalPages` (§4.6/§4.2): un deep-link a
	// `?page=99` sobre un tipo con datos devuelve `items: []` pero `totalItems > 0`. Distingue eso
	// (fix de code-review, L-P4.13) de la colección REALMENTE vacía (`totalItems === 0`): la
	// primera es "página fuera de rango" (se redirige, ver `$effect` de abajo), la segunda es el
	// estado `empty-collection` de verdad.
	const pageOutOfRange = $derived(
		readyPage !== null && readyPage.items.length === 0 && readyPage.totalItems > 0
	);
	// Búsqueda o filtro de estado activos (Fase 4d, L-P4.12): distingue un 0-resultados CON
	// filtros (empty-search) de la colección REALMENTE vacía (empty-collection). El orden NO
	// cuenta como filtro para esta distinción (D-P4.6 nunca produce 0 resultados por sí solo).
	const hasActiveFilters = $derived(viewState.q !== '' || viewState.status !== null);
	// items.length === 0 SIN datos en ninguna página (totalItems === 0): ni "fuera de rango" (eso
	// exige totalItems > 0) ni "ready" — se bifurca en empty-search/empty-collection más abajo
	// según `hasActiveFilters`.
	const isEmpty = $derived(
		readyPage !== null && readyPage.items.length === 0 && readyPage.totalItems === 0
	);

	// ————— Borrado (Fase 4e, L-P4.11) —————
	// Registro pendiente de confirmar + su `label` ya resuelto (mismo `openText` de la fila,
	// reutilizado por `RecordTable` al emitir `onDeleteRequest` — DRY, ver su cabecera). `null` =
	// diálogo cerrado; es la ÚNICA condición que abre `DeleteConfirm` más abajo.
	let pendingDelete = $state<{ record: VegaRecord; label: string } | null>(null);
	// `true` mientras `ctx.port.delete` está en vuelo (deshabilita los botones del diálogo, evita
	// un doble envío con un doble click).
	let deleting = $state(false);
	// Destino de foco de reserva para `DeleteConfirm` (fix de code-review, ver su cabecera): el
	// `<h1>` del listado, `tabindex="-1"` en el marcado — estable frente a un borrado con éxito,
	// que se lleva por delante la fila (y su botón "Borrar") a la que el diálogo restauraría el
	// foco por defecto.
	let headingEl = $state<HTMLElement | null>(null);

	/** `RecordTable` (fila, `!contentType.readonly`) pide confirmar el borrado de `record`. Defensa
	 *  en profundidad (fix de code-review de 4e): con un borrado YA en vuelo (`deleting`), ignora
	 *  la petición — nunca reescribe `pendingDelete` a mitad de un `ctx.port.delete` ajeno (el
	 *  diálogo solo puede abrirse para un registro a la vez; `DeleteConfirm` ya hace lo mismo por
	 *  su lado con el guard de `handleConfirm`/`handleCancel`, esto cierra el hueco simétrico). */
	function requestDelete(record: VegaRecord, label: string): void {
		if (deleting) return;
		pendingDelete = { record, label };
	}

	/** "Cancelar" o `Esc` en `DeleteConfirm` (L-P4.11: cancelar no borra nada). */
	function cancelDelete(): void {
		if (deleting) return; // ignora Esc/backdrop mientras el borrado está en vuelo
		pendingDelete = null;
	}

	/**
	 * Confirma el borrado (§ borrado de la cabecera del fichero). Éxito: toast + `listState.reload()`
	 * (si la fila borrada era la última de la página, el `$effect` de "página fuera de rango" de
	 * arriba retrocede solo). Fallo: `ctx.feedback.reportError` (NUNCA el `status.error` del
	 * listado, que es solo para fallos de CARGA, L-P4.4) — el diálogo se cierra y la fila sigue en
	 * la tabla porque nunca se quitó de forma optimista.
	 *
	 * `record`/`label` se desestructuran de `pendingDelete` ANTES del `await` (fix de code-review:
	 * bug real, no solo defensivo) — `requestDelete()` ahora se ignora mientras `deleting` es
	 * `true`, así que `pendingDelete` no puede REESCRIBIRSE a mitad de este `await`, pero SÍ puede
	 * ponerse a `null` (p.ej. si `cancelDelete()` llegara a colarse). Leer `pendingDelete.label`
	 * DESPUÉS del `await` sería frágil ante ese caso — capturar `label` en una constante local
	 * ahora es la única lectura, y el toast de éxito queda garantizado correcto pase lo que pase
	 * con `pendingDelete` mientras tanto.
	 */
	async function confirmDelete(): Promise<void> {
		if (!pendingDelete || !contentType) return;
		const { record, label } = pendingDelete;
		deleting = true;
		try {
			await ctx.port.delete(contentType.name, record.id);
			ctx.feedback.toast(ctx.t('list.delete.success', { label }), { kind: 'success' });
			pendingDelete = null;
			listState.reload();
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error inesperado al borrar', err)
			);
			pendingDelete = null;
		} finally {
			deleting = false;
		}
	}

	/** Construye la URL del listado para `params` y navega (D-P4.9). Núcleo compartido de
	 *  `goToPage` (paginación de 4c, NO resetea nada) y `navigateView` (búsqueda/filtro/orden de
	 *  4d, SIEMPRE resetea a página 1) — ninguna de las dos duplica el `goto`/`listRoute`. */
	function navigate(type: ResolvedContentType, params: URLSearchParams): void {
		const qs = params.toString();
		void goto(`${listRoute(type.name)}${qs ? `?${qs}` : ''}`);
	}

	/** Navega a `targetPage` conservando el resto del `ViewState` (D-P4.9, L-P4.13). Guardado tras
	 *  `routerReady` (P3-L9): en la práctica un click de usuario solo puede ocurrir ya hidratado,
	 *  pero se guarda igual por consistencia con el resto de navegación programática del shell. */
	function goToPage(target: number): void {
		if (!routerReady || !contentType) return;
		navigate(contentType, viewStateToParams({ ...viewState, page: target }));
	}

	/** Navega aplicando `patch` sobre el `viewState` actual y RESETEANDO `page` a 1 (D-P4.3/
	 *  D-P4.4/D-P4.6): un filtro/búsqueda/orden nuevo siempre debe llevar a la primera página — a
	 *  diferencia de `goToPage`, que no toca nada más. Es el único punto de navegación que usan
	 *  `ListToolbar` (búsqueda/estado), la cabecera ordenable de `RecordTable` y la acción "Limpiar
	 *  filtros" del estado `empty-search`. Guardado tras `routerReady` (P3-L9). */
	function navigateView(patch: ViewStatePatch): void {
		if (!routerReady || !contentType) return;
		navigate(contentType, viewStateToParams({ ...viewState, ...patch, page: 1 }));
	}

	// Página fuera de rango (fix de code-review, L-P4.13): en vez de un callejón sin salida
	// (`empty-collection` con datos reales en otra página y sin paginación para volver),
	// redirige a la última página válida — el usuario aterriza en datos reales, con paginación.
	// Un solo redirect: tras `goToPage(totalPages)` la recarga trae `items.length > 0` y
	// `pageOutOfRange` vuelve a `false`, así que el efecto no vuelve a disparar.
	$effect(() => {
		if (!routerReady || !readyPage || !pageOutOfRange) return;
		goToPage(readyPage.totalPages);
	});
</script>

{#if !contentType}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundType.title')}
		body={ctx.t('errors.notFoundType.body', { type: typeParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else if contentType.singleton}
	<!-- La resolución de singleton está en vuelo (o a punto de arrancar tras router-ready): nunca
	     se pinta el listado para un singleton (§3.3). `aria-live` por consistencia con el estado de
	     carga global de `+layout.svelte`. -->
	<p aria-live="polite">{ctx.t('common.loading')}</p>
{:else}
	<div class="vega-list-page">
		<div class="vega-list-heading">
			<!-- `tabindex="-1"` (fix de code-review de 4e): destino de foco programático de
			     `DeleteConfirm.fallbackFocusEl` tras un borrado con éxito, nunca alcanzable por Tab. -->
			<h1 tabindex="-1" bind:this={headingEl}>{contentType.label}</h1>
			{#if contentType.readonly}
				<span class="vega-list-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
			{/if}
		</div>

		<!-- La toolbar (Fase 4d) vive FUERA del switch de `listStatus`: solo depende de
		     `contentType`/`viewState` (URL), no de si la carga está en curso, en error o vacía — se
		     mantiene usable (y refleja el deep-link, L-P4.13) en cualquier estado. -->
		<ListToolbar
			{contentType}
			{viewState}
			onSearch={(q) => navigateView({ q })}
			onStatusChange={(status) => navigateView({ status })}
		/>

		{#if listStatus.kind === 'loading'}
			<p data-list-state="loading" aria-live="polite">{ctx.t('common.loading')}</p>
		{:else if listStatus.kind === 'error'}
			<div class="vega-list-error" data-list-state="error" role="alert">
				<h2>{ctx.t('list.error.title')}</h2>
				<p>{ctx.t('list.error.body', { message: listStatus.error.message })}</p>
				{#if listStatus.error.retryable}
					<button type="button" onclick={() => listState.retry()}>
						{ctx.t('common.retry')}
					</button>
				{/if}
			</div>
		{:else if pageOutOfRange}
			<!-- Página fuera de rango (fix de code-review, L-P4.13): el `$effect` de arriba ya
			     disparó `goToPage(totalPages)`; mientras esa recarga está en vuelo, un estado de
			     carga honesto — nunca el vacío-colección (habría datos reales en otra página). -->
			<p data-list-state="loading" aria-live="polite">{ctx.t('common.loading')}</p>
		{:else if isEmpty && hasActiveFilters}
			<!-- Vacío-búsqueda (L-P4.12): 0 resultados CON búsqueda o filtro de estado activos. NO es
			     la colección vacía de verdad (podría tener registros que la búsqueda/filtro descartan) —
			     por eso NUNCA la CTA "Crear" aquí, sino "Limpiar filtros" (resetea `q`/`status`, vuelve
			     a página 1 vía `navigateView`). -->
			<div class="vega-list-empty" data-list-state="empty-search">
				<h2>{ctx.t('list.emptySearch.title')}</h2>
				<p>{ctx.t('list.emptySearch.body', { label: contentType.label })}</p>
				<button type="button" onclick={() => navigateView({ q: '', status: null })}>
					{ctx.t('list.emptySearch.clear')}
				</button>
			</div>
		{:else if isEmpty}
			<div class="vega-list-empty" data-list-state="empty-collection">
				<h2>{ctx.t('list.empty.title')}</h2>
				<p>{ctx.t('list.empty.body', { label: contentType.label })}</p>
				{#if !contentType.readonly}
					<button type="button" onclick={() => ctx.nav.toNew(contentType.name)}>
						{ctx.t('list.empty.cta')}
					</button>
				{/if}
			</div>
		{:else if readyPage}
			<div data-list-state="ready">
				<RecordTable
					{contentType}
					{columns}
					records={readyPage.items}
					sort={viewState.sort}
					onSort={(field) => navigateView({ sort: cycleSort(viewState.sort, field) })}
					onDeleteRequest={requestDelete}
				/>
				<Pagination
					page={readyPage.page}
					totalPages={readyPage.totalPages}
					totalItems={readyPage.totalItems}
					onPrev={() => goToPage(readyPage.page - 1)}
					onNext={() => goToPage(readyPage.page + 1)}
				/>
			</div>
		{/if}
	</div>
{/if}

<DeleteConfirm
	open={pendingDelete !== null}
	recordLabel={pendingDelete?.label ?? ''}
	{deleting}
	fallbackFocusEl={headingEl}
	onConfirm={confirmDelete}
	onCancel={cancelDelete}
/>

<style>
	.vega-list-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	.vega-list-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.vega-list-heading h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	.vega-list-readonly-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--ink-2);
	}

	.vega-list-error,
	.vega-list-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-list-error h2,
	.vega-list-empty h2 {
		margin: 0;
		font-size: 1rem;
	}

	.vega-list-error p,
	.vega-list-empty p {
		margin: 0;
	}

	.vega-list-error button,
	.vega-list-empty button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
