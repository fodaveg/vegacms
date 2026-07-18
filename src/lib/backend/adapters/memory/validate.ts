/**
 * Validación "de backend" del adaptador `memory` (§7): lo que en PocketBase haría el
 * servidor al recibir el create/update real. El puerto (§4.3) deja `required`, min/max,
 * `pattern`, opciones de `select`, `maxSelect` y existencia de `relation` como responsabilidad
 * del backend — aquí es donde `memory` la emula, con `FieldError.code` compatible con PB
 * (`PB_VALIDATION_CODES`) para que P5 traduzca una única tabla.
 *
 * Los rechazos "sin tocar red" (campo unsupported/readonly/desconocido) NO están aquí: esos
 * viven en `write-guards.ts`, compartidos con el futuro adaptador `pocketbase`.
 */

import type { Field, FieldValue, RecordId } from '../../types';
import type { FieldError } from '../../errors';
import { PB_VALIDATION_CODES } from '../../errors';
import { isEmptyValue } from '../../normalize';

/** Contexto que necesita la validación para comprobar `relation` (existencia del id destino). */
export interface ValidationContext {
	recordExists(targetType: string, id: RecordId): boolean;
}

/**
 * `new RegExp(field.pattern)` con un patrón de esquema inválido lanza un `SyntaxError` nativo,
 * que NO es `VegaError` (violaría L2 si escapase de aquí). Un patrón roto es un problema del
 * esquema, no del dato que se escribe: se degrada ignorándolo (nunca bloquea la escritura),
 * en línea con la ley L11 ("evolución degradante… nunca crash").
 */
function testPattern(pattern: string, value: string): boolean {
	try {
		return new RegExp(pattern).test(value);
	} catch {
		return true;
	}
}

/**
 * Valida un único valor de campo (ya en forma de dominio, no ficheros: esos se validan aparte
 * en `files.ts`). Devuelve el primer `FieldError` encontrado, o `null` si el valor es válido.
 * Un solo error por campo (coincide con la forma `fieldErrors: Record<string, FieldError>`).
 */
export function validateFieldValue(
	field: Field,
	value: FieldValue,
	ctx: ValidationContext
): FieldError | null {
	if (field.required && isEmptyValue(field, value)) {
		return { code: PB_VALIDATION_CODES.required, message: 'Este campo es obligatorio' };
	}

	// Vacío y no requerido: nada más que comprobar.
	if (isEmptyValue(field, value)) return null;

	switch (field.type) {
		case 'text': {
			const str = value as string;
			if (field.minLength !== undefined && str.length < field.minLength) {
				return {
					code: PB_VALIDATION_CODES.minLength,
					message: `Debe tener al menos ${field.minLength} caracteres`
				};
			}
			if (field.maxLength !== undefined && str.length > field.maxLength) {
				return {
					code: PB_VALIDATION_CODES.maxLength,
					message: `No puede superar ${field.maxLength} caracteres`
				};
			}
			if (field.pattern !== undefined && !testPattern(field.pattern, str)) {
				return { code: PB_VALIDATION_CODES.pattern, message: 'Formato no válido' };
			}
			return null;
		}

		case 'number': {
			const num = value as number;
			if (field.min !== undefined && num < field.min) {
				return { code: PB_VALIDATION_CODES.minValue, message: `Debe ser >= ${field.min}` };
			}
			if (field.max !== undefined && num > field.max) {
				return { code: PB_VALIDATION_CODES.maxValue, message: `Debe ser <= ${field.max}` };
			}
			return null;
		}

		case 'date': {
			const date = value as string;
			if (field.min !== undefined && date < field.min) {
				return { code: PB_VALIDATION_CODES.minValue, message: `Debe ser posterior a ${field.min}` };
			}
			if (field.max !== undefined && date > field.max) {
				return { code: PB_VALIDATION_CODES.maxValue, message: `Debe ser anterior a ${field.max}` };
			}
			return null;
		}

		case 'select': {
			const values = field.multiple ? (value as string[]) : [value as string];
			for (const v of values) {
				if (!field.options.includes(v)) {
					return {
						code: PB_VALIDATION_CODES.selectInvalid,
						message: `"${v}" no es una opción válida`
					};
				}
			}
			if (field.multiple && field.maxSelect !== undefined && values.length > field.maxSelect) {
				return {
					code: PB_VALIDATION_CODES.tooManyValues,
					message: `Como mucho ${field.maxSelect} opciones`
				};
			}
			return null;
		}

		case 'relation': {
			const ids = field.multiple ? (value as RecordId[]) : [value as RecordId];
			for (const id of ids) {
				if (!ctx.recordExists(field.target, id)) {
					return {
						code: PB_VALIDATION_CODES.relationInvalid,
						message: `El registro "${id}" no existe en "${field.target}"`
					};
				}
			}
			if (field.multiple && field.maxSelect !== undefined && ids.length > field.maxSelect) {
				return {
					code: PB_VALIDATION_CODES.tooManyValues,
					message: `Como mucho ${field.maxSelect} relaciones`
				};
			}
			return null;
		}

		case 'file':
			// Los campos `file` no pasan por aquí: `required`/`maxSelect`/refs ajenas se
			// validan en `files.ts`, que trabaja sobre la entrada cruda (`File | FileRef`),
			// no sobre el `FieldValue` ya normalizado que recibe esta función. Se deja el
			// caso solo por exhaustividad del switch sobre `Field['type']`.
			return null;

		case 'bool':
		case 'richtext':
		case 'email':
		case 'url':
		case 'json':
			return null;

		case 'unsupported':
			// Nunca debería llegar aquí: se rechaza antes en write-guards.ts.
			return null;
	}
}
