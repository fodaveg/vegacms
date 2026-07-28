/**
 * Adaptación pura entre los campos declarados dentro de `blockTypes` y el formulario que edita
 * la columna JSON `data`.
 *
 * La frontera es deliberada: solo entran campos `source: 'data'`. Los campos `source: 'record'`
 * son columnas reales del registro de bloque y pertenecen al formulario/escritura del backend,
 * nunca a este objeto JSON.
 *
 * Los `Field` construidos aquí son sintéticos: describen a los widgets cómo pintar una clave de
 * `data`, NO una columna descubierta en el backend. Pasarlos a `toRecordInput` haría que Vega
 * intentara escribir columnas inexistentes; el consumidor debe persistirlos exclusivamente con
 * `writeBlockData`.
 */

import { normalizeFieldValue } from '$lib/backend/normalize';
import type { Field, FieldSubtype, FieldValue, JsonValue } from '$lib/backend/types';
import type { ResolvedBlockField, ResolvedBlockType, ResolvedField } from './types';

export type BlockDataValues = Record<string, JsonValue>;

const SYNTHETIC_FIELD_BASE = {
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;

function syntheticSchema(field: ResolvedBlockField): Field | null {
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
			// El modelo resuelto excluye estas variantes de `source: 'data'`; no inventamos una
			// representación JSON para un estado que el manifiesto válido no puede producir.
			return null;
	}
}

function resolvedSubtype(schema: Field): FieldSubtype | null {
	return schema.type === 'text' || schema.type === 'richtext' ? schema.subtype : null;
}

function toResolvedDataField(field: ResolvedBlockField): ResolvedField | null {
	if (field.source === 'record') return null;
	const schema = syntheticSchema(field);
	if (schema === null) return null;

	return {
		schema,
		name: field.name,
		label: field.label,
		help: null,
		placeholder: null,
		hidden: false,
		group: null,
		widget: field.widget,
		subtype: resolvedSubtype(schema),
		listable: false
	};
}

/** Produce, en orden de manifiesto, los campos que viven dentro de `data`. */
export function resolveBlockDataFields(blockType: ResolvedBlockType): ResolvedField[] {
	return blockType.fields.flatMap((field) => {
		const resolved = toResolvedDataField(field);
		return resolved === null ? [] : [resolved];
	});
}

function isDataObject(data: unknown): data is Record<string, JsonValue> {
	return typeof data === 'object' && data !== null && !Array.isArray(data);
}

function cloneJson(value: unknown): JsonValue {
	return structuredClone(value) as JsonValue;
}

function emptyValue(field: ResolvedBlockField, schema: Field): JsonValue {
	if (field.default !== undefined) return cloneJson(field.default);
	return cloneJson(normalizeFieldValue(schema, undefined) as FieldValue);
}

/**
 * Lee el baseline completo del formulario sin normalizar valores históricos: si la forma guardada
 * ya no coincide con el widget actual, se conserva para que `validateBlockData` pueda reportarla y
 * una decisión humana la repare. Cada valor se clona en profundidad para que el estado editable de
 * Svelte no comparta referencias con `data` ni con los defaults del modelo resuelto.
 */
export function readBlockData(blockType: ResolvedBlockType, data: unknown): BlockDataValues {
	const source = isDataObject(data) ? data : null;
	const entries: Array<[string, JsonValue]> = [];

	for (const field of blockType.fields) {
		const resolved = toResolvedDataField(field);
		if (resolved === null) continue;

		const value =
			source !== null && Object.hasOwn(source, field.name)
				? source[field.name]
				: emptyValue(field, resolved.schema);
		entries.push([field.name, cloneJson(value)]);
	}

	return Object.fromEntries(entries);
}

function setOwnValue(target: Record<string, JsonValue>, name: string, value: JsonValue): void {
	Object.defineProperty(target, name, {
		value,
		enumerable: true,
		configurable: true,
		writable: true
	});
}

/**
 * Escribe únicamente las claves `source: 'data'` sobre una copia profunda del JSON anterior.
 *
 * Partir del objeto previo es el guardarraíl central: una clave de una versión antigua del tipo se
 * conserva aunque el formulario actual ya no la conozca.
 *
 * Un campo `source: 'record'` NO SE ESCRIBE aquí (su autoridad es la columna real del registro),
 * pero su clave homónima dentro de `data` TAMPOCO SE BORRA, y esa asimetría es deliberada. Un
 * campo puede haber nacido `source: 'data'` y pasar después a `'record'` — es justo la transición
 * que el proyecto está construyendo. En ese momento el valor histórico sigue SOLO dentro del JSON:
 * nadie lo copia a la columna nueva (`backend/block-schema.ts` reconcilia la FORMA del esquema,
 * nunca el contenido), y la columna puede ni existir todavía, porque en un proyecto vivo se crea
 * bajo demanda. Borrar esa clave al guardar cualquier otro campo del bloque destruiría la única
 * copia que queda, en silencio y sin vuelta atrás: exactamente el fallo que este módulo existe para
 * impedir. Una clave sobrante es inerte (ni el formulario ni el renderizador del sitio la miran) y
 * es recuperable; un `delete` no lo es.
 *
 * La VISIBILIDAD de esas claves ensombrecidas pertenece al diagnóstico POR REGISTRO de
 * `block-data-diagnostics.ts`, no al modelo global ni a esta función de escritura.
 */
export function writeBlockData(
	blockType: ResolvedBlockType,
	data: unknown,
	values: Readonly<BlockDataValues>
): BlockDataValues {
	const next: BlockDataValues = isDataObject(data) ? structuredClone(data) : {};

	for (const field of blockType.fields) {
		// Ni se escribe ni se borra: ver la cabecera. Su clave, si existe, es un valor histórico.
		if (field.source === 'record') continue;

		const resolved = toResolvedDataField(field);
		if (resolved === null) continue;
		if (Object.hasOwn(values, field.name)) {
			setOwnValue(next, field.name, cloneJson(values[field.name]));
		} else if (!Object.hasOwn(next, field.name)) {
			setOwnValue(next, field.name, emptyValue(field, resolved.schema));
		}
	}

	return next;
}
