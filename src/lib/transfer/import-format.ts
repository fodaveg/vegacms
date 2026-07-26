/**
 * Validación de un `.vega.json` recién leído del disco, ANTES de tocar nada (§4.1 del contrato de
 * `#lote-esquema`, ver la cabecera de `export-collection.ts` para el contrato completo, tarea
 * `045b5595`). Módulo puro: recibe `unknown` (el resultado de `JSON.parse` de un fichero que
 * cualquiera pudo editar a mano) y el `ContentModel` ya resuelto, nunca toca el puerto — la
 * comprobación de si un id EXISTE ya en destino es cosa de `import-collection.ts` (§4.2, exige
 * red), esto solo mira la FORMA del fichero contra el esquema vivo.
 *
 * **Todo-o-nada, a propósito**: a diferencia de la clasificación por registro de `import-preview.ts`
 * (CREA/PISA/BLOQUEADO, granular), un problema aquí (versión no reconocida, colección que no existe
 * en destino, campo que el esquema vivo ya no conoce) bloquea el import ENTERO — son problemas
 * DETERMINISTAS y detectables sin tocar red, así que no hay razón para escribir la mitad de un
 * fichero roto. Contraste con un `number` `required` que reciba un `0`: eso NO se detecta aquí (no
 * es una `unknown-field`, el campo existe y su nombre casa) y se deja para el informe de escritura
 * de `import-collection.ts` (§4.3, `allSettled`) — el error correcto ahí es "este registro falló",
 * no "todo el fichero es inválido".
 */

import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import { TRANSFER_FORMAT_VERSION, type TransferCollection } from './transfer-format';

export type ImportValidationError =
	/** El JSON no tiene ni la forma mínima de un `TransferDocument` (falta `collections`, no es un
	 *  objeto…). Nunca convive con otros errores: si la forma base falla, no hay nada más que mirar. */
	| { kind: 'malformed' }
	/** `vegaTransfer` ausente o de una versión que esta build no sabe leer (§2 del formato). */
	| { kind: 'unrecognized-version'; found: unknown }
	/** `collection.type` no resuelve a ningún `ResolvedContentType` visible del destino (nombre
	 *  distinto, colección borrada, o un tipo `hidden` — mismo criterio de visibilidad que las
	 *  rutas, `resolveVisibleContentType`). */
	| { kind: 'unknown-collection'; type: string }
	/** Una clave de `values` que el esquema VIVO de destino ya no declara como campo (se borró, o
	 *  nunca existió: fichero de otro proyecto, o editado a mano). Se reporta UNA vez por campo y
	 *  colección, no por cada registro que lo trae. */
	| { kind: 'unknown-field'; type: string; field: string };

/** Una colección del fichero ya emparejada con su `ResolvedContentType` de destino — lo que
 *  `import-collection.ts` necesita para seguir adelante sin repetir el `.find()`. */
export interface ResolvedImportCollection {
	collection: TransferCollection;
	contentType: ResolvedContentType;
}

export type ImportValidation =
	| { ok: true; collections: ResolvedImportCollection[] }
	| { ok: false; errors: ImportValidationError[] };

/** `true` si `value` es un objeto JSON plano (no `null`, no array) — la única forma de `unknown`
 *  que vale la pena seguir inspeccionando campo a campo. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `true` si `value` tiene la forma mínima de un `TransferRecord` (`id` string, `values` objeto) —
 *  no valida el CONTENIDO de `values` (eso es cosa de `checkFields` más abajo, campo a campo). */
function isRecordShaped(value: unknown): value is { id: string; values: Record<string, unknown> } {
	return isPlainObject(value) && typeof value.id === 'string' && isPlainObject(value.values);
}

/** `true` si `value` tiene la forma mínima de un `TransferCollection` (`type` string, `records`
 *  array de registros con forma válida). */
function isCollectionShaped(
	value: unknown
): value is { type: string; records: { id: string; values: Record<string, unknown> }[] } {
	return (
		isPlainObject(value) &&
		typeof value.type === 'string' &&
		Array.isArray(value.records) &&
		value.records.every(isRecordShaped)
	);
}

/**
 * Valida `input` (§4.1): forma base → versión → colecciones conocidas → campos conocidos, en ese
 * orden, y se DETIENE en el primer nivel que falla (no tiene sentido listar "campo desconocido" de
 * una colección que ni siquiera existe). `model.types` incluye tipos ocultos (`vega`/`vega_*`,
 * L7) — deliberadamente EXCLUIDOS aquí (`!hidden`), mismo criterio de visibilidad que
 * `resolveVisibleContentType`: si una colección nunca se ofrece por rutas, tampoco se ofrece como
 * destino de un import.
 */
export function validateTransferDocument(input: unknown, model: ContentModel): ImportValidation {
	if (!isPlainObject(input) || !Array.isArray(input.collections)) {
		return { ok: false, errors: [{ kind: 'malformed' }] };
	}
	if (input.vegaTransfer !== TRANSFER_FORMAT_VERSION) {
		return { ok: false, errors: [{ kind: 'unrecognized-version', found: input.vegaTransfer }] };
	}
	if (!input.collections.every(isCollectionShaped)) {
		return { ok: false, errors: [{ kind: 'malformed' }] };
	}

	const collections = input.collections as TransferCollection[];
	const errors: ImportValidationError[] = [];
	const resolved: ResolvedImportCollection[] = [];

	for (const collection of collections) {
		const contentType = model.types.find((t) => t.name === collection.type && !t.hidden) ?? null;
		if (!contentType) {
			errors.push({ kind: 'unknown-collection', type: collection.type });
			continue;
		}

		const knownFields = new Set(contentType.schema.fields.map((f) => f.name));
		const unknownFields = new Set<string>();
		for (const record of collection.records) {
			for (const key of Object.keys(record.values)) {
				if (!knownFields.has(key)) unknownFields.add(key);
			}
		}
		for (const field of unknownFields) {
			errors.push({ kind: 'unknown-field', type: collection.type, field });
		}

		resolved.push({ collection, contentType });
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, collections: resolved };
}
