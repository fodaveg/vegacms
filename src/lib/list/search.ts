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
 * email/url.
 *
 * **Exportada** (antes privada de este módulo) porque el motor de referencias
 * (`$lib/integrity/references.ts`) necesita la MISMA clasificación para su vía "url", y la primera
 * versión de aquel la reimplementó por su cuenta quedándose en `text`/`richtext` — un campo
 * `type: 'url'` con la URL de un asset pegada a mano no se encontraba, y el panel decía "nadie le
 * apunta" sobre algo que sí estaba enlazado (hallazgo de code-review). Un criterio duplicado es un
 * criterio que se desincroniza: este es el único sitio donde vive.
 *
 * Deliberadamente NO se usa `allowedFilterOps(field).includes('contains')` para esto
 * (bug de code review): `contains` también aparece en la tabla de `selectMulti` (§4.6), pero ahí
 * es "¿el array contiene este valor exacto?" (`matchesContains` en `adapters/memory/query.ts`),
 * una semántica de MEMBRESÍA, no de substring de texto libre. Un `select` múltiple puede colarse
 * en `listFields` (el manifiesto puede declarar cualquier campo ahí, sin pasar por `listable`) y
 * si se infiriera por `allowedFilterOps` acabaría en el OR de búsqueda con una condición sin
 * sentido para lo que el usuario tecleó.
 */
export function isTextLikeField(field: Field): boolean {
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

/**
 * Opciones del `statusField` resuelto de `type` (D-P4.4, extraído para R2 del rediseño C2):
 * `null` si el tipo no tiene convención de estado. Antes vivía DUPLICADA como `$derived.by`
 * privada de `ListToolbar.svelte`; con R2 pasó a compartirla con la extinta `FilterChips.svelte`
 * y, desde M6 (reabre R2), la comparten `ListToolbar` (menú "Filtrar", para ELEGIR un valor) y
 * `ActiveFilterChips` (gate de visibilidad + chip del valor ya elegido) — un único punto de
 * verdad de "¿este tipo ofrece filtro de estado?", nunca reimplementado dos veces.
 * `schema.type !== 'select'` es defensivo: la convención de P2 ya lo garantiza, pero este
 * módulo no confía ciegamente en esa invariante ajena.
 */
export function statusFilterOptions(type: ResolvedContentType): string[] | null {
	if (type.statusField === null) return null;
	const field = type.fields.find((f) => f.name === type.statusField);
	if (!field || field.schema.type !== 'select') return null;
	return field.schema.options;
}

/**
 * Nodo de búsqueda (OR de `contains` sobre los campos elegibles), o `null` si no aplica (término
 * vacío, o tipo sin ningún campo elegible).
 *
 * **Exportada** (antes privada) para la búsqueda global de la topbar (`#lote-shell`,
 * `$lib/shell/global-search.ts`), que busca el MISMO término en varias colecciones a la vez: la
 * alternativa era que aquel módulo reconstruyese el OR por su cuenta y acabase divergiendo de lo
 * que busca el listado (el mismo fallo que ya cazó el code-review con `isTextLikeField`, ver
 * arriba). Un `null` aquí significa "esta colección no puede buscarse", y el llamador DEBE
 * saltársela: emitir la query sin `filter` devolvería la colección ENTERA como si todo casara.
 */
export function buildSearchFilter(type: ResolvedContentType, q: string): FilterNode | null {
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
 *   Sin sort explícito (`state.sort === null`), el fallback es: 1) `type.defaultSort` (P2, orden
 *   INICIAL declarado por el manifiesto, opt-in, mockup `aquelarre-dark.html`) — ya llega
 *   validado (`field` existe y es escalar, `resolveDefaultSort`), así que se usa tal cual sin
 *   volver a comprobarlo (mismo criterio de confianza que `type.orderField` de abajo); 2) si no
 *   hay `defaultSort`, `type.orderField` resuelto (reorder manual, P2 §orderField) ordena
 *   ascendente por defecto — es el orden que el reorder manual persiste, así que sin esto el
 *   reorder recién guardado no se reflejaría hasta que el usuario pidiera orden explícitamente.
 *   Un sort explícito del usuario (URL) SIEMPRE gana sobre los dos fallbacks.
 * - `page`/`perPage`: `state.page` y `DEFAULT_PER_PAGE` (P4 v1 no ofrece cambiar el tamaño
 *   de página desde la vista). `opts.perPage` lo sobreescribe para llamadores que NO son el
 *   listado y necesitan una página corta —hoy solo la búsqueda global de la topbar, que pide unos
 *   pocos aciertos por colección (`$lib/shell/global-search.ts`)—; el valor sigue pasando por
 *   `validateQuery` en el adaptador, así que un tamaño fuera de `[1, MAX_PER_PAGE]` se rechaza
 *   igual que cualquier otra `Query` mal formada.
 */
export function buildListQuery(
	type: ResolvedContentType,
	state: ViewState,
	opts?: { perPage?: number }
): Query {
	const topNodes: FilterNode[] = [];

	const searchNode = buildSearchFilter(type, state.q);
	if (searchNode !== null) topNodes.push(searchNode);

	if (state.status !== null && type.statusField !== null) {
		topNodes.push({ kind: 'cond', field: type.statusField, op: 'eq', value: state.status });
	}

	const query: Query = { page: state.page, perPage: opts?.perPage ?? DEFAULT_PER_PAGE };

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
	} else if (type.defaultSort !== null) {
		query.sort = [{ field: type.defaultSort.field, dir: type.defaultSort.dir }];
	} else if (type.orderField !== null) {
		query.sort = [{ field: type.orderField, dir: 'asc' }];
	}

	return query;
}
