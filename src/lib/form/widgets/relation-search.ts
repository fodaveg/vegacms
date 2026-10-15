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
 * - **Listado paginado sin búsqueda**: `supportsTitleSearch` decide si un destino normal
 *   admite `contains` sobre su `titleField` (P2 §4.4 solo resuelve `titleField` a un campo
 *   `text`/`email`/`url`, familia que SIEMPRE admite `contains`; la comprobación vía
 *   `allowedFilterOps` es defensa en profundidad, no un caso que hoy se alcance con un
 *   `titleField` no nulo). `titleField === null` ⇒ el widget deshabilita la búsqueda y ofrece el
 *   listado paginado (`buildDegradedListQuery`), representando cada candidato por su id. El
 *   destino `vega_media` reutiliza esa misma query paginada aunque tenga `titleField`, porque su
 *   etiqueta visible puede ser el nombre del fichero y el backend solo buscaría por `title`.
 * - **Caché de títulos de los YA seleccionados (D-P5.9 opción a, sin `expand`)**: `TitleCache` es
 *   un `Record<RecordId, TitleCacheEntry>` inmutable (`withCachedTitle` devuelve una copia, nunca
 *   muta — mismo criterio que `toggleValue`/`dirty.ts`); `idsNeedingTitles` decide qué ids todavía
 *   no están cacheados NI en vuelo (parámetro `pending`, fix de code-review de F5-e: sin excluir
 *   los que ya tienen una petición en curso, cada resolución de un id disparaba el `$effect`
 *   del shell de nuevo y volvía a pedir TODOS los que aún no habían resuelto — cascada O(n²) para
 *   n ids seleccionados a la vez).
 * - **Toggle de selección múltiple respetando `maxSelect`**: `toggleRelationSelection` reusa
 *   `toggleValue` (mismo orden de selección que `chips`) pero es un no-op si añadir superaría el
 *   límite (afordancia UX; la validación dura la hace F5-c/backend, D-P5.9).
 */

import type { Field } from '$lib/backend/types';
import type { FileRef, RecordId, VegaRecord, Page } from '$lib/backend/types';
import type { BackendPort } from '$lib/backend/port';
import { VegaError } from '$lib/backend/errors';
import type { FilterNode, Query } from '$lib/backend/query';
import { allowedFilterOps } from '$lib/backend/query';
import type { BlockRelationFilter, ResolvedContentType } from '$lib/model/types';
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
 * Filtro del selector de una relación de bloque (`relation.filter` del manifiesto) como AST del
 * puerto: igualdades `eq` unidas con AND. `null` si no hay ninguna. Nunca cadenas crudas del backend.
 */
export function buildRelationFilter(filter: BlockRelationFilter | null): FilterNode | null {
	if (filter === null) return null;
	const nodes: FilterNode[] = Object.entries(filter).map(([field, value]) => ({
		kind: 'cond',
		field,
		op: 'eq',
		value
	}));
	if (nodes.length === 0) return null;
	return nodes.length === 1 ? nodes[0]! : { kind: 'group', combinator: 'and', nodes };
}

/** `a AND b`, aplanando ausencias: `null`/`undefined` no restringen. */
function andFilters(base: FilterNode | null | undefined, extra: FilterNode): FilterNode {
	return base ? { kind: 'group', combinator: 'and', nodes: [base, extra] } : extra;
}

/**
 * `Query` de búsqueda por título (L-P5.9): `term` en blanco ⇒ sin filtro propio (primera página tal
 * cual, útil para ofrecer candidatos antes de que el usuario teclee nada tras limpiar el buscador);
 * cualquier otro texto ⇒ `contains` sobre `titleField`. `baseFilter` (filtro del selector de una
 * relación de bloque) se une siempre con AND.
 */
export function buildTitleSearchQuery(
	titleField: string,
	term: string,
	baseFilter?: FilterNode | null
): Query {
	const trimmed = term.trim();
	if (trimmed === '') {
		return { ...(baseFilter ? { filter: baseFilter } : {}), perPage: RELATION_SEARCH_PER_PAGE };
	}
	return {
		filter: andFilters(baseFilter, {
			kind: 'cond',
			field: titleField,
			op: 'contains',
			value: trimmed
		}),
		perPage: RELATION_SEARCH_PER_PAGE
	};
}

/** `Query` del listado paginado sin búsqueda: solo paginación (más `baseFilter` si lo hay). */
export function buildDegradedListQuery(page: number, baseFilter?: FilterNode | null): Query {
	return {
		...(baseFilter ? { filter: baseFilter } : {}),
		page,
		perPage: RELATION_SEARCH_PER_PAGE
	};
}

/**
 * Mueve el elemento en `index` una posición (`-1` arriba, `1` abajo) dentro de `ids`. Copia nueva;
 * fuera de rango devuelve `ids` tal cual (los botones de los extremos están deshabilitados, esto es
 * defensa en profundidad).
 */
export function moveRelationItem(ids: RecordId[], index: number, delta: -1 | 1): RecordId[] {
	const to = index + delta;
	if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids;
	const next = [...ids];
	[next[index], next[to]] = [next[to]!, next[index]!];
	return next;
}

/** Ids por petición al resolver los títulos de los ya seleccionados: acota la longitud del
 *  filtro `in` (un OR de `eq` en la URL) y cabe en un `perPage` (máx. 200) sin paginar. */
export const RELATION_TITLE_BATCH_SIZE = 50;

/** Parte `ids` en lotes consecutivos de, como mucho, `size` ids (el orden se conserva). */
export function chunkIds(ids: RecordId[], size: number = RELATION_TITLE_BATCH_SIZE): RecordId[][] {
	const chunks: RecordId[][] = [];
	for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
	return chunks;
}

