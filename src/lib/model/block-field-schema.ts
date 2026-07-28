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
			// El modelo resuelto excluye estas variantes de `source: 'data'` (`resolveBlockField`
			// descarta el campo ENTERO, no solo su widget); no inventamos una representación JSON
			// para un estado que un manifiesto válido no puede producir. Ese invariante vive en
			// `resolve.ts` y es del que se fía `block-data-diagnostics.ts` para contar como
			// `claimed` todo campo `source: 'data'` sin volver a preguntar aquí: si algún día se
			// relaja, los dos módulos hay que revisarlos juntos.
			return null;
	}
}

export type ResolvedBlockFieldDefault =
	{ status: 'value'; value: JsonValue } | { status: 'absent' } | { status: 'invalid' };

/**
 * Resuelve solo REPRESENTABILIDAD, no validez de contenido, y devuelve el valor en la forma
 * canónica de `normalizeFieldValue`. Vega MINTA defaults canónicos; la lectura de valores
 * históricos ya persistidos sigue siendo tolerante y pertenece a `readBlockData`.
 *
 * `null` significa «sin default» para todos los widgets salvo `json`, donde es un valor JSON
 * legítimo y distinguible. Los campos `source: 'record'` no aceptan ningún otro default aquí: sin
 * el `Field` real descubierto de la columna no se puede prometer su forma y, además, este default
 * solo alimenta el objeto JSON `data`.
 */
export function resolveBlockFieldDefault(
	field: BlockFieldShape,
	value: JsonValue
): ResolvedBlockFieldDefault {
	if (value === null && field.widget !== 'json') return { status: 'absent' };

	const schema = blockDataFieldSchema(field);
	if (schema === null) return { status: 'invalid' };

	let normalized: unknown;
	try {
		normalized = normalizeFieldValue(schema, value);
	} catch {
		return { status: 'invalid' };
	}

	switch (schema.type) {
		case 'text':
		case 'richtext':
		case 'email':
		case 'url':
			return typeof value === 'string' && normalized === value
				? { status: 'value', value: normalized }
				: { status: 'invalid' };
		case 'number':
			return typeof normalized === 'number'
				? { status: 'value', value: normalized }
				: { status: 'invalid' };
		case 'bool':
			return typeof value === 'boolean' && normalized === value
				? { status: 'value', value: normalized }
				: { status: 'invalid' };
		case 'date':
			// Una fecha sola se interpreta como UTC por especificación. Un datetime, en cambio,
			// necesita zona explícita: `Date.parse` aplicaría la TZ local y el mismo manifiesto
			// mintaría valores distintos en dos servidores.
			return typeof value === 'string' &&
				(/^\d{4}-\d{2}-\d{2}$/.test(value) || /(Z|[+-]\d{2}:?\d{2})$/i.test(value)) &&
				typeof normalized === 'string'
				? { status: 'value', value: normalized }
				: { status: 'invalid' };
		case 'select': {
			const options = schema.options;
			if (schema.multiple) {
				return Array.isArray(value) &&
					Array.isArray(normalized) &&
					value.every((item) => typeof item === 'string' && options.includes(item))
					? { status: 'value', value: normalized }
					: { status: 'invalid' };
			}
			return typeof normalized === 'string' && typeof value === 'string' && options.includes(value)
				? { status: 'value', value: normalized }
				: { status: 'invalid' };
		}
		case 'json':
			try {
				return JSON.stringify(normalized) !== undefined
					? { status: 'value', value: normalized as JsonValue }
					: { status: 'invalid' };
			} catch {
				return { status: 'invalid' };
			}
		case 'relation':
		case 'file':
		case 'unsupported':
			return { status: 'invalid' };
	}
}
