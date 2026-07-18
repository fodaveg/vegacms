/**
 * Validación CLIENTE mínima, solo-UX (Fase F5-a, L-P5.12/D-P5.3 del contrato P5).
 *
 * El backend manda SIEMPRE: esto NO sustituye la validación de `port.create()`/`port.update()`,
 * solo evita un roundtrip evidente (campo vacío, demasiados elementos seleccionados). Fuera de
 * alcance a propósito (`pattern`, rangos de texto/número/fecha, `minSelect`…): esas reglas solo
 * se ven tras enviar, es aceptable por contrato (D-P5.3) — el backend las reporta y
 * `field-errors.ts` las traduce igual.
 *
 * NO duplica `adapters/memory/validate.ts` (eso acoplaría este módulo puro a un adaptador
 * concreto): reusa `isEmptyValue` (§2.1 del contrato de backend) para "required", la misma
 * noción de vacío que ya usa el puerto.
 *
 * Devuelve la MISMA forma que `field-errors.ts` (`FieldErrorsView`/`TranslatedError`, con los
 * mismos códigos de `PB_VALIDATION_CODES`) para que el shell funda cliente + backend con un solo
 * merge, sin dos vocabularios de error distintos.
 */

import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import type { FieldInputValue, FieldValue } from '$lib/backend/types';
import { isEmptyValue } from '$lib/backend/normalize';
import { PB_VALIDATION_CODES } from '$lib/backend/errors';
import type { FieldErrorsView, TranslatedError } from './field-errors';
import type { FormInputValues } from './dirty';

/**
 * Valida `current` contra `type`. Dos comprobaciones, en este orden por campo (D-P5.3):
 * 1. `required` (campos `schema.required` NO `readonly`, vía `isEmptyValue`).
 * 2. `maxSelect` (select/relation/file con `multiple: true` y `maxSelect` definido) — solo si el
 *    campo no era ya inválido por `required` (un array vacío nunca dispara "demasiados").
 *
 * Nunca produce error de registro (clave `''`): esta validación es siempre por-campo, así que
 * `record` es siempre `null`.
 */
export function validateForm(type: ResolvedContentType, current: FormInputValues): FieldErrorsView {
	const byField: Record<string, TranslatedError> = {};

	for (const field of type.fields) {
		if (field.schema.readonly) continue; // no editable: no hay nada del usuario que validar
		const value = current[field.name];

		const requiredError = checkRequired(field, value);
		if (requiredError) {
			byField[field.name] = requiredError;
			continue;
		}

		const maxSelectError = checkMaxSelect(field, value);
		if (maxSelectError) byField[field.name] = maxSelectError;
	}

	return { byField, record: null };
}

/**
 * `required`: usa `isEmptyValue(field.schema, …)`. El cast a `FieldValue` es deliberado — un
 * `File` pendiente (campo `file`) no es `null`, no es un array vacío y no matchea ninguno de los
 * tipos de texto que mira `isEmptyValue`, así que cae a su rama por defecto (`false`, "no
 * vacío"), el resultado correcto sin necesidad de un caso especial aquí.
 */
function checkRequired(
	field: ResolvedField,
	value: FieldInputValue | undefined
): TranslatedError | null {
	if (!field.schema.required) return null;
	if (!isEmptyValue(field.schema, (value ?? null) as FieldValue)) return null;
	return { code: PB_VALIDATION_CODES.required, message: 'Este campo es obligatorio', known: true };
}

/** `maxSelect`: solo aplica a select/relation/file `multiple` con tope declarado. */
function checkMaxSelect(
	field: ResolvedField,
	value: FieldInputValue | undefined
): TranslatedError | null {
	const schema = field.schema;
	const supportsMaxSelect =
		schema.type === 'select' || schema.type === 'relation' || schema.type === 'file';
	if (!supportsMaxSelect || !schema.multiple || schema.maxSelect === undefined) return null;
	if (!Array.isArray(value) || value.length <= schema.maxSelect) return null;
	return {
		code: PB_VALIDATION_CODES.tooManyValues,
		message: `Selecciona como máximo ${schema.maxSelect} elementos`,
		known: true
	};
}
