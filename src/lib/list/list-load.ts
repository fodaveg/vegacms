/**
 * Helpers PUROS del estado de listado (Fase 4c del contrato P4). Extraídos de
 * `list-state.svelte.ts` para que la lógica delicada (anti-carrera, mapeo de error, fallback de
 * título) se pueda testear con vitest sin arrastrar runas de Svelte — ver la sección "Tests" de
 * la fase ("que la lógica delicada... sea verificable"). Módulo puro: sin Svelte, sin el puerto,
 * sin `pocketbase`.
 */

import { VegaError } from '$lib/backend/errors';
import type { CellDescriptor } from './cell';

/**
 * Guarda de anti-carrera (L-P4.10): cada `list()` en vuelo se identifica con un número de
 * secuencia monotónico creciente. Una respuesta que llega y NO es la de la última llamada emitida
 * (`isLatest` devuelve `false`) se descarta sin pisar el estado — imprescindible porque la
 * autocancelación del SDK de PB está desactivada (§ contrato P1) y paginar rápido deja varias
 * `list()` en vuelo a la vez; sin esto, una respuesta antigua que llega tarde podría pisar la
 * página que el usuario ya está viendo.
 */
export class RequestSequencer {
	#current = 0;

	/** Reserva y devuelve el número de la PRÓXIMA llamada; la convierte en "la última" emitida. */
	next(): number {
		this.#current += 1;
		return this.#current;
	}

	/** `true` ⟺ `seq` sigue siendo la última llamada emitida (ninguna más reciente la reemplazó). */
	isLatest(seq: number): boolean {
		return seq === this.#current;
	}
}

/**
 * Normaliza cualquier valor atrapado por un `catch` de `port.list()` a `VegaError` (mismo patrón
 * que `+layout.svelte`/`session.svelte.ts`): el puerto SIEMPRE rechaza con `VegaError` (P1 §5,
 * ley L2), pero un `catch` de TypeScript solo tipa `unknown` — esto cierra ese hueco sin repetir
 * el `instanceof` en cada llamador.
 */
export function normalizeListError(err: unknown): VegaError {
	return err instanceof VegaError
		? err
		: VegaError.backend('Error inesperado al cargar el listado', err);
}

/**
 * Texto de la celda-título de una fila (L-P4.15): si no hay columna título (`descriptor === null`,
 * `type.titleField === null`) o la celda queda vacía, devuelve `fallback` (el i18n "(sin título)"
 * de `list.untitled`) — NUNCA "—" (dejaría la fila sin ninguna pista de qué abre el enlace). El
 * campo-título siempre resuelve a un `ResolvedField` "representable" (`text`/`email`/`url`, P2
 * §4.4), así que `describeCell` solo puede producir `'text'` o `'empty'` para él; cualquier otra
 * variante se trata igual que `'empty'` por defensa en profundidad, sin asumir esa invariante
 * desde aquí.
 */
export function resolveTitleCellText(descriptor: CellDescriptor | null, fallback: string): string {
	if (descriptor === null || descriptor.kind === 'empty') return fallback;
	if (descriptor.kind === 'text' && descriptor.text !== '') return descriptor.text;
	return fallback;
}
