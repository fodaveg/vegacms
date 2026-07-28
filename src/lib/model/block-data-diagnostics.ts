/**
 * Diagnóstico por REGISTRO de las claves que existen dentro de un `data` concreto.
 *
 * No es un `ModelWarning`: el modelo puede ser perfectamente válido y aun así un bloque histórico
 * conservar bytes que el tipo actual ya no reclama. Tampoco valida, migra ni borra; clasifica cada
 * clave real para que una futura UI pueda distinguir lo normal de lo recuperable.
 */

import type { JsonValue } from '$lib/backend/types';
import type { ResolvedBlockField, ResolvedBlockType } from './types';

type DeclaredBlockDataKeyDiagnostic = {
	key: string;
	value: JsonValue;
	field: ResolvedBlockField;
};

export type BlockDataKeyDiagnostic =
	| (DeclaredBlockDataKeyDiagnostic & { status: 'claimed' })
	| (DeclaredBlockDataKeyDiagnostic & { status: 'shadowed' })
	| {
			status: 'orphaned';
			key: string;
			value: JsonValue;
	  };

function isDataObject(data: unknown): data is Record<string, JsonValue> {
	return typeof data === 'object' && data !== null && !Array.isArray(data);
}

/**
 * Clasifica, en el orden del JSON, cada clave propia y enumerable de `data`.
 *
 * - `claimed`: un campo `source: 'data'` actual la reclama.
 * - `shadowed`: un campo homónimo ahora vive en una columna `source: 'record'`.
 * - `orphaned`: el tipo actual no declara ningún campo con ese nombre.
 *
 * La presencia se decide por la CLAVE, nunca por el contenido: `null` y `''` siguen siendo bytes
 * históricos que una operación destructiva tendría que mostrar antes de limpiar.
 *
 * `claimed` mira SOLO `source`, sin preguntar a `blockDataFieldSchema` si ese campo es además
 * representable, y puede hacerlo porque `resolveBlockField` ya descarta ENTERO un campo
 * `source: 'data'` con un widget que no cabe en el JSON (`relation`/`file`): a este módulo no le
 * llega ninguno. Es un invariante prestado de `resolve.ts`, no una comprobación propia — si allí se
 * relaja, aquí aparece una cuarta clase («declarada pero impintable») y hay que decidirla, no
 * dejarla caer en `claimed`.
 */
export function diagnoseBlockDataKeys(
	blockType: ResolvedBlockType,
	data: unknown
): BlockDataKeyDiagnostic[] {
	if (!isDataObject(data)) return [];

	const fieldsByName = new Map(blockType.fields.map((field) => [field.name, field]));

	return Object.entries(data).map(([key, value]) => {
		const field = fieldsByName.get(key);
		if (!field) {
			return { status: 'orphaned', key, value: structuredClone(value) };
		}

		return {
			status: field.source === 'record' ? 'shadowed' : 'claimed',
			key,
			value: structuredClone(value),
			field
		};
	});
}
