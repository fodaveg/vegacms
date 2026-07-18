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
	 * - `type` normal → la tabla READ-ONLY montada de 4c (columnas de 4a + estado de vista de 4b):
	 *   loading/vacío-colección/error + paginación, con la insignia "Solo lectura" si
	 *   `type.readonly` (view). SIN orden/búsqueda (4d) y SIN borrado (4e) todavía. Un `?page=`
	 *   fuera de rango (`items: []` pero `totalItems > 0`, ningún adaptador clampa `page`) NO se
	 *   confunde con la colección vacía: redirige a la última página válida (fix de code-review,
	 *   L-P4.13, ver `pageOutOfRange` más abajo).
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
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import { deriveColumns } from '$lib/list/columns';
	import { parseViewState, viewStateToParams } from '$lib/list/query-state';
	import { createListState } from '$lib/list/list-state.svelte';
	import { listRoute } from '$lib/nav/routes';
	import RouteState from '$lib/shell/RouteState.svelte';
	import RecordTable from '$lib/list/RecordTable.svelte';
	import Pagination from '$lib/list/Pagination.svelte';

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

	/** Navega a `targetPage` conservando el resto del `ViewState` (D-P4.9, L-P4.13). Guardado tras
	 *  `routerReady` (P3-L9): en la práctica un click de usuario solo puede ocurrir ya hidratado,
	 *  pero se guarda igual por consistencia con el resto de navegación programática del shell. */
	function goToPage(target: number): void {
		if (!routerReady || !contentType) return;
		const params = viewStateToParams({ ...viewState, page: target });
		const qs = params.toString();
		void goto(`${listRoute(contentType.name)}${qs ? `?${qs}` : ''}`);
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
			<h1>{contentType.label}</h1>
			{#if contentType.readonly}
				<span class="vega-list-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
			{/if}
		</div>

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
		{:else if readyPage && readyPage.items.length === 0}
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
				<RecordTable {contentType} {columns} records={readyPage.items} />
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
		border: 1px solid var(--vega-color-border);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--vega-color-text-muted);
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
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg-raised);
		cursor: pointer;
	}
</style>
