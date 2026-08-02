/**
 * `insert-position.ts` (encargo "paleta de bloques arrastrable del editor visual"): traduce dónde
 * se soltó un arrastre sobre el lienzo —«encima del bloque `index`-ésimo, a esta coordenada Y, cuyo
 * rect es este»— a una POSICIÓN de inserción en el espacio N+1 que ya usa
 * `VisualOverlay.svelte#handleInsert` (`0` = antes del primero, `N` = al final, para N bloques).
 * Módulo PURO, mismo reparto que `type-menu.ts`/`$lib/list/reorder-dnd.ts` (ver sus cabeceras):
 * nada de DOM, nada de `$state`, una sola función que calcula — quien la llama
 * (`VisualOverlay.svelte`) le pasa el `rect` de VERDAD del elemento que recibió el `drop`
 * (`getBoundingClientRect()`, ya en coordenadas de PANTALLA, las mismas que trae `event.clientY`),
 * así que el resultado sale correcto pase lo que pase el zoom/escala del lienzo
 * (`VisualEditorScreen.svelte#zoomFactor`) sin que este módulo necesite saber nada de
 * `transform: scale()` ni del `rect` que reporta el puente (que vive en OTRO sistema de
 * coordenadas, el del `<iframe>` sin escalar — ver la cabecera de `VisualOverlay.svelte`).
 *
 * Regla, la que pide el encargo: la mitad SUPERIOR del bloque sobrevolado inserta ANTES de él
 * (`index`); la mitad INFERIOR, DESPUÉS (`index + 1`) — mismo criterio intuitivo que la guía
 * "antes/después" de `reorder-dnd.ts#dropIndicatorEdge`, aquí en función de la coordenada real de
 * la caída en vez de la dirección del arrastre (aquí no hay "origen" que comparar: el bloque
 * arrastrado viene de la paleta, no de la propia lista).
 */

/** El único dato de geometría que hace falta del bloque sobrevolado: su borde superior y su alto,
 *  en el MISMO sistema de coordenadas que `y` (ver cabecera). */
export interface InsertPositionRect {
	top: number;
	height: number;
}

/**
 * `index` = índice, en el espacio N (`0..N-1`), del bloque sobre el que se soltó. `y` = coordenada
 * Y de la caída. `rect` = geometría de ESE bloque. Devuelve `index` (mitad superior, "antes de él")
 * o `index + 1` (mitad inferior, "después de él").
 *
 * El punto medio exacto (`y === midpoint`) cae del lado de "después": no hay ninguna razón de
 * negocio para preferir un lado sobre otro justo ahí, así que se resuelve con una sola
 * comparación (`<`) en vez de un tercer caso.
 *
 * Rect de altura 0 (borde degenerado: un bloque sin alto real, o un `mock` de test) hace que el
 * punto medio coincida con `rect.top` — sin altura que repartir, no hay mitad superior que ganar,
 * así que cualquier `y >= rect.top` cae del lado de "después".
 */
export function resolveInsertPosition(index: number, y: number, rect: InsertPositionRect): number {
	const midpoint = rect.top + rect.height / 2;
	return y < midpoint ? index : index + 1;
}
