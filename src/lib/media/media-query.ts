/**
 * `Query` del grid de `vega_media` (Fase P6·6b): ordenado por `created` DESC (más reciente
 * primero, el propósito del `autodate` añadido en 6a) + paginación. Módulo puro, sin el puerto:
 * `+page.svelte`/`media-list-state.svelte.ts` son quienes llaman a `ctx.port.list`.
 *
 * `?page=` (D-P4.9-alike): mismo formato que el listado de `/c/[type]` (P4 §4.9), pero SIN
 * `q`/`sort`/`status` — 6b no trae buscador ni filtro, solo paginación. `parseMediaPage` es
 * TOLERANTE (mismo criterio que `parseViewState`, L-P4.13): una URL corrupta o tecleada a mano
 * nunca lanza, degrada a la página 1.
 */

import type { Query } from '$lib/backend/query';

/** Tamaño de página del grid: más pequeño que `DEFAULT_PER_PAGE` (30, listados tabulares) porque
 *  cada celda es una miniatura, no una fila — 24 encaja en rejillas de 4/6/8 columnas sin resto. */
export const MEDIA_PER_PAGE = 24;

/** Construye la `Query` del grid para `page` (1-based): `created` desc + la página pedida. */
export function buildMediaListQuery(page: number): Query {
	return {
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
export function mediaPageToParams(page: number): URLSearchParams {
	const params = new URLSearchParams();
	if (page !== 1) params.set('page', String(page));
	return params;
}
