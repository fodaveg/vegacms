/**
 * `computeReorder` (reorder manual por-colección, ver `orderField` en `$lib/model/types`): la
 * lógica PURA que traduce "el usuario movió la fila de `fromIndex` a `toIndex`" al mínimo
 * conjunto de `{id, value}` que hay que persistir en `orderField` vía `port.update`. Módulo PURO
 * (sin Svelte, sin el puerto, sin `pocketbase`): quien lo llama (`+page.svelte`) decide cómo y
 * cuándo escribir los valores devueltos.
 */

/** Un update pendiente de `orderField` para un registro: nuevo valor, listo para `port.update`. */
export interface ReorderUpdate {
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
