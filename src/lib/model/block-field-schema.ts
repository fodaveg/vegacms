/**
 * Forma sintética y representabilidad de los campos declarados dentro de `blockTypes`.
 *
 * El import de `$lib/backend` es deliberado y está limitado al vocabulario puro `Field` y a
 * `normalizeFieldValue`, la tabla canónica de formas del dominio. Este módulo nunca debe importar
 * el puerto de operaciones ni un adaptador: su única responsabilidad es evitar que el modelo y el
 * formulario inventen dos vocabularios distintos para los mismos valores.
 */

import { normalizeFieldValue } from '$lib/backend/normalize';
import type { Field, JsonValue } from '$lib/backend/types';
import type { ResolvedBlockField } from './types';

type BlockFieldShape = Pick<
	ResolvedBlockField,
	'name' | 'widget' | 'source' | 'required' | 'options'
>;

const SYNTHETIC_FIELD_BASE = {
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;

/** Traduce un campo `source: 'data'` a la forma canónica que entiende `normalizeFieldValue`. */
export function blockDataFieldSchema(field: BlockFieldShape): Field | null {
	if (field.source === 'record') return null;

	const base = {
		...SYNTHETIC_FIELD_BASE,
		name: field.name,
		required: field.required
	};

	switch (field.widget) {
		case 'text':
		case 'textarea':
			return { ...base, type: 'text', subtype: 'plain' };
		case 'markdown':
			return { ...base, type: 'text', subtype: 'markdown' };
		case 'richtext':
			return { ...base, type: 'richtext', subtype: 'html' };
		case 'number':
			return { ...base, type: 'number', integer: false };
		case 'switch':
			return { ...base, type: 'bool' };
		case 'email':
			return { ...base, type: 'email' };
		case 'url':
			return { ...base, type: 'url' };
		case 'datetime':
			return { ...base, type: 'date' };
		case 'select':
			return {
				...base,
				type: 'select',
				options: field.options === null ? [] : [...field.options],
				multiple: false
			};
		case 'chips':
			return {
				...base,
				type: 'select',
				options: field.options === null ? [] : [...field.options],
				multiple: true
			};
		case 'json':
			return { ...base, type: 'json' };
		case 'relation':
		case 'file':
		case 'unsupported':
			return null;
	}
}

/**
 * Comprueba solo REPRESENTABILIDAD, no validez de contenido. Conserva el valor original si cabe:
 * `normalizeFieldValue` decide la forma, pero aquí no normalizamos el default del manifiesto.
 *
 * `null` es un default legítimo únicamente para `json`, donde es un valor JSON distinguible. En
 * los demás widgets no significa «sin default»: declarar la clave es una decisión explícita y una
 * forma incompatible debe avisarse. Los campos `source: 'record'` tampoco aceptan default aquí:
 * sin el `Field` real descubierto de la columna no se puede prometer su forma y, además, este
 * default solo alimenta el objeto JSON `data`.
 */
export function isRepresentableBlockFieldDefault(
	field: BlockFieldShape,
	value: JsonValue
): boolean {
	const schema = blockDataFieldSchema(field);
	if (schema === null) return false;

	if (value === null) return schema.type === 'json';

	let normalized: unknown;
	try {
		normalized = normalizeFieldValue(schema, value);
	} catch {
		return false;
	}

	switch (schema.type) {
		case 'text':
		case 'richtext':
		case 'email':
		case 'url':
			return typeof value === 'string' && normalized === value;
		case 'number':
			return typeof normalized === 'number';
		case 'bool':
			return typeof value === 'boolean' && normalized === value;
		case 'date':
			// Exigimos una cadena parseable por la tabla canónica, pero preservamos la forma exacta
			// declarada (incluida la variante de PocketBase con espacio en vez de `T`).
			return typeof value === 'string' && typeof normalized === 'string';
		case 'select': {
			const options = field.options;
			if (schema.multiple) {
				return (
					Array.isArray(value) &&
					value.every(
						(item) => typeof item === 'string' && (options === null || options.includes(item))
					)
				);
			}
			return (
				typeof normalized === 'string' &&
				typeof value === 'string' &&
				(options === null || options.includes(value))
			);
		}
		case 'json':
			try {
				return JSON.stringify(normalized) !== undefined;
			} catch {
				return false;
			}
		case 'relation':
		case 'file':
		case 'unsupported':
			return false;
	}
}