/**
 * `Query` que trae de una vez los registros de `ids` (un lote de `chunkIds`). `perPage` = nº de
 * ids, para que ningún lote vuelva recortado por el tamaño de página por defecto. `projection`
 * (p. ej. `[titleField]`) limita `values`; `undefined` = registro completo (destino `vega_media`,
 * que necesita `file`, `title` y `alt`).
 */
export function buildTitlesByIdsQuery(ids: RecordId[], projection?: string[]): Query {
	return {
		filter: { kind: 'cond', field: 'id', op: 'in', value: ids },
		perPage: Math.max(1, ids.length),
		...(projection ? { fields: projection } : {})
	};
}

/** `get` simultáneos como máximo al recuperar los ids que el `list` por lote no devolvió. */
const RELATION_GET_FALLBACK_CONCURRENCY = 5;

/** Resultado de `fetchRecordsByIds`: cada id cae en `records` o en `notFound`, o en ninguno si su
 *  `get` falló con algo que no es 404 (queda sin caché y el fallo va en `errors`). */
interface FetchedRecords {
	records: Map<RecordId, VegaRecord>;
	/** Ids cuyo `get` respondió 404: ya no existen (o no son visibles con la `ViewRule`). */
	notFound: Set<RecordId>;
	/** Fallos de `get` distintos de 404. */
	errors: unknown[];
}

/**
 * Trae los registros de `ids` (un lote de `chunkIds`) con UN `list` por ids y, para los que ese
 * `list` no devuelve, un `get` por id con concurrencia acotada. Hace falta porque `list` aplica la
 * `ListRule` de la colección destino y `get` su `ViewRule`, y PocketBase permite que difieran (p.
 * ej. `vega_media`: `list` solo para editores, `view` pública): un id ausente del `list` NO prueba
 * que no exista. Solo un 404 del `get` lo declara `notFound`. Si el propio `list` lanza, el error
 * se propaga (el llamador deja el lote sin caché).
 */
export async function fetchRecordsByIds(
	port: Pick<BackendPort, 'list' | 'get'>,
	collection: string,
	ids: RecordId[],
	projection?: string[],
	concurrency: number = RELATION_GET_FALLBACK_CONCURRENCY
): Promise<FetchedRecords> {
	const page = await port.list(collection, buildTitlesByIdsQuery(ids, projection));
	const records = new Map<RecordId, VegaRecord>(page.items.map((record) => [record.id, record]));
	const notFound = new Set<RecordId>();
	const errors: unknown[] = [];
	const missing = ids.filter((id) => !records.has(id));
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < missing.length) {
			const id = missing[cursor++]!;
			try {
				records.set(id, await port.get(collection, id));
			} catch (err) {
				if (err instanceof VegaError && err.kind === 'not-found') notFound.add(id);
				else errors.push(err);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
	return { records, notFound, errors };
}

// ————— Candidatos —————

export interface RelationCandidate {
	id: RecordId;
	/** Título legible (valor de `titleField`), o el propio id si no hay `titleField` (modo
	 *  degradado) o el valor está vacío. */
	title: string;
	/** Fichero del que sale la miniatura (`thumbField` de una relación de bloque); ausente/`null` si
	 *  no hay `thumbField` o el registro no tiene fichero. */
	thumbRef?: FileRef | null;
}

/** Título de `record` para `titleField` (`null` ⇒ modo degradado, representa por id; un valor
 *  vacío/no-string también cae al id — degrada sin dejar una fila en blanco, L11). */
export function titleOf(record: VegaRecord, titleField: string | null): string {
	if (titleField === null) return record.id;
	const raw = record.values[titleField];
	return typeof raw === 'string' && raw.trim() !== '' ? raw : record.id;
}

/** Primer fichero de `record[thumbField]` (campo `file` simple o múltiple), o `null`. */
export function thumbRefOf(record: VegaRecord, thumbField: string | null): FileRef | null {
	if (thumbField === null) return null;
	const raw = record.values[thumbField];
	if (typeof raw === 'string') return raw !== '' ? raw : null;
	if (Array.isArray(raw)) {
		for (const item of raw) {
			if (typeof item === 'string' && item !== '') return item;
		}
	}
	return null;
}

/** Mapea una `Page<VegaRecord>` (resultado de `ctx.port.list`) a los candidatos que pinta el
 *  widget, en el mismo orden. */
export function candidatesFromPage(
	page: Page<VegaRecord>,
	titleField: string | null,
	thumbField: string | null = null
): RelationCandidate[] {
	return page.items.map((record) => ({
		id: record.id,
		title: titleOf(record, titleField),
		...(thumbField !== null ? { thumbRef: thumbRefOf(record, thumbField) } : {})
	}));
}

// ————— Caché de títulos de los seleccionados (D-P5.9, sin `expand`) —————

/** Resultado de resolver un id ya seleccionado vía `ctx.port.list` por lotes: `'not-found'` si el
 *  id no vuelve en el listado (registro borrado entre tanto) — el shell lo pinta con una
 *  marca de "no encontrado" en vez de reventar. */
export type TitleCacheEntry =
	{ status: 'ok'; title: string; thumbRef?: FileRef | null } | { status: 'not-found' };

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
 * con `ctx.port.list` por lotes justo ahora (evita re-pedir un id ya cacheado, D-P5.9, Y evita re-pedir uno
 * cuyo lote ya está en vuelo, fix de code-review de F5-e: ver cabecera del módulo). `pending` es
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
