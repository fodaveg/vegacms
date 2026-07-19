/**
 * Estado reactivo de la carga del grid de `vega_media` (Fase P6·6b): mismo patrón que
 * `$lib/list/list-state.svelte.ts` (P4 §4c) pero simplificado — `vega_media` no tiene un
 * `ResolvedContentType` (no es un tipo de contenido del manifiesto, P2 §6: es la colección
 * reservada de medios) ni buscador/filtro/orden por cabecera (6b solo pagina), así que este
 * módulo llama a `ctx.port.list('vega_media', buildMediaListQuery(page))` directamente en vez de
 * `buildListQuery`/`ResolvedContentType`.
 *
 * Reutiliza `RequestSequencer`/`normalizeListError` de `$lib/list/list-load` (anti-carrera y
 * mapeo de error, L-P4.10): son utilidades genéricas de "cualquier listado paginado contra el
 * puerto", no acopladas al modelo de contenido de P4 — el mismo criterio que reutilizar
 * `Pagination.svelte` (contrato P6 §"grid de vega_media").
 */

import { VegaError } from '$lib/backend/errors';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { VegaAppContext } from '$lib/app-context';
import { normalizeListError, RequestSequencer } from '$lib/list/list-load';
import { buildMediaListQuery } from './media-query';

export type MediaListStatus =
	| { kind: 'loading' }
	| { kind: 'ready'; page: Page<VegaRecord> }
	| { kind: 'error'; error: VegaError };

export interface MediaListState {
	readonly status: MediaListStatus;
	/** Dispara una carga de `vega_media` para `page` (1-based). Anti-carrera: una respuesta que ya
	 *  no es la última emitida se descarta sin tocar `status`. `auth-expired` va SOLO al overlay
	 *  global (§2.3), nunca al estado local. */
	load(ctx: VegaAppContext, page: number): Promise<void>;
	/** Repite la ÚLTIMA carga (botón "Reintentar" del error). Alias de `reload()` (misma máquina
	 *  interna, ver `list-state.svelte.ts` §4c: dos nombres para el mismo gesto, cada uno
	 *  documentando su disparador real). */
	retry(): void;
	/** Repite la ÚLTIMA carga (tras guardar metadatos en `MediaDetail`, para refrescar la celda con
	 *  el registro real del backend en vez de fiarse de los drafts locales). Misma función que
	 *  `retry()`. */
	reload(): void;
}

/** Construye un `MediaListState` vacío (arranca en `'loading'`). */
export function createMediaListState(): MediaListState {
	let status = $state<MediaListStatus>({ kind: 'loading' });
	const sequencer = new RequestSequencer();
	let lastCall: { ctx: VegaAppContext; page: number } | null = null;

	async function load(ctx: VegaAppContext, page: number): Promise<void> {
		lastCall = { ctx, page };
		const seq = sequencer.next();
		status = { kind: 'loading' };
		try {
			const result = await ctx.port.list('vega_media', buildMediaListQuery(page));
			if (!sequencer.isLatest(seq)) return;
			status = { kind: 'ready', page: result };
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			const vegaErr = normalizeListError(err);
			if (vegaErr.kind === 'auth-expired') {
				ctx.feedback.reportError(vegaErr);
				return;
			}
			status = { kind: 'error', error: vegaErr };
		}
	}

	function repeatLastLoad(): void {
		if (!lastCall) return;
		void load(lastCall.ctx, lastCall.page);
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
