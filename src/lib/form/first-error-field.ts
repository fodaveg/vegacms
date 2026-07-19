/**
 * Resuelve qué campo enfocar tras un envío con errores (Fase F5-g, L-P5.2 del contrato P5, a11y
 * de cierre): el PRIMER campo con error en el ORDEN EFECTIVO de formulario (`type.fields`, §4.9
 * — el mismo orden que ya recorren las `sections` de `RecordForm.svelte`), no el orden en que el
 * cliente/backend reportó los errores (`Object.keys` de un objeto no garantiza ningún orden
 * significativo aquí).
 *
 * Puro: no toca el DOM. La resolución "nombre de campo → elemento a enfocar" (que SÍ necesita el
 * DOM, incluidos los widgets de tipo grupo cuyo control no es nativamente focusable) vive en
 * `RecordForm.svelte`, el único sitio de esta pieza con acceso al `document` real.
 */

import type { ResolvedField } from '$lib/model/types';
import type { FieldErrorsView } from './field-errors';

/**
 * Nombre del primer campo de `fields` (en su orden) que tiene un error en `errors.byField`, o
 * `null` si ninguno lo tiene — p.ej. cuando el único error es el de registro (`errors.record`,
 * clave `''` de `field-errors.ts`), que no tiene un campo al que asociar el foco.
 */
export function firstErrorFieldName(
	fields: ResolvedField[],
	errors: FieldErrorsView
): string | null {
	for (const field of fields) {
		if (field.name in errors.byField) return field.name;
	}
	return null;
}
