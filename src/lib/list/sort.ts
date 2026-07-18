/**
 * `cycleSort` (Fase 4d del contrato P4, D-P4.6): el ciclo de orden que dispara un click en una
 * cabecera ordenable de `RecordTable` — asc → desc → sin-orden → asc… Módulo puro (sin Svelte,
 * sin el puerto, sin `pocketbase`): la navegación real (reflejar el resultado en `?sort=&dir=`)
 * la hace `+page.svelte`, este helper solo decide el PRÓXIMO estado.
 */

import type { ViewState } from './query-state';

/**
 * Aplica un click sobre la cabecera de `field`, partiendo de `current` (§4d, D-P4.6(a) — solo
 * UNA columna ordenada a la vez):
 * - `current` es `null`, o es de un campo DISTINTO a `field`: arranca el ciclo en `asc`. Cambiar
 *   de columna NUNCA hereda la dirección de la anterior.
 * - Mismo campo, `dir: 'asc'`: pasa a `'desc'`.
 * - Mismo campo, `dir: 'desc'`: vuelve a `null` (sin orden explícito, cierra el ciclo).
 */
export function cycleSort(current: ViewState['sort'], field: string): ViewState['sort'] {
	if (current === null || current.field !== field) return { field, dir: 'asc' };
	if (current.dir === 'asc') return { field, dir: 'desc' };
	return null;
}
