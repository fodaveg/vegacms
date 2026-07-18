/**
 * Dirty tracking del formulario de edición (Fase F5-a, L-P5.6/D-P5.4 del contrato P5).
 *
 * Compara el `baseline` inmutable de `form-model.ts` contra el estado editable actual que
 * mantiene el shell (`FormInputValues`). Un `File` pendiente (fichero recién seleccionado, aún
 * sin subir) SIEMPRE cuenta como sucio, sin excepción: no hay forma de comparar su contenido con
 * un `FileRef` del backend, y el contrato es explícito en que su sola presencia implica "hay algo
 * que enviar" (D-P5.4).
 */

import type { FieldInputValue, FieldValue } from '$lib/backend/types';
import type { FormValues } from './form-model';

/**
 * Valores editables del formulario: como `FormValues`, pero un campo `file` puede contener un
 * `File` recién seleccionado (subida pendiente) además de los `FieldValue`/`FileRef` normales —
 * exactamente el vocabulario de `FieldInputValue` del puerto. Es lo que el shell guarda en su
 * `$state` editable, inicializado como copia de `baseline` y mutado por los widgets.
 */
export type FormInputValues = Record<string, FieldInputValue>;

/** `true` si `value` es un `File` del navegador (subida pendiente), sin mirar el campo al que
 *  pertenece. `typeof File !== 'undefined'` lo hace seguro en un entorno sin `File` global
 *  (SSR/node de los tests: aquí nunca hay `File`, así que nunca es dirty por esta vía). */
function isFile(value: unknown): value is File {
	return typeof File !== 'undefined' && value instanceof File;
}

/**
 * `true` si `value` contiene AL MENOS un `File` pendiente: el valor mismo, o un elemento dentro
 * de un array (campos `file` múltiples que mezclan `FileRef` existentes con `File` nuevos). Un
 * campo en este estado es dirty SIEMPRE, sin mirar el `baseline` (D-P5.4).
 */
export function hasPendingFiles(value: FieldInputValue): boolean {
	if (isFile(value)) return true;
	if (Array.isArray(value)) return value.some(isFile);
	return false;
}

/** Deep-equal genérico, usado por `structuralEqual` para arrays/objetos anidados (valores `json`
 *  y arrays de `select`/`relation`/`file`). Un `File` nunca es igual a nada, ni siquiera a sí
 *  mismo por referencia (D-P5.4: red de seguridad para que uno colado no se declare "igual"). */
function deepEqual(a: unknown, b: unknown): boolean {
	if (isFile(a) || isFile(b)) return false;
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		// Comparación POSICIÓN A POSICIÓN: reordenar `['a','b']` → `['b','a']` cuenta como cambio,
		// el orden es dato para selects/relaciones múltiples que el usuario puede reordenar.
		return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		return (
			keysA.length === keysB.length && keysA.every((key) => key in b && deepEqual(a[key], b[key]))
		);
	}
	return false; // tipos distintos, o primitivos ya descartados por `a === b`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-equal estructural de dos `FieldValue` (D-P5.4): primitivos por `===`, arrays comparados
 * posición a posición (arrays de `select`/`relation`/`file` múltiples) y valores `json`
 * comparados por igualdad estructural profunda (no por referencia — dos objetos con las mismas
 * claves/valores son iguales aunque no sean el mismo objeto).
 */
export function structuralEqual(a: FieldValue, b: FieldValue): boolean {
	return deepEqual(a, b);
}

/** `true` si el campo cuyo baseline es `baselineValue` y valor actual `currentValue` cambió. */
function isFieldDirty(
	baselineValue: FieldValue,
	currentValue: FieldInputValue | undefined
): boolean {
	if (currentValue === undefined) return false; // no debería pasar (mismo cardinal que baseline)
	if (hasPendingFiles(currentValue)) return true;
	return !structuralEqual(baselineValue, currentValue as FieldValue);
}

/**
 * Nombres de campo cuyo valor actual difiere del `baseline` (D-P5.4). Itera sobre las claves de
 * `baseline` (autoridad: `form-model.ts` cubre TODOS los campos del tipo), no sobre `current` —
 * así un campo que el shell aún no tocara pero que faltara en `current` por error no se marca
 * sucio "de la nada" (L11: degradar sin crashear). Útil para el shell (indicadores "modificado"
 * por campo) y reusado por `to-record-input.ts` para no reimplementar el mismo criterio.
 */
export function dirtyFields(baseline: FormValues, current: FormInputValues): Set<string> {
	const dirty = new Set<string>();
	for (const name of Object.keys(baseline)) {
		if (isFieldDirty(baseline[name], current[name])) dirty.add(name);
	}
	return dirty;
}

/** `true` si CUALQUIER campo del formulario está sucio (D-P5.4): el shell lo usa para habilitar
 *  "Guardar" o avisar de cambios sin guardar al navegar fuera. */
export function isDirty(baseline: FormValues, current: FormInputValues): boolean {
	return dirtyFields(baseline, current).size > 0;
}
