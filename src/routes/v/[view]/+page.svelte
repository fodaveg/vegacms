<script lang="ts">
	/**
	 * `/v/[view]` (Fase L7c+L7d del roadmap `mergedViews`, P2 §mergedViews): marco de LISTADO de
	 * una vista fusionada — homóloga de `/c/[type]/+page.svelte` (Fase 4c del contrato P4) pero más
	 * simple: una vista fusionada NUNCA es singleton, NUNCA ofrece crear/borrar y NUNCA pagina
	 * (L7b: como mucho `MAX_PER_PAGE` por source, sin `?page=`) — así que esta ruta no necesita
	 * `ViewState`/`ListToolbar`/`FilterChips`/`Pagination`/`DeleteConfirm`: solo resuelve la vista,
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
	 * traduce eso al mínimo conjunto de escrituras vía `computeReorder` (módulo puro, REUTILIZADO
	 * tal cual del reorder por-colección de L4, sin tocar) y las persiste una a una, cada una en LA
	 * COLECCIÓN de SU fila (`row.source.collection`/`row.source.orderField`, ya resueltos por L7a y
	 * transportados en cada `MergedRow`, ver `merged-merge.ts`) — nunca asume que todas las filas
	 * movidas comparten colección. Por qué esto no colisiona entre tablas: Vega es dueño de la
	 * numeración; cada registro escribe en el `orderField` de SU PROPIA colección con el índice
	 * GLOBAL del merge — campos de tablas distintas son independientes entre sí, y el desempate
	 * `(collection, id)` de `mergeViewResults` (L7b) solo entra en juego para los empates iniciales
	 * (varias sources arrancando cada una en 0,1,2…); tras la primera escritura los valores ya son
	 * globalmente únicos, así que el desempate no vuelve a activarse.
	 *
	 * La CLAVE que se pasa a `computeReorder` es `"{type}:{id}"` (no solo `id`): dos colecciones
	 * distintas podrían en teoría compartir el mismo id de registro (improbable con los backends
	 * reales, pero el módulo no lo asume) — la clave compuesta es la MISMA que usa
	 * `mergeViewResults` para deduplicar (`recordKey`, `merged-merge.ts`), así que ya es la
	 * identidad real de una fila en este contexto.
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
	import { computeReorder } from '$lib/list/reorder';
	import { VegaError } from '$lib/backend/errors';
	import RouteState from '$lib/shell/RouteState.svelte';
	import MergedViewTable from '$lib/list/MergedViewTable.svelte';
	import type { MergedRow } from '$lib/list/merged-merge';

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

	// ————— Reorder cruzado (L7d, ver cabecera) —————

	/** `true` mientras una tanda de `ctx.port.update` sigue en vuelo (ver cabecera): deshabilita el
	 *  arrastre para no solapar dos reorders sobre el mismo conjunto mezclado. */
	let persisting = $state(false);

	/** Clave de fila REUTILIZADA del `each` del marcado (misma identidad que `mergeViewResults`
	 *  usa para deduplicar, ver cabecera): única dentro del conjunto mezclado aunque dos
	 *  colecciones compartieran algún día el mismo id de registro. */
	function rowKey(row: MergedRow): string {
		return `${row.record.type}:${row.record.id}`;
	}

	/** Handler de `onReorder` de `MergedViewTable` (ver cabecera del módulo): construye las claves/
	 *  valores actuales a partir de `status.rows` (el conjunto mezclado completo, la única "página"
	 *  que existe aquí — L7b nunca pagina), calcula el mínimo conjunto de updates
	 *  (`computeReorder`, REUTILIZADO sin cambios de L4) y los persiste uno a uno, cada uno en LA
	 *  COLECCIÓN de su propia fila. Sin updates (drop en el mismo sitio) es un no-op, ni siquiera
	 *  toca el puerto. Éxito → `listState.reload()`; fallo → `ctx.feedback.reportError` +
	 *  `listState.reload()` TAMBIÉN (fix de code-review): al ser reorder CRUZADO, un fallo a mitad
	 *  de tanda puede haber escrito ya `N` de los `updates` en una o dos colecciones antes de que
	 *  reviente el `N+1`-ésimo — sin recargar, la tabla se queda pintando el orden VIEJO (pre-drop)
	 *  mientras el backend ya tiene un orden PARCIALMENTE nuevo, divergencia silenciosa que un
	 *  reload posterior (navegar fuera y volver) descubriría de sopetón. Recargar tras el fallo
	 *  muestra el estado REAL del backend de inmediato, coherente con "nunca dejar la lista en un
	 *  estado inconsistente" (spec de esta fase). */
	async function handleReorder(fromIndex: number, toIndex: number): Promise<void> {
		if (status.kind !== 'ready' || persisting) return;
		const rows = status.rows;
		const orderedKeys = rows.map(rowKey);
		const currentValues: Record<string, number> = {};
		// `Record`, no `Map` (regla `svelte/prefer-svelte-reactivity`: un `Map` mutable en un
		// `.svelte` se marca como candidato a `SvelteMap` aunque, como aquí, sea puramente
		// imperativo dentro de una función — un objeto plano lo esquiva sin necesidad de esa
		// reactividad, que no aporta nada a un lookup de un solo gesto).
		const rowByKey: Record<string, MergedRow> = {};
		for (const row of rows) {
			const key = rowKey(row);
			currentValues[key] = row.orderValue;
			rowByKey[key] = row;
		}
		const updates = computeReorder(orderedKeys, currentValues, fromIndex, toIndex);
		if (updates.length === 0) return;
		persisting = true;
		try {
			for (const update of updates) {
				const row = rowByKey[update.id];
				if (!row) continue; // defensivo: no debería faltar, la clave sale del mismo `rows`
				await ctx.port.update(row.source.collection, row.record.id, {
					[row.source.orderField]: update.value
				});
			}
			listState.reload();
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend(ctx.t('list.reorder.error'), err)
			);
			// Ver cabecera: un fallo a mitad de tanda puede haber persistido YA parte de los
			// `updates` (en una o en las dos colecciones) — recarga para reflejar el estado REAL,
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
			<span class="vega-list-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
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
					reorderable={!persisting}
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

	.vega-list-readonly-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--ink-2);
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
