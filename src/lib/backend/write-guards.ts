/**
 * Rechazos locales de escritura (§4.3 del contrato): comprobaciones "sin tocar red" que
 * DEBEN ser idénticas en ambos adaptadores. Viven aquí (compartidas) precisamente para
 * garantizar esa igualdad por construcción, en vez de confiar en que cada adaptador la
 * reimplemente igual.
 */

import type { ContentType, Field, RecordInput } from './types';
import type { FieldError } from './errors';
import { LOCAL_REJECTION_CODES, VegaError } from './errors';

/**
 * Comprueba, campo a campo de `data`, los tres rechazos locales de §4.3:
 * - escribir un campo `type: 'unsupported'` → "Campo no soportado por Vega";
 * - escribir un campo `readonly` → "Campo de solo lectura";
 * - escribir un campo que no existe en el esquema → "Campo desconocido".
 *
 * Devuelve el mapa de `FieldError` (vacío si no hay violaciones) para que el adaptador decida
 * cuándo lanzar (normalmente, junto con el resto de errores de validación del mismo write).
 */
export function checkUnwritableFields(
	fields: Field[],
	data: RecordInput
): Record<string, FieldError> {
	const byName = new Map(fields.map((f) => [f.name, f]));
	const fieldErrors: Record<string, FieldError> = {};

	for (const name of Object.keys(data)) {
		const field = byName.get(name);
		if (!field) {
			fieldErrors[name] = {
				code: LOCAL_REJECTION_CODES.unknownField,
				message: 'Campo desconocido'
			};
			continue;
		}
		if (field.type === 'unsupported') {
			fieldErrors[name] = {
				code: LOCAL_REJECTION_CODES.unsupportedField,
				message: 'Campo no soportado por Vega'
			};
			continue;
		}
		if (field.readonly) {
			fieldErrors[name] = {
				code: LOCAL_REJECTION_CODES.readonlyField,
				message: 'Campo de solo lectura'
			};
		}
	}

	return fieldErrors;
}

/**
 * Rechaza escrituras sobre un `ContentType.readonly` (vista de PB): create/update/delete
 * DEBEN fallar con `VegaError 'forbidden'` (§2.2, §4.3), nunca con `validation`.
 */
export function assertContentTypeWritable(contentType: ContentType): void {
	if (contentType.readonly) {
		throw VegaError.forbidden(`"${contentType.name}" es de solo lectura`);
	}
}
