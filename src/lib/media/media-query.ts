/**
 * `Query` del grid de `vega_media` (Fase P6·6b): ordenado por `created` DESC (más reciente
 * primero, el propósito del `autodate` añadido en 6a) + paginación. Módulo puro, sin el puerto:
 * `+page.svelte`/`media-list-state.svelte.ts` son quienes llaman a `ctx.port.list`.
 *
 * `?page=` (D-P4.9-alike): mismo formato que el listado de `/c/[type]` (P4 §4.9), pero SIN
 * `q`/`sort`/`status` — 6b no trae buscador ni filtro, solo paginación. `parseMediaPage` es
 * TOLERANTE (mismo criterio que `parseViewState`, L-P4.13): una URL corrupta o tecleada a mano
 * nunca lanza, degrada a la página 1.
 *
 * **`search` (Fase P6·6e, opcional)**: `buildMediaListQuery(page, { search })` añade un filtro
 * `contains` SERVER-SIDE por `alt` O `title` — lo usan `MediaPicker.svelte` (el buscador del picker
 * de biblioteca) y, desde el audit del 30 sep, el buscador de `/media/+page.svelte` (antes
 * filtraba en el cliente solo los 24 cargados y solo por nombre de fichero). `opts` es opcional:
 * sin él el resultado es idéntico al de antes de 6e. El mime NO es consultable (audit H1, `file` solo admite `empty`/`notEmpty` en `Query`), por
 * eso el picker filtra por `accept` en el CLIENTE (`media-picker.ts`, `matchesAccept`) — solo
 * `alt`/`title` viajan como filtro real al backend.
 */

import type { FilterNode, Query } from '$lib/backend/query';

/** Tamaño de página del grid: más pequeño que `DEFAULT_PER_PAGE` (30, listados tabulares) porque
 *  cada celda es una miniatura, no una fila — 24 encaja en rejillas de 4/6/8 columnas sin resto. */
export const MEDIA_PER_PAGE = 24;

/** Espera (ms) entre la última tecla y la búsqueda SERVER-SIDE — la comparten el selector
 *  (`MediaPicker.svelte`) y `/media`; mismo valor que el buscador de `Relation.svelte` (F5-e). */
export const MEDIA_SEARCH_DEBOUNCE_MS = 250;

interface MediaListQueryOptions {
	/** Término de búsqueda SERVER-SIDE por `alt`/`title` (Fase P6·6e, ver cabecera). En blanco o
	 *  ausente ⇒ sin filtro (mismo criterio que `buildTitleSearchQuery` de P5, `relation-search.ts`). */
	search?: string;
	/** null=Todos, none=Sin carpeta, otro valor=id de carpeta. */
	folder?: string | null;
}

/** `contains` sobre `alt` O `title` (OR): cualquiera de los dos metadatos coincidiendo basta. */
function buildMediaSearchFilter(term: string): FilterNode {
	return {
		kind: 'group',
		combinator: 'or',
		nodes: [
			{ kind: 'cond', field: 'alt', op: 'contains', value: term },
			{ kind: 'cond', field: 'title', op: 'contains', value: term }
		]
	};
}

/** Construye la `Query` del grid para `page` (1-based): `created` desc + la página pedida, más el
 *  filtro de `opts.search` si viene no-vacío (Fase P6·6e, ver cabecera). */
export function buildMediaListQuery(page: number, opts?: MediaListQueryOptions): Query {
	const search = opts?.search?.trim();
	const nodes: FilterNode[] = [];
	if (search) nodes.push(buildMediaSearchFilter(search));
	if (opts?.folder)
		nodes.push({
			kind: 'cond',
			field: 'folder',
			op: opts.folder === 'none' ? 'empty' : 'eq',
			value: opts.folder === 'none' ? null : opts.folder
		});
	return {
		...(nodes.length
			? {
					filter:
						nodes.length === 1
							? nodes[0]
							: { kind: 'group' as const, combinator: 'and' as const, nodes }
				}
			: {}),
		sort: [{ field: 'created', dir: 'desc' }],
		page,
		perPage: MEDIA_PER_PAGE
	};
}

/** Parsea `?page=` de la URL del grid. Ausente, no-entero o `< 1` → `1` (nunca lanza). */
export function parseMediaPage(params: URLSearchParams): number {
	const raw = params.get('page');
	const num = raw === null ? NaN : Number(raw);
	return Number.isInteger(num) && num >= 1 ? num : 1;
}

/**
 * Serializa `page` a `URLSearchParams` (URLs limpias, mismo criterio que `viewStateToParams` de
 * P4 §4b): `page === 1` no se escribe. Vive aquí (`.ts` puro) y no en `+page.svelte` a propósito:
 * `svelte/prefer-svelte-reactivity` prohíbe `new URLSearchParams()` DENTRO de un `.svelte`
 * (pide `SvelteURLSearchParams`, pensado para estado reactivo) — este valor es un objeto de
 * transporte de un solo uso, nunca `$state`, así que el módulo puro es el sitio correcto (mismo
 * motivo que `query-state.ts` en vez de construirlo en `/c/[type]/+page.svelte`).
 */
export function mediaPageToParams(page: number, folder?: string | null): URLSearchParams {
	const params = new URLSearchParams();
	if (page !== 1) params.set('page', String(page));
	if (folder) params.set('folder', folder);
	return params;
}

/** URL tolerante: los ids desconocidos se resuelven contra la lista cargada antes de consultar. */
export function parseMediaFolder(params: URLSearchParams): string | null {
	const value = params.get('folder');
	return value === 'none' || (value && /^[A-Za-z0-9_-]{1,100}$/.test(value)) ? value : null;
}
