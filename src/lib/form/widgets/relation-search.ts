/**
 * `relation-search.ts` (F5-e, widget `relation`, contrato P5 L-P5.9/D-P5.9): coordinador PURO de
 * búsqueda del widget `relation` — todo lo que se puede razonar sin Svelte ni el puerto vive aquí,
 * con test Vitest; el `.svelte` es un shell fino que orquesta el debounce, llama a `ctx.port` y
 * pinta el resultado (ver cabecera de `Relation.svelte`).
 *
 * Cubre:
 * - **Anti-carrera (landmine)**: la autocancelación del SDK de PocketBase está desactivada (§
 *   contrato P1), así que dos `list()` en vuelo (el usuario teclea rápido) pueden resolver fuera
 *   de orden. `RelationSearchSequencer` es el MISMO patrón que `RequestSequencer` de
 *   `$lib/list/list-load.ts` (número de secuencia monotónico; solo la última llamada emitida es
 *   "vigente") — reimplementado aquí en vez de importado para no acoplar P5 a un módulo interno
 *   de P4 (misma forma, cero dependencia cruzada entre fases).
 * - **[Audit Finding 3] Degradación sin `titleField`**: `supportsTitleSearch` decide si el destino
 *   admite `contains` sobre su `titleField` (P2 §4.4 solo resuelve `titleField` a un campo
 *   `text`/`email`/`url`, familia que SIEMPRE admite `contains` — la comprobación vía
 *   `allowedFilterOps` es defensa en profundidad, no un caso que hoy se alcance con un
 *   `titleField` no nulo). `titleField === null` ⇒ el widget deshabilita la búsqueda y ofrece el
 *   listado paginado (`buildDegradedListQuery`), representando cada candidato por su id.
 * - **Caché de títulos de los YA seleccionados (D-P5.9 opción a, sin `expand`)**: `TitleCache` es
 *   un `Record<RecordId, TitleCacheEntry>` inmutable (`withCachedTitle` devuelve una copia, nunca
 *   muta — mismo criterio que `toggleValue`/`dirty.ts`); `idsNeedingTitles` decide qué ids todavía
 *   no están cacheados NI en vuelo (parámetro `pending`, fix de code-review de F5-e: sin excluir
 *   los que ya tienen un `ctx.port.get` en curso, cada resolución de un id disparaba el `$effect`
 *   del shell de nuevo y volvía a pedir TODOS los que aún no habían resuelto — cascada O(n²) para
 *   n ids seleccionados a la vez).
 * - **Toggle de selección múltiple respetando `maxSelect`**: `toggleRelationSelection` reusa
 *   `toggleValue` (mismo orden de selección que `chips`) pero es un no-op si añadir superaría el
 *   límite (afordancia UX; la validación dura la hace F5-c/backend, D-P5.9).
 */

import type { Field } from '$lib/backend/types';
import type { RecordId, VegaRecord, Page } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import { allowedFilterOps } from '$lib/backend/query';
import type { ResolvedContentType } from '$lib/model/types';
import { toggleValue } from './select-value';

// ————— Anti-carrera —————

/** Ver cabecera del módulo: mismo patrón que `RequestSequencer` (`$lib/list/list-load.ts`), sin
 *  importarlo (P5 no depende de un interno de P4). */
export class RelationSearchSequencer {
	#current = 0;

	/** Reserva y devuelve el número de la PRÓXIMA llamada; la convierte en "la última" emitida. */
	next(): number {
		this.#current += 1;
		return this.#current;
	}

	/** `true` ⟺ `seq` sigue siendo la última llamada emitida. */
	isLatest(seq: number): boolean {
		return seq === this.#current;
	}
}

// ————— Degradación (Audit Finding 3) —————

/** `true` si `target` admite búsqueda por título: tiene `titleField` Y ese campo admite el
 *  operador `contains` (§4.4 de P2 + `allowedFilterOps`, `$lib/backend/query`). `false` ⇒ el
 *  widget debe degradar a listado paginado por id (ver cabecera). */
export function supportsTitleSearch(target: ResolvedContentType): boolean {
	if (target.titleField === null) return false;
	const field: Field | undefined = target.schema.fields.find((f) => f.name === target.titleField);
	if (!field) return false;
	return allowedFilterOps(field).includes('contains');
}

// ————— Queries —————

/** Techo de candidatos por página, tanto para la búsqueda por título como para el listado
 *  degradado (§L-P5.9: "un `perPage` acotado, p.ej. 20"). */
export const RELATION_SEARCH_PER_PAGE = 20;

