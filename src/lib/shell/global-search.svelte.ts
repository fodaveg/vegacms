/**
 * Estado reactivo de la búsqueda global de la topbar (`#lote-shell`): envuelve N `port.list()` —
 * una por colección buscable (`globalSearchTypes`)— en runas de Svelte 5, con rebote (debounce),
 * anti-carrera y el mismo mapeo de error que el resto de cargas de la app.
 *
 * Mismo reparto que `list-state.svelte.ts`: aquí vive el CUÁNDO/CÓMO se consulta y el estado
 * resultante; el marcado y los eventos de teclado son de `GlobalSearch.svelte`; las decisiones
 * puras (qué colecciones, qué `Query`, cómo se titula un acierto) son de `global-search.ts`.
 *
 * Tres cosas que este módulo hace a propósito y conviene no "simplificar":
 *
 * 1. **Rebote + anti-carrera son cosas distintas y hacen falta las dos.** El rebote evita emitir
 *    una ráfaga de N peticiones por cada tecla; el `RequestSequencer` (L-P4.10) cubre lo que el
 *    rebote no puede: dos búsquedas que sí llegaron a emitirse pueden resolverse en cualquier
 *    orden (la autocancelación del SDK de PB está desactivada, §contrato P1), y sin el número de
 *    secuencia los resultados de "po" podrían pisar a los de "post".
 * 2. **Un fallo aislado NO tumba el panel.** Se emiten N peticiones en paralelo con
 *    `Promise.allSettled`: que una colección falle (reglas de PB que no dejan listarla, por
 *    ejemplo) no puede borrar los aciertos de las otras nueve. Solo si fallan TODAS el panel pasa
 *    a estado de error. `auth-expired` es la excepción de siempre (§2.3): va al overlay global de
 *    re-login, nunca a un mensajito dentro del panel.
 * 3. **El término que se pinta y el término que se busca son variables distintas.** `input` es lo
 *    que hay escrito AHORA (lo que ve el usuario mientras teclea) y `searchedTerm` el de los
 *    resultados que están en pantalla — sin separarlos, el "sin resultados para «X»" citaría un
 *    término distinto del que produjo esa respuesta.
 */

import type { VegaAppContext } from '$lib/app-context';
import type { VegaError } from '$lib/backend/errors';
import { normalizeListError, RequestSequencer } from '$lib/list/list-load';
import {
	buildGlobalSearchQuery,
	canSearchType,
	flattenHits,
	globalSearchTypes,
	isSearchableTerm,
	nextActiveIndex,
	normalizeSearchTerm,
	toGlobalSearchGroup,
	type GlobalSearchGroup,
	type GlobalSearchHit
} from './global-search';

/** Rebote por defecto: suficiente para que escribir una palabra entera no dispare una consulta
 *  por letra, y lo bastante corto para no percibirse como retardo. */
export const GLOBAL_SEARCH_DEBOUNCE_MS = 220;

/** Estado de la última búsqueda no descartada por anti-carrera. */
export type GlobalSearchStatus =
	/** Nada que buscar todavía (caja vacía o término por debajo del mínimo). */
	| { kind: 'idle' }
	| { kind: 'searching' }
	/** `failedCount` > 0 = búsqueda PARCIAL: alguna colección falló pero otras respondieron. El
	 *  panel lo dice en su pie ("no se pudo buscar en N colecciones") en vez de callárselo: un
	 *  "sin resultados" que en realidad significa "no pude mirar en todas partes" es justo la
	 *  clase de mentira que el buscador no debe contarle al editor. */
	| { kind: 'ready'; groups: GlobalSearchGroup[]; failedCount: number }
	| { kind: 'error'; error: VegaError };

export interface GlobalSearchState {
	/** Lo que hay escrito en la caja AHORA (incluye espacios y el término aún corto). */
	readonly input: string;
	/** El término normalizado de los resultados EN PANTALLA (''` si aún no se ha buscado nada). */
	readonly searchedTerm: string;
	readonly status: GlobalSearchStatus;
	/** Aciertos en orden de pintado (todos los grupos concatenados), para la navegación ↓/↑. */
	readonly hits: GlobalSearchHit[];
	/** Índice activo dentro de `hits`, o `-1` si ninguno. */
	readonly activeIndex: number;
	/** Escribir en la caja: guarda el texto y programa (o cancela) la búsqueda rebotada. */
	setInput(raw: string): void;
	/** ↓/↑: mueve el activo con vuelta circular. No-op si no hay aciertos. */
	moveActive(delta: number): void;
	/** Fija el activo (hover del ratón sobre un acierto). */
	setActive(index: number): void;
	/** El acierto activo, o `null` (nada activo, o índice fuera de rango). */
	activeHit(): GlobalSearchHit | null;
	/** Vacía caja, resultados y timer pendiente (Escape con la caja ya vacía, o tras navegar). */
	clear(): void;
	/** Cancela el rebote pendiente. La desmonta el componente en su `$effect` de limpieza: sin
	 *  esto, un timer disparado tras desmontar buscaría contra un contexto que ya no se pinta. */
	dispose(): void;
}

