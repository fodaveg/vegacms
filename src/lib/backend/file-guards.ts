/**
 * Validación de entrada para campos `file` en escritura (§4.4/§9.9), compartida entre
 * adaptadores para que el rechazo de un `FileRef` ajeno sea IDÉNTICO en ambos: `required`,
 * `maxSelect`, y que cualquier `FileRef` referenciado ya pertenezca al registro. El resto del
 * modelo de escritura "estado final deseado" (subir/conservar/borrar) SÍ es específico de cada
 * adaptador (memory sube a su almacén en memoria; pocketbase arma el body multipart), así que
 * vive en el `files.ts` de cada adaptador, no aquí.
 */

import type { Field, FieldInputValue, FieldValue, FileRef } from './types';
import type { FieldError } from './errors';
import { LOCAL_REJECTION_CODES, PB_VALIDATION_CODES } from './errors';

export type FileField = Extract<Field, { type: 'file' }>;

/**
 * Valida (sin efectos secundarios) un valor de entrada para un campo `file`: `required`,
 * `maxSelect` y que cualquier `FileRef` referenciado pertenezca ya al registro (§4.4/§9.9).
 * `existing` es `undefined` en `create` (nada que conservar todavía: cualquier `FileRef` en la
 * entrada es, por definición, ajena).
 */
export function validateFileFieldInput(
	field: FileField,
	existing: FieldValue | undefined,
	input: FieldInputValue
): FieldError | null {
	const isEmpty = field.multiple
		? !Array.isArray(input) || input.length === 0
		: input === null || input === undefined;

	if (field.required && isEmpty) {
		return { code: PB_VALIDATION_CODES.required, message: 'Este campo es obligatorio' };
	}
	if (isEmpty) return null;

	if (field.multiple) {
		const items = input as (File | FileRef)[];
		if (field.maxSelect !== undefined && items.length > field.maxSelect) {
			return {
				code: PB_VALIDATION_CODES.tooManyValues,
				message: `Como mucho ${field.maxSelect} ficheros`
			};
		}
		const existingRefs = new Set(Array.isArray(existing) ? (existing as FileRef[]) : []);
		for (const item of items) {
			if (typeof item === 'string' && !existingRefs.has(item)) {
				return {
					code: LOCAL_REJECTION_CODES.foreignFileRef,
					message: `El fichero "${item}" no pertenece a este registro`
				};
			}
		}
		return null;
	}

	if (typeof input === 'string') {
		const currentRef = typeof existing === 'string' ? existing : null;
		if (input !== currentRef) {
			return {
				code: LOCAL_REJECTION_CODES.foreignFileRef,
				message: `El fichero "${input}" no pertenece a este registro`
			};
		}
	}
	return null;
}
