/**
 * `computeReorder` (reorder manual por-colección, ver `orderField` en `$lib/model/types`): la
 * lógica PURA que traduce "el usuario movió la fila de `fromIndex` a `toIndex`" al mínimo
 * conjunto de `{id, value}` que hay que persistir en `orderField` vía `port.update`. Módulo PURO
 * (sin Svelte, sin el puerto, sin `pocketbase`): quien lo llama (`+page.svelte`) decide cómo y
 * cuándo escribir los valores devueltos. `computeReorder` renumera la lista entera (solo emite
 * lo que cambia); `computeSpanReorder` renumera solo el tramo movido cuando es seguro.
 */

/** Un update pendiente de `orderField` para un registro: nuevo valor, listo para `port.update`. */
interface ReorderUpdate {
	id: string;
	value: number;
}

/**
 * Calcula los updates de `orderField` tras mover el elemento de `fromIndex` a `toIndex` dentro de
 * `orderedIds` (mismo criterio que un drag-drop de lista: el elemento se saca de `fromIndex` y se
 * inserta en `toIndex` del array resultante).
 *
 * El nuevo orden se RENUMERA completo a su índice 0-based (0, 1, 2…), sin asumir que
 * `currentValues` era contiguo de entrada (robusto ante datos legacy, p.ej. un campo `sort` con
 * huecos o duplicados) — pero solo se devuelven los `{id, value}` cuyo valor CAMBIA respecto a
 * `currentValues[id]`: el mínimo conjunto de escrituras, no una renumeración completa a ciegas.
 *
 * Casos límite, ninguno lanza:
 * - `fromIndex === toIndex`: no-op, `[]`.
 * - `fromIndex`/`toIndex` fuera de `[0, orderedIds.length)`: `[]` (nada que mover con seguridad).
 */
export function computeReorder(
	orderedIds: string[],
	currentValues: Record<string, number>,
	fromIndex: number,
	toIndex: number
): ReorderUpdate[] {
	const length = orderedIds.length;
	if (fromIndex === toIndex) return [];
	if (fromIndex < 0 || fromIndex >= length || toIndex < 0 || toIndex >= length) return [];

	const next = [...orderedIds];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, moved);

	const updates: ReorderUpdate[] = [];
	next.forEach((id, index) => {
		if (currentValues[id] !== index) updates.push({ id, value: index });
	});
	return updates;
}

/**
 * Variante de `computeReorder` que renumera SOLO el tramo afectado (lote L7c; la usa
 * `/c/[type]` y, vía `planMergedReorder`, `/v/[view]`). `computeReorder` renumera a 0..n-1 y, en una colección sembrada con valores que
 * no coinciden con su posición (todos a 0, o 10, 20, 30…), reescribe casi todas las filas en el
 * primer arrastre.
 *
 * - Valores ESTRICTAMENTE crecientes en toda la lista (el caso normal tras la primera
 *   normalización): el orden relativo de lo que queda fuera del tramo es inequívoco, así que
 *   solo se redistribuyen entre `min(from,to)..max(from,to)` los valores que YA ocupaban esas
 *   posiciones, en el orden nuevo. Un arrastre de `k` posiciones escribe `k + 1` filas y nunca
 *   toca las demás; los valores fuera del tramo (incluso con huecos) se conservan.
 * - Valores repetidos, vacíos (que el llamador cuenta como 0) o desordenados: no hay forma de
 *   saber en qué orden estaban las filas empatadas fuera del tramo, así que hay que normalizar.
 *   Se hace UNA vez, delegando en `computeReorder` (renumera a 0..n-1 y solo emite lo que
 *   cambia); desde ahí la lista queda estrictamente creciente y los arrastres siguientes caen en
 *   el caso anterior.
 *
 * Mismos casos límite que `computeReorder`: no-op o índices fuera de rango → `[]`.
 */
export function computeSpanReorder(
	orderedIds: string[],
	currentValues: Record<string, number>,
	fromIndex: number,
	toIndex: number
): ReorderUpdate[] {
	const length = orderedIds.length;
	if (fromIndex === toIndex) return [];
	if (fromIndex < 0 || fromIndex >= length || toIndex < 0 || toIndex >= length) return [];

	const values = orderedIds.map((id) => currentValues[id]);
	const strictlyIncreasing = values.every(
		(value, index) => Number.isFinite(value) && (index === 0 || value > values[index - 1])
	);
	if (!strictlyIncreasing) return computeReorder(orderedIds, currentValues, fromIndex, toIndex);

	const lo = Math.min(fromIndex, toIndex);
	const hi = Math.max(fromIndex, toIndex);
	const next = [...orderedIds];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, moved);

	const updates: ReorderUpdate[] = [];
	for (let position = lo; position <= hi; position++) {
		const value = values[position];
		if (currentValues[next[position]] !== value) updates.push({ id: next[position], value });
	}
	return updates;
}
