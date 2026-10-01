<script lang="ts">
	/**
	 * `/v/[view]` (Fase L7c+L7d del roadmap `mergedViews`, P2 §mergedViews): marco de LISTADO de
	 * una vista fusionada — homóloga de `/c/[type]/+page.svelte` (Fase 4c del contrato P4) pero más
	 * simple: una vista fusionada NUNCA es singleton, NUNCA ofrece crear/borrar y NUNCA pagina
	 * (L7b: como mucho `MAX_PER_PAGE` por source, sin `?page=`) — así que esta ruta no necesita
	 * `ViewState`/`ListToolbar`/`ActiveFilterChips`/`Pagination`/`DeleteConfirm`: solo resuelve la vista,
	 * dispara la carga (`merged-load.svelte.ts`, L7b) y pinta los tres estados honestos
	 * (loading/error/tabla) que expone `MergedListState`.
	 *
	 * - `view` inexistente (id fuera de `ctx.model.mergedViews`, que YA solo contiene vistas con
	 *   >= 1 source válida, L7a) → `not-found` en contexto (§6.5 del contrato P3), NUNCA redirige a
	 *   `/login`. Mismo patrón que `resolveVisibleContentType` de `/c/[type]`.
	 * - `view` resuelta → dispara `listState.load(ctx, view)` y delega el marcado de filas a
	 *   `MergedViewTable.svelte` (L7c/L7d): esta ruta no sabe nada de `MergedRow` MÁS ALLÁ de lo
	 *   que necesita para reordenar (ver abajo), solo pasa `status.rows`/`status.truncatedCollections`
	 *   tal cual.
	 *
	 * **Reorder cruzado (L7d)**: `MergedViewTable` emite `onReorder(fromIndex, toIndex)` con
	 * índices dentro del conjunto MEZCLADO (`status.rows`, todas las sources juntas). `handleReorder`
	 * traduce eso al mínimo conjunto de escrituras vía `planMergedReorder` (`$lib/list/merged-reorder`,
	 * que delega en `computeSpanReorder`, el mismo cálculo que `/c/[type]`) y las persiste con
	 * `persistMergedReorder`, una a una, cada una en LA COLECCIÓN de SU fila
	 * (`row.source.collection`/`row.source.orderField`, ya resueltos por L7a y transportados en cada
	 * `MergedRow`, ver `merged-merge.ts`) — nunca asume que todas las filas movidas comparten
	 * colección. Con valores estrictamente crecientes en todo el conjunto, un arrastre de `k`
	 * posiciones escribe `k + 1` filas y conserva los huecos; con empates (el caso de partida de una
	 * vista, cada source arranca en 0,1,2…), repetidos o desordenados normaliza UNA vez a 0..n-1.
	 * Cada escritura pasa `orderOnlyField`: reordenar no crea revisión de historial (ver
	 * `withRevisions`). Por qué esto no colisiona entre tablas: Vega es dueño de la numeración; cada
	 * registro escribe en el `orderField` de SU PROPIA colección con un valor del orden GLOBAL del
	 * merge — campos de tablas distintos son independientes entre sí, y el desempate
	 * `(type, id)` de `mergeViewResults` (L7b) solo entra en juego con empates, que la normalización
	 * elimina.
	 *
	 * La CLAVE de fila es `"{type}:{id}"` (no solo `id`): la MISMA que usa `mergeViewResults` para
	 * deduplicar (`recordKey`, `merged-merge.ts`), así que ya es la identidad real de una fila aquí.
	 *
	 * **Cuándo NO se reordena** (`mergedReorderBlocker`, lote 7b): con una fuente caída (orden global
	 * parcial), con alguna fuente truncada (> 200 filas: se renumerarían solo las cargadas) o sin
	 * permiso de actualizar en ALGUNA fuente, el asa queda deshabilitada y la tabla explica por qué.
	 * Ya no hay rótulo fijo «Solo lectura» en la cabecera: era falso cuando sí se podía arrastrar.
	 *
	 * `persisting` deshabilita el arrastre (`reorderable={!persisting}`) mientras una tanda de
	 * `ctx.port.update` sigue en vuelo — evita solapar dos reorders sobre la misma tabla ya
	 * mutando, mismo espíritu defensivo que `deleting` en `/c/[type]/+page.svelte` (Fase 4e).
	 * Éxito → `listState.reload()` (mismo patrón que `handleReorder`/`confirmDelete` de L4/4e);
	 * fallo → `ctx.feedback.reportError` (nunca un estado local de error del listado, que es solo
	 * para fallos de CARGA).
	 *
	 * Guard P3-L9 (router-ready antes de navegar): `onMount`, NO `afterNavigate` — mismo motivo/bug
	 * evitado que `/c/[type]/+page.svelte` (ver su cabecera para el detalle): un deep-link DIRECTO
	 * a `/v/:id` dispara el único evento `afterNavigate` ANTES de que este componente llegue a
	 * montarse (detrás del `{#if modelStatus === 'ready'}` async de `+layout.svelte`).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { createMergedListState } from '$lib/list/merged-load.svelte';
	import { persistMergedReorder, planMergedReorder } from '$lib/list/merged-reorder';
	import { VegaError } from '$lib/backend/errors';
	import RouteState from '$lib/shell/RouteState.svelte';
	import MergedViewTable from '$lib/list/MergedViewTable.svelte';
	import { mergedReorderBlocker } from '$lib/list/merged-merge';

	const ctx = getVegaContext();

	const viewParam = $derived(page.params.view ?? '');
	const view = $derived(ctx.model.mergedViews.find((v) => v.id === viewParam) ?? null);

	let routerReady = $state(false);
	onMount(() => {
		routerReady = true;
	});

	const listState = createMergedListState();

	// Dispara/recarga la carga cuando cambia la vista resuelta (deep-link, click de sidebar). El
	// anti-carrera (`RequestSequencer`) vive en `merged-load.svelte.ts`, mismo criterio que el
	// listado mono-colección.
	$effect(() => {
		if (!routerReady || !view) return;
		void listState.load(ctx, view);
	});

	const status = $derived(listState.status);

	/** Por qué NO se puede reordenar (`mergedReorderBlocker`): fuente caída, truncado (> 200 filas
	 *  por fuente) o falta de permiso de actualizar en ALGUNA fuente. `null` mientras carga/error. */
	const reorderBlocker = $derived.by(() => {
		if (!view || status.kind !== 'ready') return null;
		return mergedReorderBlocker({
			failedSources: status.failedSources,
			truncatedCollections: status.truncatedCollections,
			canUpdate: view.sources.map(
				(source) =>
					ctx.model.types.find((t) => t.name === source.collection)?.permissions.update ?? false
			)
		});
	});

	// ————— Reorder cruzado (L7d, ver cabecera) —————

	/** `true` mientras una tanda de `ctx.port.update` sigue en vuelo (ver cabecera): deshabilita el
	 *  arrastre para no solapar dos reorders sobre el mismo conjunto mezclado. */
	let persisting = $state(false);

	/** Handler de `onReorder` de `MergedViewTable` (ver cabecera del módulo): calcula las escrituras
	 *  mínimas sobre `status.rows` (el conjunto mezclado completo, la única "página" que existe
	 *  aquí — L7b nunca pagina) con `planMergedReorder` y las persiste con `persistMergedReorder`
	 *  (cada una en LA COLECCIÓN de su fila y con `orderOnlyField`). Sin escrituras (drop en el mismo
	 *  sitio) es un no-op, ni siquiera toca el puerto. Éxito → `listState.reload()`; fallo →
	 *  `ctx.feedback.reportError` +
	 *  `listState.reload()` TAMBIÉN (fix de code-review): al ser reorder CRUZADO, un fallo a mitad
	 *  de tanda puede haber escrito ya `N` de las escrituras en una o dos colecciones antes de que
	 *  reviente el `N+1`-ésimo — sin recargar, la tabla se queda pintando el orden VIEJO (pre-drop)
	 *  mientras el backend ya tiene un orden PARCIALMENTE nuevo, divergencia silenciosa que un
	 *  reload posterior (navegar fuera y volver) descubriría de sopetón. Recargar tras el fallo
	 *  muestra el estado REAL del backend de inmediato, coherente con "nunca dejar la lista en un
	 *  estado inconsistente" (spec de esta fase). */
	async function handleReorder(fromIndex: number, toIndex: number): Promise<void> {
		// Defensivo: la tabla ya deshabilita el asa, pero el reorden con el conjunto incompleto o sin
		// permiso reescribiría órdenes parciales/fallaría a mitad (ver `mergedReorderBlocker`).
		if (status.kind !== 'ready' || persisting || reorderBlocker !== null) return;
		const writes = planMergedReorder(status.rows, fromIndex, toIndex);
		if (writes.length === 0) return;
		persisting = true;
		try {
			await persistMergedReorder(ctx.port, writes);
			listState.reload();
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend(ctx.t('list.reorder.error'), err)
			);
			// Ver cabecera: un fallo a mitad de tanda puede haber persistido YA parte de las
			// escrituras (en una o en las dos colecciones) — recarga para reflejar el estado REAL,
			// no el orden pre-drop que quedaría obsoleto en el DOM.
			listState.reload();
		} finally {
			persisting = false;
		}
	}
