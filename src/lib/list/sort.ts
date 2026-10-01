/**
 * `cycleSort` (Fase 4d del contrato P4, D-P4.6): el ciclo de orden que dispara un click en una
 * cabecera ordenable de `RecordTable` — asc → desc → sin-orden → asc… Módulo puro (sin Svelte,
 * sin el puerto, sin `pocketbase`): la navegación real (reflejar el resultado en `?sort=&dir=`)
 * la hace `+page.svelte`, este helper solo decide el PRÓXIMO estado.
 *
 * **Con `defaultSort`** (capacidad opt-in del tipo, P2): `null` en la URL NO es "sin orden", es
 * "el orden por defecto". El ciclo de arriba hacía que algún click no cambiara nada visible
 * (con un default `desc` el tercer click volvía a `null` = el mismo `desc`; con un default `asc`
 * el primero escribía `asc` = lo que ya se veía). El ciclo con default se razona sobre el orden
 * EFECTIVO (`current ?? defaultSort`) y garantiza que CADA click cambie el orden visible:
 * - Columna distinta a la del orden efectivo: `asc` (igual que sin default).
 * - Misma columna, efectivo `asc`: `desc`.
 * - Misma columna, efectivo `desc`: si esa columna es la del `defaultSort`, no hay "sin orden"
 *   al que volver (sería el propio default, es decir, el mismo `desc`), así que alterna a `asc`;
 *   si no lo es, vuelve a `null` (= cae al default, que es OTRA columna: cambio visible).
 * - Un resultado idéntico al `defaultSort` se normaliza a `null` (la URL no lleva `?sort=` para
 *   lo que ya es el valor por defecto).
 * Así, en la columna del default el ciclo es un alterno de dos estados (asc ⇄ desc); en el resto
 * de columnas sigue siendo asc → desc → vuelta al default.
 *
 * Quien llama pasa `defaultSort` como tercer argumento (el `contentType.defaultSort` del tipo
 * visible). Omitirlo conserva el comportamiento histórico (sin default).
 */

import type { ViewState } from './query-state';

/**
 * Aplica un click sobre la cabecera de `field`, partiendo de `current` (§4d, D-P4.6(a) — solo
 * UNA columna ordenada a la vez):
 * - `current` es `null` (y no hay `defaultSort`), o el orden efectivo es de un campo DISTINTO a
 *   `field`: arranca el ciclo en `asc`. Cambiar de columna NUNCA hereda la dirección de la
 *   anterior.
 * - Mismo campo, `dir: 'asc'`: pasa a `'desc'`.
 * - Mismo campo, `dir: 'desc'`: vuelve a `null` (sin orden explícito, cierra el ciclo) — salvo en
 *   la columna del `defaultSort`, que alterna a `asc` (ver cabecera).
 */
export function cycleSort(
	current: ViewState['sort'],
	field: string,
	defaultSort: ViewState['sort'] = null
): ViewState['sort'] {
	const effective = current ?? defaultSort;
	let next: ViewState['sort'];
	if (effective === null || effective.field !== field) {
		next = { field, dir: 'asc' };
	} else if (effective.dir === 'asc') {
		next = { field, dir: 'desc' };
	} else {
		next = defaultSort !== null && defaultSort.field === field ? { field, dir: 'asc' } : null;
	}
	// Lo que ya es el orden por defecto no se escribe en la URL.
	if (next !== null && defaultSort !== null && next.field === defaultSort.field) {
		if (next.dir === defaultSort.dir) return null;
	}
	return next;
}
