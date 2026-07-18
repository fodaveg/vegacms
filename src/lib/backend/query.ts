/**
 * El AST de `Query` (§4.6 del contrato) y su validación local.
 *
 * La validación de aquí es **idéntica para todos los adaptadores**: op/tipo incompatible,
 * campo inexistente, sort sobre no-escalar o paginación fuera de rango se rechazan sin tocar
 * red, con el mismo `VegaError 'validation'`, para que ambos adaptadores (y los futuros)
 * compartan la misma decisión (ley L3, paridad de Query).
 */

import type { Field } from './types';
import type { FieldError } from './errors';
import { VegaError } from './errors';

export interface Query {
	filter?: FilterNode;
	sort?: SortSpec[]; // se aplican en orden; estable
	page?: number; // 1-based; default 1; < 1 → violación de contrato (validation)
	perPage?: number; // default 30; rango [1, 200]; fuera de rango → validation
}

export interface SortSpec {
	field: string;
	dir: 'asc' | 'desc';
}

/**
 * Se discrimina por `op` para que `in` (que necesita un array) no obligue a "mentir" al tipo
 * del resto de operadores (que trabajan con un escalar). Evita el `as never`/`as unknown` en
 * quien construye queries: el valor correcto ya viene forzado por el propio `op`.
 */
export type FilterNode =
	| { kind: 'cond'; field: string; op: 'in'; value: (string | number)[] }
	| {
			kind: 'cond';
			field: string;
			op: Exclude<FilterOp, 'in'>;
			value: string | number | boolean | null;
	  }
	| { kind: 'group'; combinator: 'and' | 'or'; nodes: FilterNode[] }; // nodes.length >= 1; anidamiento libre

export type FilterOp =
	| 'eq'
	| 'neq'
	| 'gt'
	| 'gte'
	| 'lt'
	| 'lte'
	| 'contains' // substring, case-insensitive (garantizado solo para ASCII)
	| 'in' // value: (string|number)[] — azúcar de OR de eq
	| 'empty'
	| 'notEmpty'; // value: null

export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 30;
export const MAX_PER_PAGE = 200;

/**
 * Tabla de operadores permitidos por "familia" de campo (§4.6, dato consultable). No es 1:1
 * con `Field['type']` porque `select`/`relation` se bifurcan por `multiple` y por eso la
 * consulta pasa por `allowedFilterOps(field)`, no por indexar esta tabla directamente.
 */
export const FILTER_OPS_BY_FIELD_KIND = {
	text: ['eq', 'neq', 'contains', 'in', 'empty', 'notEmpty'],
	numberOrDate: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'],
	bool: ['eq', 'neq'],
	selectSingle: ['eq', 'neq', 'in', 'empty', 'notEmpty'],
	selectMulti: ['contains', 'empty', 'notEmpty'],
	relationSingle: ['eq', 'neq', 'in', 'empty', 'notEmpty'],
	// relation multi: como select multi, "eq"/"neq" no tienen una semántica de igualdad de
	// array bien definida por contrato — solo "¿el conjunto intersecta?" vía `in` (bug P1: antes
	// no se bifurcaba por `multiple` y `eq`/`neq` colaban silenciosamente resultados falsos).
	relationMulti: ['in', 'empty', 'notEmpty'],
	file: ['empty', 'notEmpty'],
	none: []
} as const satisfies Record<string, readonly FilterOp[]>;

/** Operadores permitidos para un campo concreto, según su tipo (y multiplicidad si aplica). */
export function allowedFilterOps(field: Field): readonly FilterOp[] {
	switch (field.type) {
		case 'text':
		case 'richtext':
		case 'email':
		case 'url':
			return FILTER_OPS_BY_FIELD_KIND.text;
		case 'number':
		case 'date':
			return FILTER_OPS_BY_FIELD_KIND.numberOrDate;
		case 'bool':
			return FILTER_OPS_BY_FIELD_KIND.bool;
		case 'select':
			return field.multiple
				? FILTER_OPS_BY_FIELD_KIND.selectMulti
				: FILTER_OPS_BY_FIELD_KIND.selectSingle;
		case 'relation':
			return field.multiple
				? FILTER_OPS_BY_FIELD_KIND.relationMulti
				: FILTER_OPS_BY_FIELD_KIND.relationSingle;
		case 'file':
			return FILTER_OPS_BY_FIELD_KIND.file;
		case 'json':
		case 'unsupported':
			return FILTER_OPS_BY_FIELD_KIND.none;
	}
}

/**
 * `true` si el campo es válido como clave de `sort` (§4.6): todo escalar excepto
 * `select`/`relation` múltiples, `file`, `json` y `unsupported`.
 */
export function isScalarField(field: Field): boolean {
	if (field.type === 'select' || field.type === 'relation') return !field.multiple;
	if (field.type === 'file' || field.type === 'json' || field.type === 'unsupported') return false;
	return true;
}

/**
 * Valida localmente una `Query` contra el esquema de campos de un `ContentType`. Lanza
 * `VegaError 'validation'` con un `FieldError` por cada problema encontrado (op/tipo
 * incompatible, campo inexistente en filtro o sort, sort sobre no-escalar, paginación fuera
 * de rango). No toca red: es idéntica para todos los adaptadores.
 */
export function validateQuery(fields: Field[], query: Query | undefined): void {
	if (!query) return;

	const byName = new Map(fields.map((f) => [f.name, f]));
	const fieldErrors: Record<string, FieldError> = {};

	if (query.filter) {
		collectFilterErrors(query.filter, byName, fieldErrors);
	}

	if (query.sort) {
		for (const spec of query.sort) {
			const field = byName.get(spec.field);
			if (!field) {
				fieldErrors[spec.field] = {
					code: 'validation_unknown_field',
					message: 'Campo desconocido'
				};
			} else if (!isScalarField(field)) {
				fieldErrors[spec.field] = {
					code: 'validation_invalid_sort_field',
					message: 'Campo no ordenable (no es escalar)'
				};
			}
		}
	}

	if (query.page !== undefined && query.page < 1) {
		fieldErrors['page'] = { code: 'validation_invalid_page', message: 'La página debe ser >= 1' };
	}

	if (query.perPage !== undefined && (query.perPage < 1 || query.perPage > MAX_PER_PAGE)) {
		fieldErrors['perPage'] = {
			code: 'validation_invalid_per_page',
			message: `perPage debe estar entre 1 y ${MAX_PER_PAGE}`
		};
	}

	if (Object.keys(fieldErrors).length > 0) {
		throw VegaError.validation(fieldErrors, 'Query no válida');
	}
}

function collectFilterErrors(
	node: FilterNode,
	byName: Map<string, Field>,
	fieldErrors: Record<string, FieldError>
): void {
	if (node.kind === 'group') {
		for (const child of node.nodes) collectFilterErrors(child, byName, fieldErrors);
		return;
	}

	const field = byName.get(node.field);
	if (!field) {
		fieldErrors[node.field] = { code: 'validation_unknown_field', message: 'Campo desconocido' };
		return;
	}

	const allowed = allowedFilterOps(field);
	if (!allowed.includes(node.op)) {
		fieldErrors[node.field] = {
			code: 'validation_invalid_operator',
			message: `Operador "${node.op}" no permitido para el campo "${field.name}"`
		};
	}
}