/**
 * `Query` de búsqueda por título (L-P5.9): `term` en blanco ⇒ sin filtro (primera página tal
 * cual, útil para ofrecer candidatos antes de que el usuario teclee nada tras limpiar el buscador);
 * cualquier otro texto ⇒ `contains` sobre `titleField`.
 */
export function buildTitleSearchQuery(titleField: string, term: string): Query {
	const trimmed = term.trim();
	if (trimmed === '') return { perPage: RELATION_SEARCH_PER_PAGE };
	return {
		filter: { kind: 'cond', field: titleField, op: 'contains', value: trimmed },
		perPage: RELATION_SEARCH_PER_PAGE
	};
}

/** `Query` del listado paginado del modo degradado (Audit Finding 3): sin filtro, solo paginación. */
export function buildDegradedListQuery(page: number): Query {
	return { page, perPage: RELATION_SEARCH_PER_PAGE };
}

// ————— Candidatos —————

export interface RelationCandidate {
	id: RecordId;
	/** Título legible (valor de `titleField`), o el propio id si no hay `titleField` (modo
	 *  degradado) o el valor está vacío. */
	title: string;
}

/** Título de `record` para `titleField` (`null` ⇒ modo degradado, representa por id; un valor
 *  vacío/no-string también cae al id — degrada sin dejar una fila en blanco, L11). */
export function titleOf(record: VegaRecord, titleField: string | null): string {
	if (titleField === null) return record.id;
	const raw = record.values[titleField];
	return typeof raw === 'string' && raw.trim() !== '' ? raw : record.id;
}

/** Mapea una `Page<VegaRecord>` (resultado de `ctx.port.list`) a los candidatos que pinta el
 *  widget, en el mismo orden. */
export function candidatesFromPage(
	page: Page<VegaRecord>,
	titleField: string | null
): RelationCandidate[] {
	return page.items.map((record) => ({ id: record.id, title: titleOf(record, titleField) }));
}

// ————— Caché de títulos de los seleccionados (D-P5.9, sin `expand`) —————

/** Resultado de resolver un id ya seleccionado vía `ctx.port.get`: `'not-found'` si el `get`
 *  rechazó con `VegaError 'not-found'` (registro borrado entre tanto) — el shell lo pinta con una
 *  marca de "no encontrado" en vez de reventar. */
export type TitleCacheEntry = { status: 'ok'; title: string } | { status: 'not-found' };

/** Caché por id, INMUTABLE (mismo criterio que `toggleValue`): nunca se muta, `withCachedTitle`
 *  siempre devuelve una copia. */
export type TitleCache = Record<RecordId, TitleCacheEntry>;

/** Copia de `cache` con `id` → `entry` añadido/reemplazado. Nunca muta `cache`. */
export function withCachedTitle(
	cache: TitleCache,
	id: RecordId,
	entry: TitleCacheEntry
): TitleCache {
	return { ...cache, [id]: entry };
}

/**
 * Ids de `ids` que todavía NO están en `cache` NI en `pending` — los que el shell debe resolver
 * con `ctx.port.get` justo ahora (evita re-pedir un id ya cacheado, D-P5.9, Y evita re-pedir uno
 * cuyo `get` ya está en vuelo, fix de code-review de F5-e: ver cabecera del módulo). `pending` es
 * responsabilidad del shell (un `Set<RecordId>` PLANO, no reactivo — este módulo no sabe de
 * promesas, solo filtra por el snapshot que le pasan).
 */
export function idsNeedingTitles(
	ids: RecordId[],
	cache: TitleCache,
	pending: ReadonlySet<RecordId> = new Set()
): RecordId[] {
	return ids.filter((id) => !(id in cache) && !pending.has(id));
}

// ————— Selección múltiple (`maxSelect`) —————

/**
 * Togglea `id` dentro de `current` (selección múltiple), reusando `toggleValue` (mismo orden de
 * selección que `chips`, `select-value.ts`). No-op si `id` NO estaba seleccionado y añadirlo
 * superaría `maxSelect` (afordancia UX; la validación dura la hace F5-c/backend, D-P5.9) — quitar
 * uno ya seleccionado SIEMPRE está permitido, sin importar el límite.
 */
export function toggleRelationSelection(
	current: RecordId[],
	id: RecordId,
	maxSelect: number | undefined
): RecordId[] {
	const alreadySelected = current.includes(id);
	if (!alreadySelected && maxSelect !== undefined && current.length >= maxSelect) return current;
	return toggleValue(current, id);
}
