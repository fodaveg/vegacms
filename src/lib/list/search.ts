/**
 * Construcción de la `Query` del puerto para un listado (Parte 4, Fase 4b del contrato P4), a
 * partir del `ViewState` efímero de la URL (`query-state.ts`) y el modelo ya resuelto
 * (`ResolvedContentType`). Módulo puro: sin Svelte, sin el puerto (solo importa el AST y las
 * funciones de validación de `$lib/backend/query`, que son puras), sin `pocketbase`.
 *
 * CRÍTICO (L-P4.3): toda `Query` que produce `buildListQuery` DEBE pasar `validateQuery` sin
 * lanzar — es la garantía que verifican los tests de este módulo, no una promesa suelta.
 */

import { DEFAULT_PER_PAGE, isScalarField, type FilterNode, type Query } from '$lib/backend/query';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { ViewState } from './query-state';

/**
 * `true` para la familia texto EXACTA que admite substring libre (Audit H3): text/richtext/
 * email/url. Deliberadamente NO se usa `allowedFilterOps(field).includes('contains')` para esto
 * (bug de code review): `contains` también aparece en la tabla de `selectMulti` (§4.6), pero ahí
 * es "¿el array contiene este valor exacto?" (`matchesContains` en `adapters/memory/query.ts`),
 * una semántica de MEMBRESÍA, no de substring de texto libre. Un `select` múltiple puede colarse
 * en `listFields` (el manifiesto puede declarar cualquier campo ahí, sin pasar por `listable`) y
 * si se infiriera por `allowedFilterOps` acabaría en el OR de búsqueda con una condición sin
 * sentido para lo que el usuario tecleó.
 */
function isTextLikeField(field: Field): boolean {
	return (
		field.type === 'text' ||
		field.type === 'richtext' ||
		field.type === 'email' ||
		field.type === 'url'
	);
}

/**
 * Nombres de campo elegibles para la búsqueda libre (D-P4.3(a)): unión del `titleField` (si lo
 * hay) y de los campos de `listFields`, FILTRADA a la familia texto (`isTextLikeField`). Esto
 * excluye tanto al `statusField` (`select` simple) como a cualquier `select`/`relation`
 * múltiple que se cuele en `listFields`, sin necesidad de un caso especial por nombre.
 * Deduplicado por nombre vía `Set`.
 */
function eligibleSearchFieldNames(type: ResolvedContentType): string[] {
	const candidates = new Set<string>();
	if (type.titleField !== null) candidates.add(type.titleField);
	for (const name of type.listFields) candidates.add(name);

	const byName = new Map(type.schema.fields.map((f) => [f.name, f]));
	const eligible: string[] = [];
	for (const name of candidates) {
		const field = byName.get(name);
		if (field && isTextLikeField(field)) eligible.push(name);
	}
	return eligible;
}

/**
 * `true` si `type` tiene al menos un campo elegible para búsqueda libre; 4c la usa para
 * ocultar/inertizar el input de búsqueda cuando no tiene ningún efecto posible.
 */
export function isSearchEnabled(type: ResolvedContentType): boolean {
	return eligibleSearchFieldNames(type).length > 0;
}

/** Nodo de búsqueda (OR de `contains` sobre los campos elegibles), o `null` si no aplica. */
function buildSearchNode(type: ResolvedContentType, q: string): FilterNode | null {
	if (q === '') return null;
	const eligible = eligibleSearchFieldNames(type);
	if (eligible.length === 0) return null; // sin campos elegibles: la búsqueda queda deshabilitada

	const conds: FilterNode[] = eligible.map((field): FilterNode => ({
		kind: 'cond',
		field,
		op: 'contains',
		value: q
	}));
	return conds.length === 1 ? conds[0] : { kind: 'group', combinator: 'or', nodes: conds };
}

/**
 * Compone la `Query` del puerto para el listado de `type` en el estado `state` (§4.6):
 * - Búsqueda: OR de `contains` sobre los campos elegibles (ver `buildSearchNode`); ausente si
 *   `state.q` está vacío o no hay ningún campo elegible.
 * - Filtro de estado (D-P4.4(a)): `statusField eq state.status`, si ambos están presentes.
 * - Búsqueda y filtro de estado se combinan en un grupo `and` si hay más de uno; si solo hay
 *   uno, ese nodo directamente; si ninguno, `filter` queda ausente.
 * - `sort`: solo si `state.sort.field` existe en `type.schema.fields` y es escalar
 *   (`isScalarField`, D-P4.6(a)); si no, se omite por completo (nunca se cuela un sort inválido).
 * - `page`/`perPage`: `state.page` y `DEFAULT_PER_PAGE` (P4 v1 no ofrece cambiar el tamaño
 *   de página desde la vista).
 */
export function buildListQuery(type: ResolvedContentType, state: ViewState): Query {
	const topNodes: FilterNode[] = [];

	const searchNode = buildSearchNode(type, state.q);
	if (searchNode !== null) topNodes.push(searchNode);

	if (state.status !== null && type.statusField !== null) {
		topNodes.push({ kind: 'cond', field: type.statusField, op: 'eq', value: state.status });
	}

	const query: Query = { page: state.page, perPage: DEFAULT_PER_PAGE };

	if (topNodes.length === 1) {
		query.filter = topNodes[0];
	} else if (topNodes.length > 1) {
		query.filter = { kind: 'group', combinator: 'and', nodes: topNodes };
	}

	if (state.sort !== null) {
		const { field, dir } = state.sort;
		const schemaField = type.schema.fields.find((f) => f.name === field);
		if (schemaField && isScalarField(schemaField)) {
			query.sort = [{ field, dir }];
		}
	}

	return query;
}
