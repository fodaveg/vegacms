/**
 * `select-value.ts` (F5-b, widget `chips`, `type:'select'` con `multiple:true`): toggle PURO de
 * una opción dentro del array de valores seleccionados.
 *
 * Decisión de orden: preserva el ORDEN DE SELECCIÓN, no el de `field.schema.options` — la opción
 * activada se añade al FINAL del array; al desactivarla se quita sin reordenar el resto. Elegido
 * porque el toggle no necesita conocer la lista completa de opciones para decidir el orden (el
 * widget ya la renderiza en el orden del schema; el ARRAY de valores es un detalle de estado, no
 * de presentación) y porque es la operación más simple y predecible de razonar ("lo último que
 * tocó el usuario va al final").
 */

/** Añade `option` a `current` si no estaba, o lo quita si ya estaba. Nunca muta `current`. */
export function toggleValue(current: string[], option: string): string[] {
	return current.includes(option)
		? current.filter((value) => value !== option)
		: [...current, option];
}