</script>

{#if !view}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundView.title')}
		body={ctx.t('errors.notFoundView.body', { view: viewParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else}
	<div class="vega-list-page">
		<div class="vega-list-header">
			<h1>{view.label}</h1>
		</div>

		<div class="vega-list-card">
			{#if status.kind === 'loading'}
				<p class="vega-list-card-pad" data-list-state="loading" aria-live="polite">
					{ctx.t('common.loading')}
				</p>
			{:else if status.kind === 'error'}
				<div class="vega-list-error vega-list-card-pad" data-list-state="error" role="alert">
					<h2>{ctx.t('list.error.title')}</h2>
					<p>{ctx.t('list.error.body', { message: status.error.message })}</p>
					{#if status.error.retryable}
						<button type="button" onclick={() => listState.retry()}>
							{ctx.t('common.retry')}
						</button>
					{/if}
				</div>
			{:else}
				<MergedViewTable
					rows={status.rows}
					truncatedCollections={status.truncatedCollections}
					failedSources={status.failedSources}
					reorderBlockedNotice={reorderBlocker
						? ctx.t(`list.merged.reorderBlocked.${reorderBlocker}`)
						: null}
					reorderable={!persisting && reorderBlocker === null}
					onReorder={handleReorder}
				/>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Mismo marco visual que `/c/[type]/+page.svelte` (mockup C2 `.listhead`/`.grid`): estilos
	   COPIADOS a propósito (Svelte no comparte CSS scoped entre rutas), recortados a lo que esta
	   ruta usa (sin `.vega-list-new-button`/spacer/paginación: una vista nunca ofrece "Nueva" ni
	   pagina, L7b). */
	.vega-list-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	.vega-list-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.vega-list-header h1 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--ink-hi);
		letter-spacing: -0.01em;
	}

	.vega-list-card {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.vega-list-card-pad {
		padding: 2rem 1.5rem;
		margin: 0;
	}

	p.vega-list-card-pad {
		color: var(--ink-2);
	}

	.vega-list-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-list-error h2 {
		margin: 0;
		font-size: 1rem;
	}

	.vega-list-error p {
		margin: 0;
	}

	.vega-list-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
