/**
 * Fusión PURA de los resultados de una vista fusionada (Fase L7b, `mergedViews` en
 * `$lib/model/types`): dado un `ResolvedMergedView` ya resuelto por L7a y los `items` YA
 * cargados de cada `source` (en el MISMO orden que `view.sources`), produce la lista fusionada
 * final, deduplicada y ordenada — la pieza testeable de `merged-load.svelte.ts`, que solo
 * orquesta la carga en paralelo y delega aquí toda la lógica delicada. Módulo PURO: sin Svelte,
 * sin el puerto, sin `pocketbase`.
 */

import type { Page, VegaRecord } from '$lib/backend/types';
import type { ResolvedMergedSource, ResolvedMergedView } from '$lib/model/types';

/**
 * Una fila ya fusionada: el registro + la `source` que la aportó. `source` (con su `collection`/
 * `orderField`/`titleField`/`label`) es lo que L7c usará para pintar la insignia de tipo y el
 * título de la tarjeta, y lo que L7d necesita para mapear id→(colección, orderField) al
 * reordenar — se transporta entero en vez de solo `collection` para que ninguna de las dos fases
 * tenga que volver a buscarla en `view.sources`. `orderValue` va ya extraído (evita releer
 * `record.values[source.orderField]` en cada consumidor).
 */
export interface MergedRow {
	record: VegaRecord;
	source: ResolvedMergedSource;
	orderValue: number;
}

/** Valor de `orderField` para `record`, o `0` si está ausente, no es un número o no es finito
 *  (spec L7b). `Number.isFinite` (no `typeof raw === 'number'`) porque un `NaN`/`Infinity` colado
 *  como `orderValue` propagaría a `compareRows` (`a.orderValue - b.orderValue`), cuyo resultado
 *  también sería `NaN` — un orden NO ESPECIFICADO por ECMAScript que rompería el determinismo que
 *  este módulo promete. `Number.isFinite` los trata igual que "ausente": caen a 0. */
function extractOrderValue(record: VegaRecord, orderField: string): number {
	const raw = record.values[orderField];
	return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

/** Clave de dedupe: identidad real de un registro, independiente de por cuántas `sources` haya
 *  entrado (una misma colección puede aparecer en más de una, L7a lo permite a propósito). */
function recordKey(record: VegaRecord): string {
	return `${record.type}:${record.id}`;
}

/**
 * Fusiona `itemsBySource[i]` (los `items` de `port.list(view.sources[i].collection, …)`) en una
 * única lista ordenada (spec L7b):
 * 1. Aplana todas las sources, anexando a cada registro su `source` y su `orderValue`.
 * 2. Dedupe por `(record.type, record.id)`, FIRST-SOURCE-WINS: si la misma colección aparece en
 *    más de una `source` con solapamiento, gana la que declara antes `view.sources`.
 * 3. Ordena por `orderValue` ascendente, con desempate determinista `(collection, id)` —
 *    imprescindible mientras conviven valores por-tabla que pueden colisionar entre sí (dos
 *    colecciones que arrancan cada una en 0,1,2…); tras el primer reorder (L7d) los valores se
 *    renumeran global y las colisiones desaparecen.
 *
 * `itemsBySource` puede traer menos entradas que `view.sources` (una source ausente se trata
 * como `[]`, defensivo): en producción siempre coincide 1:1, `merged-load.svelte.ts` construye
 * ambos a partir del mismo `view.sources`.
 */
export function mergeViewResults(
	view: ResolvedMergedView,
	itemsBySource: VegaRecord[][]
): MergedRow[] {
	const seen = new Map<string, MergedRow>();

	view.sources.forEach((source, index) => {
		const items = itemsBySource[index] ?? [];
		for (const record of items) {
			const key = recordKey(record);
			if (seen.has(key)) continue; // first-source-wins: la primera source declarada manda
			seen.set(key, { record, source, orderValue: extractOrderValue(record, source.orderField) });
		}
	});

	return [...seen.values()].sort(compareRows);
}

/** Comparador de `mergeViewResults`: `orderValue` asc, desempate `(record.type, record.id)`. */
function compareRows(a: MergedRow, b: MergedRow): number {
	if (a.orderValue !== b.orderValue) return a.orderValue - b.orderValue;
	if (a.record.type !== b.record.type) return a.record.type < b.record.type ? -1 : 1;
	if (a.record.id === b.record.id) return 0;
	return a.record.id < b.record.id ? -1 : 1;
}

/**
 * Nombres de colección cuyo `Page` llegó "lleno" (`items.length === page.perPage` y quedan más
 * registros: `totalItems > items.length`): señal suave de que esa source tiene MÁS datos de los
 * que trajo la carga sin paginación de L7b (cap `perPage: 200` por source, ver
 * `merged-load.svelte.ts`) — no bloquea nada, solo informa. Sin consumidor de UI todavía (L7c).
 */
export function truncatedCollections(
	view: ResolvedMergedView,
	pages: Page<VegaRecord>[]
): string[] {
	const truncated: string[] = [];
	view.sources.forEach((source, index) => {
		const page = pages[index];
		if (page && page.totalItems > page.items.length) truncated.push(source.collection);
	});
	return truncated;
}
