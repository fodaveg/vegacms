/**
 * Motor PURO de la búsqueda global de la topbar (`#lote-shell`): qué colecciones se buscan, con
 * qué `Query`, y cómo se traduce cada página de resultados a lo que pinta `GlobalSearch.svelte`.
 * Módulo puro (sin Svelte, sin el puerto, sin `pocketbase`): la orquestación asíncrona vive en
 * `global-search.svelte.ts` y el marcado en `GlobalSearch.svelte`.
 *
 * **Nada de esto se deriva por su cuenta**: los campos elegibles y el OR de `contains` salen de
 * `buildSearchFilter`/`buildListQuery` (`$lib/list/search`, LA misma búsqueda que el listado), y
 * el título/estado de cada acierto de `describeCell`/`resolveTitleCellText`/`classifyStatusBadge`
 * (`$lib/list/cell`, `$lib/list/list-load`) — exactamente igual que hace `EditorRail.svelte`. Si
 * el buscador global encontrara cosas distintas de las que encuentra el buscador del listado, o
 * titulase las filas de otra forma, sería un segundo criterio destinado a desincronizarse.
 *
 * **Alcance honesto (v1)**: se buscan las colecciones VISIBLES del modelo que tengan al menos un
 * campo de texto elegible, una `list()` por colección y unos pocos aciertos de cada una. No hay
 * índice de texto completo ni ranking entre colecciones: el orden de los grupos es el de la
 * navegación (lo que el usuario ya conoce), no un "relevance score" inventado. Las vistas
 * fusionadas (`mergedViews`) NO se buscan aparte: sus registros pertenecen a las colecciones
 * origen, que sí se buscan, así que aparecerían dos veces.
 */

