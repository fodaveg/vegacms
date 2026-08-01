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
import { isValidPagePath, PAGE_PATH_INVALID_CODE } from '$lib/model/page-path';
import type { FieldErrorsView, TranslatedError } from './field-errors';
import type { FormInputValues } from './dirty';

/**
 * Valida `current` contra `type`. Comprobaciones, en este orden por campo (D-P5.3):
 * 1. `required` (campos `schema.required` NO `readonly`, vía `isEmptyValue`).
 * 2. Formato de la RUTA pública (`type.page.pathField`, modelo de páginas, §2 del encargo "crear
 *    y editar páginas") — capacidad OPT-IN, solo aplica si `type` declara `page` y el campo es
 *    ESE. A diferencia de `pattern`/rangos (fuera de alcance a propósito, ver cabecera del
 *    módulo), esto NO es la regla genérica de un `Field.pattern` de PocketBase: es una convención
 *    PROPIA de Vega sobre un concepto que Vega mismo introduce (la ruta pública), así que sí
 *    tiene sentido evitar aquí un roundtrip evidente.
 * 3. `maxSelect` (select/relation/file con `multiple: true` y `maxSelect` definido) — solo si el
 *    campo no era ya inválido por las dos anteriores (un array vacío nunca dispara "demasiados").
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

		const pagePathError = checkPagePath(type, field, value);
		if (pagePathError) {
			byField[field.name] = pagePathError;
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

/**
 * Formato de la ruta pública (`type.page.pathField`, ver cabecera): no-op para cualquier otro
 * campo o tipo sin `page`. `code: PAGE_PATH_INVALID_CODE` es LOCAL (no de PB) y `known: true` —
 * el mensaje final lo decide la clave `form.errorCode.vega_page_path_invalid` de `$lib/i18n`
 * (mismo patrón que `checkRequired`); `message` aquí es solo el fallback si esa clave faltara.
 */
function checkPagePath(
	type: ResolvedContentType,
	field: ResolvedField,
	value: FieldInputValue | undefined
): TranslatedError | null {
	if (type.page?.pathField !== field.name) return null;
	if (typeof value !== 'string' || isValidPagePath(value)) return null;
	return {
		code: PAGE_PATH_INVALID_CODE,
		message: 'La ruta debe empezar por "/", sin espacios, y sin barra final salvo la raíz "/".',
		known: true
	};
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
