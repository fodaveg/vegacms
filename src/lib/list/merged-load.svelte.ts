/**
 * Estado reactivo de la carga de una vista fusionada (Fase L7b, `mergedViews` en
 * `$lib/model/types`): dispara `ctx.port.list()` en PARALELO para cada `source` de la vista y
 * delega toda la fusión/orden en `mergeViewResults` (`merged-merge.ts`, módulo puro — ahí vive la
 * lógica delicada, testeada sin runas). Mismo patrón que `list-state.svelte.ts` (Fase 4c): anti-
 * carrera (`RequestSequencer` de `list-load.ts`), mapeo de error (`normalizeListError`) y
 * `auth-expired` SIEMPRE al overlay global vía `ctx.feedback.reportError`, nunca al estado local
 * (§2.3, mismo criterio que el listado mono-colección).
 *
 * Deliberadamente SIN paginación (coherente con L4 y el spec de L7): cada source pide como mucho
 * `MAX_PER_PAGE` (200) registros — el reorder manual (L7d) necesita el conjunto entero en una
 * sola página, así que paginar por-source rompería esa garantía. Si una source llega al tope,
 * `truncatedCollections` (`merged-merge.ts`) lo señala en el estado `ready` sin bloquear la carga
 * (señal suave; sin UI todavía, L7c la consumirá).
 *
 * Deliberadamente SIN `$app/navigation`/`$app/state` aquí, mismo motivo que `list-state.svelte.ts`:
 * expone una superficie IMPERATIVA (`load`/`retry`/`reload`) y es la ruta (fuera del alcance de
 * L7b) quien decide CUÁNDO llamar.
 */

import type { VegaAppContext } from '$lib/app-context';
import type { VegaError } from '$lib/backend/errors';
import { MAX_PER_PAGE } from '$lib/backend/query';
import type { ResolvedMergedView } from '$lib/model/types';
import { normalizeListError, RequestSequencer } from './list-load';
import { mergeViewResults, truncatedCollections, type MergedRow } from './merged-merge';

/** Estado de carga de una vista fusionada, unión discriminada por `kind` (mismo vocabulario que
 *  `ListLoadStatus` de `list-state.svelte.ts`: loading/ready/error). */
export type MergedLoadStatus =
	| { kind: 'loading' }
	| { kind: 'ready'; rows: MergedRow[]; truncatedCollections: string[] }
	| { kind: 'error'; error: VegaError };

export interface MergedListState {
	/** Estado ACTUAL de la última carga que no fue descartada por anti-carrera. */
	readonly status: MergedLoadStatus;
	/**
	 * Dispara la carga de `view`: una `ctx.port.list()` por `source` EN PARALELO
	 * (`Promise.all`), fusionadas por `mergeViewResults`. Anti-carrera: si al resolver ya no es
	 * la última llamada emitida, el resultado se descarta sin tocar `status`. `auth-expired` va
	 * SOLO a `ctx.feedback.reportError` (overlay global), nunca a `status.error`; el resto de
	 * `VegaErrorKind` (de CUALQUIER source: `Promise.all` rechaza con el primer error que
	 * llegue) se pinta en `status.error`.
	 */
	load(ctx: VegaAppContext, view: ResolvedMergedView): Promise<void>;
	/** Repite la ÚLTIMA carga disparada por `load()` (botón "Reintentar" del estado error). No-op
	 *  si `load()` no se ha llamado todavía. */
	retry(): void;
	/** Repite la ÚLTIMA carga (tras una mutación propia, p.ej. el reorder de L7d). Mismo
	 *  mecanismo que `retry()` (la misma función interna, ver `repeatLastLoad`). */
	reload(): void;
}

/** Construye un `MergedListState` vacío (arranca en `'loading'`, sin ninguna carga emitida). */
export function createMergedListState(): MergedListState {
	let status = $state<MergedLoadStatus>({ kind: 'loading' });
	const sequencer = new RequestSequencer();

	// Última llamada de `load()`, para que `retry()`/`reload()` puedan repetirla sin que el
	// llamador vuelva a pasar `ctx`/`view`. Imperativo a propósito (no `$state`), mismo criterio
	// que `lastCall` en `list-state.svelte.ts`.
	let lastCall: { ctx: VegaAppContext; view: ResolvedMergedView } | null = null;

	async function load(ctx: VegaAppContext, view: ResolvedMergedView): Promise<void> {
		lastCall = { ctx, view };
		const seq = sequencer.next();
		status = { kind: 'loading' };
		try {
			const pages = await Promise.all(
				view.sources.map((source) =>
					ctx.port.list(source.collection, {
						filter: source.where ?? undefined,
						sort: [{ field: source.orderField, dir: 'asc' }],
						perPage: MAX_PER_PAGE
					})
				)
			);
			if (!sequencer.isLatest(seq)) return; // respuesta obsoleta (anti-carrera): se descarta
			const rows = mergeViewResults(
				view,
				pages.map((page) => page.items)
			);
			status = { kind: 'ready', rows, truncatedCollections: truncatedCollections(view, pages) };
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			const vegaErr = normalizeListError(err);
			if (vegaErr.kind === 'auth-expired') {
				// Mismo criterio que `list-state.svelte.ts` (§2.3): el overlay global tapa la ruta
				// entera, así que da igual que la vista se quede en 'loading' hasta reautenticar.
				ctx.feedback.reportError(vegaErr);
				return;
			}
			status = { kind: 'error', error: vegaErr };
		}
	}

	/** Máquina interna compartida de `retry()`/`reload()`: repite `lastCall` tal cual, reentrando
	 *  por el mismo `load()` (mismo `RequestSequencer`). */
	function repeatLastLoad(): void {
		if (!lastCall) return;
		void load(lastCall.ctx, lastCall.view);
	}

	return {
		get status() {
			return status;
		},
		load,
		retry: repeatLastLoad,
		reload: repeatLastLoad
	};
}