import type { Page, RecordId, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import type { Locale } from '$lib/i18n';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import { classifyStatusBadge, describeCell, type StatusBadgeKind } from '$lib/list/cell';
import { resolveTitleCellText } from '$lib/list/list-load';
import { buildListQuery, buildSearchFilter, isSearchEnabled } from '$lib/list/search';

/**
 * Longitud mínima del término para disparar una consulta. Con 1 carácter la búsqueda es ruido
 * puro (casa casi todo) y cuesta una petición por colección; 2 es el mínimo con el que el
 * resultado empieza a significar algo.
 */
export const GLOBAL_SEARCH_MIN_CHARS = 2;

/**
 * Aciertos que se piden POR COLECCIÓN. El panel es un atajo de navegación, no un listado: si hay
 * más, el grupo enseña el total y el enlace "ver todos" lleva al listado de esa colección con el
 * MISMO término ya aplicado (`?q=`), que sí pagina.
 */
export const GLOBAL_SEARCH_PER_TYPE = 5;

/** Un acierto ya listo para pintar: sin valores crudos, sin ids de relación, sin HTML. */
export interface GlobalSearchHit {
	/** `ContentType.name` de la colección a la que pertenece (para `recordRoute`). */
	type: string;
	id: RecordId;
	/** Título ya resuelto (o el "(sin título)" que pase el llamador). */
	title: string;
	/** Etiqueta del estado (`statusLabels` si el manifiesto la declara, si no el valor crudo), o
	 *  `null` si el tipo no tiene `statusField` o el registro lo tiene vacío. */
	statusLabel: string | null;
	/** Color de la insignia de estado, derivado del valor CRUDO (nunca de la etiqueta). */
	statusKind: StatusBadgeKind | null;
}

/** Los aciertos de UNA colección, en el orden en que los devolvió el puerto. */
export interface GlobalSearchGroup {
	type: string;
	label: string;
	icon: string | null;
	hits: GlobalSearchHit[];
	/** Total de coincidencias en esa colección (`Page.totalItems`), que puede ser mayor que
	 *  `hits.length` — de ahí el "ver todos" del pie del grupo. */
	totalItems: number;
}

/**
 * Normaliza lo tecleado: recorta extremos y colapsa espacios interiores. Se hace ANTES de decidir
 * si se busca (`isSearchableTerm`) y antes de construir la `Query`, para que "  hola  " y "hola"
 * sean la misma búsqueda y no dos peticiones distintas.
 */
export function normalizeSearchTerm(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ');
}

/** `true` ⟺ el término ya normalizado merece una consulta (§`GLOBAL_SEARCH_MIN_CHARS`). */
export function isSearchableTerm(term: string): boolean {
	return term.length >= GLOBAL_SEARCH_MIN_CHARS;
}

/**
 * Las colecciones que se buscan, EN ORDEN DE NAVEGACIÓN: se recorre `model.nav` (ya filtrado a lo
 * visible y ordenado por grupos, P2) en vez de `model.types` (que incluye lo oculto, `vega`/
 * `vega_*` entre otros — buscar ahí filtraría el manifiesto del propio CMS en los resultados).
 * Los `NavItem` de `kind:'view'` se saltan (ver cabecera: sus registros ya salen por su colección
 * origen), igual que cualquier colección sin campo de texto elegible (`isSearchEnabled`): pedirle
 * una búsqueda a esa colección devolvería `filter` ausente ⇒ la colección entera.
 */
export function globalSearchTypes(model: ContentModel): ResolvedContentType[] {
	const byName = new Map(model.types.map((t) => [t.name, t]));
	const result: ResolvedContentType[] = [];
	for (const group of model.nav.groups) {
		for (const item of group.items) {
			if (item.kind !== 'collection') continue;
			const type = byName.get(item.type);
			if (type && isSearchEnabled(type)) result.push(type);
		}
	}
	return result;
}

/**
 * La `Query` de una colección para el término `term`: la MISMA que produce el listado con ese
 * texto en la caja de búsqueda y sin filtro de estado (`buildListQuery`), solo que pidiendo
 * `GLOBAL_SEARCH_PER_TYPE` aciertos en vez de una página entera. Que el orden salga del propio
 * tipo (`defaultSort`/`orderField`) no es accidental: los cinco primeros aciertos del panel son
 * los cinco primeros del listado, así que el atajo y la lista cuentan lo mismo.
 */
export function buildGlobalSearchQuery(type: ResolvedContentType, term: string): Query {
	return buildListQuery(
		type,
		{ q: term, status: null, sort: null, page: 1 },
		{ perPage: GLOBAL_SEARCH_PER_TYPE }
	);
}

/**
 * `true` si `type` puede buscarse con `term` (hay un OR de `contains` que construir). Guarda de
 * seguridad del llamador asíncrono: sin ella, una colección sin campos elegibles produciría una
 * `Query` SIN `filter` y el panel enseñaría sus primeros registros como si casaran con lo tecleado.
 */
export function canSearchType(type: ResolvedContentType, term: string): boolean {
	return buildSearchFilter(type, term) !== null;
}

/**
 * Traduce la página devuelta por el puerto al grupo que se pinta. `untitled` es el i18n
 * "(sin título)" ya traducido (este módulo no traduce: es puro y no conoce el `ctx`).
 */
export function toGlobalSearchGroup(
	type: ResolvedContentType,
	page: Page<VegaRecord>,
	locale: Locale,
	untitled: string
): GlobalSearchGroup {
	const titleField =
		type.titleField !== null ? (type.fields.find((f) => f.name === type.titleField) ?? null) : null;
	const statusField =
		type.statusField !== null
			? (type.fields.find((f) => f.name === type.statusField) ?? null)
			: null;

	const hits = page.items.map((record): GlobalSearchHit => {
		const title = titleField
			? resolveTitleCellText(
					describeCell(titleField, record.values[titleField.name] ?? null, locale),
					untitled
				)
			: untitled;

		const rawStatus = statusField ? record.values[statusField.name] : null;
		const statusValue = typeof rawStatus === 'string' && rawStatus !== '' ? rawStatus : null;

		return {
			type: type.name,
			id: record.id,
			title,
			statusLabel: statusValue === null ? null : (type.statusLabels?.[statusValue] ?? statusValue),
			statusKind: statusValue === null ? null : classifyStatusBadge(statusValue)
		};
	});

	return {
		type: type.name,
		label: type.label,
		icon: type.icon,
		hits,
		totalItems: page.totalItems
	};
}

/**
 * Todos los aciertos en orden de pintado, para la navegación por teclado: el índice activo del
 * panel indexa ESTA lista (una sola secuencia que cruza los grupos), no la de cada grupo.
 */
export function flattenHits(groups: GlobalSearchGroup[]): GlobalSearchHit[] {
	return groups.flatMap((group) => group.hits);
}

/**
 * Siguiente índice activo al pulsar ↓/↑ (`delta` ±1), con vuelta circular (del último al primero
 * y viceversa, patrón APG de listbox). `count === 0` ⇒ `-1` ("ninguno activo"), nunca un índice
 * que no existe.
 */
export function nextActiveIndex(current: number, delta: number, count: number): number {
	if (count <= 0) return -1;
	if (current < 0) return delta > 0 ? 0 : count - 1;
	return (current + delta + count) % count;
}
