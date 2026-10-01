/**
 * Plan de escrituras de un reordenado en una vista fusionada (`/v/[view]`, lote L7d): módulo PURO
 * (sin Svelte ni puerto) que traduce «la fila `fromIndex` pasó a `toIndex` del conjunto MEZCLADO»
 * a la lista mínima de `{collection, id, field, value}` que hay que persistir. Delega en
 * `computeSpanReorder` (el mismo cálculo que `/c/[type]`), así que un arrastre de `k` posiciones
 * escribe `k + 1` filas cuando los valores ya son estrictamente crecientes en todo el conjunto, y
 * normaliza una sola vez (renumerando a 0..n-1 lo que cambie) cuando hay empates, que es el caso
 * de partida de una vista con varias fuentes (cada una arranca en 0, 1, 2…).
 *
 * Es seguro mezclar colecciones: `computeSpanReorder` solo ve claves y números del orden global,
 * y cada escritura va al `orderField` de LA colección de su fila (`row.source`). Redistribuir en el
 * tramo valores que ocupaban otras filas, aunque sean de otra colección, no choca con nada porque
 * los campos de tablas distintas son independientes y el orden se compara solo por valor.
 */

import { computeSpanReorder } from './reorder';
import type { MergedRow } from './merged-merge';
import type { BackendPort } from '$lib/backend/port';

/** Una escritura pendiente de orden: en qué colección, qué registro, qué campo y qué valor. */
export interface MergedReorderWrite {
	collection: string;
	id: string;
	field: string;
	value: number;
}

/** Clave de fila: misma identidad `"{type}:{id}"` que usa `mergeViewResults` para deduplicar. */
function rowKey(row: MergedRow): string {
	return `${row.record.type}:${row.record.id}`;
}

/**
 * Escrituras mínimas para mover la fila `fromIndex` a `toIndex` dentro de `rows` (conjunto mezclado
 * completo, ya ordenado). No-op o índices fuera de rango → `[]`.
 */
export function planMergedReorder(
	rows: readonly MergedRow[],
	fromIndex: number,
	toIndex: number
): MergedReorderWrite[] {
	const orderedKeys = rows.map(rowKey);
	const currentValues: Record<string, number> = {};
	const rowByKey: Record<string, MergedRow> = {};
	for (const row of rows) {
		const key = rowKey(row);
		currentValues[key] = row.orderValue;
		rowByKey[key] = row;
	}
	const writes: MergedReorderWrite[] = [];
	for (const update of computeSpanReorder(orderedKeys, currentValues, fromIndex, toIndex)) {
		const row = rowByKey[update.id];
		if (!row) continue; // defensivo: la clave sale del mismo `rows`
		writes.push({
			collection: row.source.collection,
			id: row.record.id,
			field: row.source.orderField,
			value: update.value
		});
	}
	return writes;
}

/**
 * Persiste las escrituras de `planMergedReorder`, una a una y EN ORDEN, cada una en la colección y
 * el campo de su fila. Cada `update` declara `orderOnlyField: field`: sin eso `withRevisions` crea
 * una revisión de historial por fila escrita (y una tanda de `k + 1` escrituras llenaría el
 * historial de versiones idénticas salvo el número de orden). Es la pieza que `/v/[view]` llama,
 * separada de la ruta para que ese contrato se pueda probar sin navegador. Si una escritura
 * rechaza, la excepción sube tal cual y las siguientes no se intentan (las anteriores ya están
 * persistidas: el llamador recarga para mostrar el estado real).
 */
export async function persistMergedReorder(
	port: Pick<BackendPort, 'update'>,
	writes: readonly MergedReorderWrite[]
): Promise<void> {
	for (const write of writes) {
		await port.update(
			write.collection,
			write.id,
			{ [write.field]: write.value },
			{ orderOnlyField: write.field }
		);
	}
}
