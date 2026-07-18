/**
 * Estado reactivo de la carga de un listado (Fase 4c del contrato P4): envuelve `ctx.port.list()`
 * en runas Svelte 5, con anti-carrera (L-P4.10, `RequestSequencer` de `list-load.ts`) y el mapeo
 * de error de §4c (local para todo salvo `auth-expired`, que va al overlay global, §2.3).
 *
 * Deliberadamente SIN `$app/navigation`/`$app/state` aquí (ni `$effect` que dispare la carga por
 * su cuenta): `src/lib/list/**` NO está en la lista de directorios exentos de
 * `svelte/no-navigation-without-resolve` (ver `eslint.config.js`, acotada a `src/routes/**` +
 * `src/lib/shell/**` + `src/lib/nav/**`), así que este módulo expone una superficie IMPERATIVA
 * (`load`/`retry`) y es `+page.svelte` (sí exento, y dueño de leer `page.url`/llamar `goto`) quien
 * decide CUÁNDO llamar, dentro de su propio `$effect` — mismo reparto de responsabilidades que
 * `+layout.svelte` orquestando `loadModel()` sobre `session.svelte.ts`.
 */

import { VegaError } from '$lib/backend/errors';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { VegaAppContext } from '$lib/app-context';
import type { ResolvedContentType } from '$lib/model/types';
import { buildListQuery } from './search';
import type { ViewState } from './query-state';
import { normalizeListError, RequestSequencer } from './list-load';

/** Estado de carga del listado, unión discriminada por `kind` (§4c: loading/ready/error). */
export type ListLoadStatus =
	| { kind: 'loading' }
	| { kind: 'ready'; page: Page<VegaRecord> }
	| { kind: 'error'; error: VegaError };

export interface ListState {
	/** Estado ACTUAL de la última carga que no fue descartada por anti-carrera. */
	readonly status: ListLoadStatus;
	/**
	 * Dispara una carga para `type`/`viewState`: construye la `Query` (`buildListQuery`, 4b) y
	 * llama a `ctx.port.list`. Anti-carrera: si al resolver ya no es la última llamada emitida, el
	 * resultado se descarta sin tocar `status` (L-P4.10). `auth-expired` se enruta SOLO a
	 * `ctx.feedback.reportError` (§2.3: overlay global de re-login), nunca al estado local; el
	 * resto de `VegaErrorKind` se pinta en `status.error` para que `+page.svelte` lo muestre en
	 * contexto (L-P4.4, Audit H2).
	 */
	load(ctx: VegaAppContext, type: ResolvedContentType, viewState: ViewState): Promise<void>;
	/** Repite la ÚLTIMA carga disparada por `load()` (botón "Reintentar" del estado error). No-op
	 *  si `load()` no se ha llamado todavía (no debería ocurrir: el botón solo existe en `status`
	 *  `'error'`, que solo se alcanza tras una `load()` previa). Alias de `reload()` (misma
	 *  máquina interna, ver más abajo): dos nombres para el mismo gesto, cada uno documentando su
	 *  disparador real (fallo de carga vs mutación propia). */
	retry(): void;
	/** Repite la ÚLTIMA carga (Fase 4e, tras un `port.delete` con éxito): MISMO mecanismo y
	 *  MISMO anti-carrera (L-P4.10) que `retry()` — de hecho, la misma función interna, ver
	 *  `repeatLastLoad` más abajo. Si la fila borrada era la última de la página, la recarga trae
	 *  `items: []` con `totalItems > 0` y el `$effect` de "página fuera de rango" que YA existe en
	 *  `+page.svelte` (L-P4.13) hace el retroceso: `reload()` no necesita saber nada de eso. No-op
	 *  si `load()` no se ha llamado todavía (mismo caso límite que `retry()`, en la práctica nunca
	 *  ocurre: no hay fila que borrar antes de la primera carga). */
	reload(): void;
}

/** Construye un `ListState` vacío (arranca en `'loading'`, sin ninguna carga emitida todavía). */
export function createListState(): ListState {
	let status = $state<ListLoadStatus>({ kind: 'loading' });
	const sequencer = new RequestSequencer();

	// Última llamada de `load()`, para que `retry()` pueda repetirla sin que el llamador tenga que
	// volver a pasar `ctx`/`type`/`viewState`. Imperativo a propósito (no `$state`): nadie lo lee
	// en un template, mismo criterio que `exitGuards` en `+layout.svelte`.
	let lastCall: { ctx: VegaAppContext; type: ResolvedContentType; viewState: ViewState } | null =
		null;

	async function load(
		ctx: VegaAppContext,
		type: ResolvedContentType,
		viewState: ViewState
	): Promise<void> {
		lastCall = { ctx, type, viewState };
		const seq = sequencer.next();
		status = { kind: 'loading' };
		try {
			const query = buildListQuery(type, viewState);
			const result = await ctx.port.list(type.name, query);
			if (!sequencer.isLatest(seq)) return; // respuesta obsoleta (anti-carrera): se descarta
			status = { kind: 'ready', page: result };
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			const vegaErr = normalizeListError(err);
			if (vegaErr.kind === 'auth-expired') {
				// §2.3: auth-expired SIEMPRE al overlay global (`ReloginModal` ya reacciona a
				// `onAuthChange('expired')` por su cuenta), NUNCA al estado local de la ruta. No se
				// toca `status`: el overlay tapa la ruta entera, así que da igual que el listado se
				// quede en 'loading' hasta que se reautentique (nadie lo ve mientras tanto).
				ctx.feedback.reportError(vegaErr);
				return;
			}
			status = { kind: 'error', error: vegaErr };
		}
	}

	/** Máquina interna compartida de `retry()`/`reload()` (ver JSDoc de la interfaz): repite
	 *  `lastCall` tal cual, reentrando por el mismo `load()` (mismo `RequestSequencer`, L-P4.10). */
	function repeatLastLoad(): void {
		if (!lastCall) return;
		void load(lastCall.ctx, lastCall.type, lastCall.viewState);
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
