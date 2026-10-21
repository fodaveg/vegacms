/**
 * Validez NATIVA de los controles de un formulario, leída como errores de campo (QA de fodaveg,
 * 21 oct 2026).
 *
 * El `<form>` de `RecordForm` se envía con `novalidate`: el navegador ya no decide por su cuenta.
 * Antes lo hacía, y con un control inválido que no podía enfocar (un bloque plegado, otra pestaña
 * de idioma) cancelaba el envío sin enseñar nada — solo `An invalid form control … is not
 * focusable` en la consola — y la página se quedaba en «Cambios sin guardar». Las restricciones
 * nativas que sí valen (un `type="email"`, `min`/`max`, el JSON a medio escribir de `Json.svelte`,
 * que no llega al valor y solo existe como `setCustomValidity`) se leen aquí y se convierten en
 * errores de campo normales: se pintan junto al campo, se resumen y el foco va al primero, que
 * es lo que el formulario ya hacía con sus propios errores.
 *
 * `owns` decide qué controles son de quien guarda: los de un bloque embebido NO son del registro
 * padre (cada bloque se guarda con su propio botón, `RecordBlocks.svelte`), así que un campo
 * inválido de un bloque nunca impide guardar la página, y al revés.
 */

import type { TranslatedError } from './field-errors';

/** Código LOCAL (no de PocketBase): el mensaje es el `validationMessage` del navegador. */
export const NATIVE_INVALID_CODE = 'vega_native_invalid';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Errores por nombre de campo (`data-field` de su `FieldRow`) de los controles inválidos de
 *  `root` que `owns` reconoce como propios; el primero de cada campo gana. */
export function nativeFieldErrors(
	root: ParentNode,
	owns: (control: Element) => boolean = () => true
): Record<string, TranslatedError> {
	const errors: Record<string, TranslatedError> = {};
	for (const control of root.querySelectorAll<Control>('input, select, textarea')) {
		if (!control.willValidate || control.validity.valid || !owns(control)) continue;
		const name = control.closest('[data-field]')?.getAttribute('data-field');
		if (!name || name in errors) continue;
		errors[name] = { code: NATIVE_INVALID_CODE, message: control.validationMessage, known: false };
	}
	return errors;
}
