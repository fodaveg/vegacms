/**
 * Guardarraíles de edición para el contenido JSON de un bloque.
 *
 * PocketBase solo ve una columna JSON y no puede validar los campos que el
 * manifiesto declara dentro de ella. Reimplementar aquí todas sus reglas daría
 * una falsa garantía de integridad; este módulo cubre únicamente `required` y
 * el conjunto cerrado de `options`, que son ayudas honestas de edición.
 *
 * La función es pura y tolerante con datos históricos: nunca lanza por un tipo
 * eliminado, un campo renombrado o un `data` que haya dejado de ser un objeto.
 * Devuelve la misma vista y los mismos códigos que el resto de formularios.
 *
 * El import de `$lib/backend/errors` es deliberado: comparte únicamente el
 * vocabulario estable de `PB_VALIDATION_CODES` para no crear dos lenguajes de
 * error en una misma pantalla. Ese es el límite de esta dependencia; la capa de
 * modelo nunca debe importar el puerto de backend ni ninguno de sus adaptadores.
 */

import { PB_VALIDATION_CODES } from '$lib/backend/errors';
import type { FieldErrorsView, TranslatedError } from '$lib/form/field-errors';
import type { ResolvedBlockField, ResolvedBlockType } from './types';

function translatedError(code: string, message: string): TranslatedError {
	return { code, message, known: true };
}

function invalidRecord(message: string): FieldErrorsView {
	return {
		byField: {},
		record: translatedError(PB_VALIDATION_CODES.selectInvalid, message)
	};
}

function emptyErrors(): FieldErrorsView {
	return { byField: {}, record: null };
}

function isDataObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		value === '' ||
		(Array.isArray(value) && value.length === 0)
	);
}

function optionsError(field: ResolvedBlockField, value: unknown): TranslatedError | null {
	if (field.options === null || isEmpty(value)) return null;

	const valid =
		field.widget === 'chips'
			? Array.isArray(value) &&
				value.every((item) => typeof item === 'string' && field.options!.includes(item))
			: typeof value === 'string' && field.options.includes(value);
	if (valid) return null;

	return translatedError(
		PB_VALIDATION_CODES.selectInvalid,
		`"${field.label}" contiene una opción no válida`
	);
}

/**
 * Valida la ayuda de edición declarada por un tipo de bloque.
 *
 * `null`/`undefined` representa un tipo que ya no existe en el modelo resuelto.
 * Las claves de `data` que el tipo no conoce se ignoran: conservarlas al guardar
 * corresponde al formulario tolerante que consumirá esta función.
 */
export function validateBlockData(
	blockType: ResolvedBlockType | null | undefined,
	data: unknown
): FieldErrorsView {
	if (!blockType) return invalidRecord('El tipo de bloque ya no existe en el manifiesto');
	if (!isDataObject(data)) return invalidRecord('Los datos del bloque deben ser un objeto JSON');

	const byField = new Map<string, TranslatedError>();
	for (const field of blockType.fields) {
		// Los campos de registro son columnas reales: PocketBase conserva la integridad y devuelve
		// sus errores. Validarlos aquí duplicaría esa autoridad dentro del JSON.
		if (field.source === 'record') continue;

		const value = Object.hasOwn(data, field.name) ? data[field.name] : undefined;
		if (field.required && isEmpty(value)) {
			byField.set(
				field.name,
				translatedError(PB_VALIDATION_CODES.required, 'Este campo es obligatorio')
			);
			continue;
		}

		const invalidOption = optionsError(field, value);
		if (invalidOption) byField.set(field.name, invalidOption);
	}

	return byField.size === 0
		? emptyErrors()
		: { byField: Object.fromEntries(byField), record: null };
}