export function createGlobalSearchState(
	ctx: VegaAppContext,
	opts?: { debounceMs?: number }
): GlobalSearchState {
	const debounceMs = opts?.debounceMs ?? GLOBAL_SEARCH_DEBOUNCE_MS;
	const sequencer = new RequestSequencer();

	let input = $state('');
	let searchedTerm = $state('');
	let status = $state<GlobalSearchStatus>({ kind: 'idle' });
	let activeIndex = $state(-1);

	// Timer del rebote: imperativo a propósito (nadie lo lee en un template), mismo criterio que
	// `lastCall` en `list-state.svelte.ts`.
	let timer: ReturnType<typeof setTimeout> | null = null;

	const hits = $derived(status.kind === 'ready' ? flattenHits(status.groups) : []);

	function cancelPending(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	async function search(term: string): Promise<void> {
		const seq = sequencer.next();
		status = { kind: 'searching' };

		// Se resuelve la lista de colecciones AQUÍ (no en el módulo puro al teclear): el modelo puede
		// haber cambiado entre lo que se escribió y el momento de buscar (`reloadModel`).
		const types = globalSearchTypes(ctx.model).filter((type) => canSearchType(type, term));
		const untitled = ctx.t('list.untitled');

		const settled = await Promise.allSettled(
			types.map((type) => ctx.port.list(type.name, buildGlobalSearchQuery(type, term)))
		);
		if (!sequencer.isLatest(seq)) return; // respuesta obsoleta (anti-carrera): se descarta

		const groups: GlobalSearchGroup[] = [];
		let firstError: VegaError | null = null;
		let authExpiredReported = false;
		for (const [index, outcome] of settled.entries()) {
			if (outcome.status === 'fulfilled') {
				const group = toGlobalSearchGroup(types[index], outcome.value, ctx.locale, untitled);
				if (group.hits.length > 0) groups.push(group);
				continue;
			}
			const vegaErr = normalizeListError(outcome.reason);
			// §2.3: la sesión caducada SIEMPRE sale al overlay global, nunca al panel — y basta con
			// que la reporte UNA de las N peticiones (todas fallarían por lo mismo, y N toasts del
			// mismo error sería ruido).
			if (vegaErr.kind === 'auth-expired' && !authExpiredReported) {
				authExpiredReported = true;
				ctx.feedback.reportError(vegaErr);
			}
			if (firstError === null) firstError = vegaErr;
		}

		searchedTerm = term;
		activeIndex = -1;
		// Error SOLO si no sobrevivió NINGUNA respuesta: mientras haya una colección que respondiera,
		// el panel enseña lo que sí encontró (ver cabecera, punto 2). `types.length === 0` (proyecto
		// sin ninguna colección buscable) NO es un error: es un "sin resultados" honesto.
		const failedCount = settled.filter((outcome) => outcome.status === 'rejected').length;
		status =
			firstError !== null && failedCount === settled.length && types.length > 0
				? { kind: 'error', error: firstError }
				: { kind: 'ready', groups, failedCount };
	}

	function setInput(raw: string): void {
		input = raw;
		cancelPending();

		const term = normalizeSearchTerm(raw);
		if (!isSearchableTerm(term)) {
			// Volver por debajo del mínimo (o vaciar la caja) descarta los resultados anteriores: si
			// se quedaran pintados, el panel enseñaría aciertos de un término que ya no está escrito.
			// `sequencer.next()` invalida además cualquier `search()` YA EN VUELO (red lenta): sin
			// avanzar la generación, su respuesta tardía llegaría con `isLatest(seq) === true` y
			// repoblaría el panel con aciertos de un término que ya no está en la caja.
			sequencer.next();
			searchedTerm = '';
			activeIndex = -1;
			status = { kind: 'idle' };
			return;
		}
		if (term === searchedTerm && status.kind === 'ready') return; // ya pintado: ni timer ni red

		timer = setTimeout(() => {
			timer = null;
			void search(term);
		}, debounceMs);
	}

	return {
		get input() {
			return input;
		},
		get searchedTerm() {
			return searchedTerm;
		},
		get status() {
			return status;
		},
		get hits() {
			return hits;
		},
		get activeIndex() {
			return activeIndex;
		},
		setInput,
		moveActive(delta: number): void {
			activeIndex = nextActiveIndex(activeIndex, delta, hits.length);
		},
		setActive(index: number): void {
			activeIndex = index >= 0 && index < hits.length ? index : -1;
		},
		activeHit(): GlobalSearchHit | null {
			return activeIndex >= 0 && activeIndex < hits.length ? hits[activeIndex] : null;
		},
		clear(): void {
			cancelPending();
			sequencer.next(); // invalida también un `search()` YA EN VUELO — mismo motivo que en `setInput`
			input = '';
			searchedTerm = '';
			activeIndex = -1;
			status = { kind: 'idle' };
		},
		dispose: cancelPending
	};
}
