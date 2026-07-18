/**
 * Aplicación de `Query` sobre un array de `VegaRecord` en memoria (§4.6). La validación
 * (op/tipo, campo existente, sort escalar, paginación) se delega en `validateQuery` del
 * puerto — aquí solo vive la semántica de evaluación, que debe producir los mismos resultados
 * observables que el adaptador `pocketbase` sobre el mismo dataset (ley L3, paridad).
 */

import type { Field, FieldValue, Page, VegaRecord } from '../../types';
import type { FilterNode, Query } from '../../query';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE, validateQuery } from '../../query';
import { isEmptyValue } from '../../normalize';

/**
 * Ejecuta `query` sobre `records` (los registros ya normalizados de un tipo). Lanza
 * `VegaError 'validation'` (vía `validateQuery`) si la query es inválida para `fields`.
 */
export function applyQuery(
	records: VegaRecord[],
	fields: Field[],
	query: Query | undefined
): Page<VegaRecord> {
	validateQuery(fields, query);

	const byName = new Map(fields.map((f) => [f.name, f]));

	const filtered = query?.filter
		? records.filter((r) => matchesFilter(query.filter as FilterNode, r.values, byName))
		: records.slice();

	// Desempate final por id ascendente SIEMPRE, como última clave de la misma pasada de orden
	// (nunca como una re-ordenación posterior: eso pisaría el sort explícito). Sin `sort`, esta
	// única clave es la que estabiliza el orden por defecto (§4.2).
	const sorted = stableSort(filtered, sortComparator(query?.sort, byName));

	const page = query?.page ?? DEFAULT_PAGE;
	const perPage = query?.perPage ?? DEFAULT_PER_PAGE;
	const totalItems = sorted.length;
	const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / perPage);
	const start = (page - 1) * perPage;
	const items = sorted.slice(start, start + perPage);

	return { items, page, perPage, totalItems, totalPages };
}

// ————— Filtro —————

function matchesFilter(
	node: FilterNode,
	values: Record<string, FieldValue>,
	byName: Map<string, Field>
): boolean {
	if (node.kind === 'group') {
		if (node.combinator === 'and') return node.nodes.every((n) => matchesFilter(n, values, byName));
		return node.nodes.some((n) => matchesFilter(n, values, byName));
	}

	const field = byName.get(node.field) as Field; // ya validado por validateQuery
	const value = values[node.field] ?? null;

	switch (node.op) {
		case 'empty':
			return isEmptyValue(field, value);
		case 'notEmpty':
			return !isEmptyValue(field, value);
		case 'eq':
			return compareEq(field, value, node.value);
		case 'neq':
			return !compareEq(field, value, node.value);
		case 'gt':
			return compareOrder(value) !== null && compareOrder(value)! > (node.value as number | string);
		case 'gte':
			return (
				compareOrder(value) !== null && compareOrder(value)! >= (node.value as number | string)
			);
		case 'lt':
			return compareOrder(value) !== null && compareOrder(value)! < (node.value as number | string);
		case 'lte':
			return (
				compareOrder(value) !== null && compareOrder(value)! <= (node.value as number | string)
			);
		case 'contains':
			return matchesContains(field, value, node.value as string);
		case 'in':
			return matchesIn(field, value, node.value as unknown as (string | number)[]);
	}
}

/** `true` si `field` es de tipo `select`/`relation` con `multiple: true`. */
function isMultiField(field: Field): boolean {
	return (field.type === 'select' || field.type === 'relation') && field.multiple;
}

function compareEq(
	field: Field,
	value: FieldValue,
	target: string | number | boolean | null
): boolean {
	if (isMultiField(field)) return false; // 'eq' no está permitido para multi (validateQuery ya lo bloquea)
	return value === target;
}

function compareOrder(value: FieldValue): number | string | null {
	if (value === null) return null;
	if (typeof value === 'number' || typeof value === 'string') return value;
	return null;
}

/**
 * Pliegue de mayúsculas SOLO ASCII (límite real de SQLite `LIKE`, que PB usa para `~`):
 * `memory` DEBE imitar esta limitación, no "mejorarla" (§4.6, §7).
 */
function foldAscii(s: string): string {
	let out = '';
	for (const ch of s) {
		const code = ch.codePointAt(0)!;
		out += code >= 65 && code <= 90 ? String.fromCodePoint(code + 32) : ch;
	}
	return out;
}

function matchesContains(field: Field, value: FieldValue, needle: string): boolean {
	if (field.type === 'select' && field.multiple) {
		return Array.isArray(value) && (value as string[]).includes(needle);
	}
	if (typeof value !== 'string') return false;
	return foldAscii(value).includes(foldAscii(needle));
}

function matchesIn(field: Field, value: FieldValue, set: (string | number)[]): boolean {
	if (set.length === 0) return false; // 'in' vacío no casa nada (§9.8), no es error
	if (isMultiField(field)) {
		if (!Array.isArray(value)) return false;
		return (value as string[]).some((v) => set.includes(v));
	}
	if (value === null) return false;
	return set.includes(value as string | number);
}

// ————— Orden —————

/**
 * Comparador único para toda la query: aplica las claves de `sort` en orden y, tanto si hay
 * empate como si no se pidió `sort`, desempata por `id` ascendente (§4.2, §4.6, ley L3).
 */
function sortComparator(
	sort: Query['sort'],
	byName: Map<string, Field>
): (a: VegaRecord, b: VegaRecord) => number {
	return (a, b) => {
		if (sort) {
			for (const spec of sort) {
				const field = byName.get(spec.field) as Field;
				const cmp = compareValues(
					a.values[spec.field] ?? null,
					b.values[spec.field] ?? null,
					field
				);
				if (cmp !== 0) return spec.dir === 'asc' ? cmp : -cmp;
			}
		}
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	};
}

function compareValues(a: FieldValue, b: FieldValue, field: Field): number {
	// null se ordena antes que cualquier valor real (elección documentada; el contrato no fija
	// el orden de los nulos, pero exige que sea idéntico entre adaptadores).
	if (a === null && b === null) return 0;
	if (a === null) return -1;
	if (b === null) return 1;

	if (field.type === 'bool') return a === b ? 0 : a ? 1 : -1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	// text/date/select-single/relation-single: comparación binaria/codepoint (§4.6).
	return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** `Array.prototype.sort` de V8 ya es estable (ES2019+); se envuelve para dejar la intención clara. */
function stableSort<T>(items: T[], cmp: (a: T, b: T) => number): T[] {
	return items.slice().sort(cmp);
}
