/**
 * `Query` de la papelera (`#lote-integridad`, Fase B2, §10.2): `kind:'delete'` ordenado por
 * `created` DESC (más reciente primero) + paginación — mismo patrón que `media-query.ts`
 * (`buildMediaListQuery`/`parseMediaPage`/`mediaPageToParams`), aquí para `/papelera` en vez del
 * grid de `/media`. Módulo puro, sin el puerto: `+page.svelte` es quien llama a `ctx.port.list`.
 */

import type { Query } from '$lib/backend/query';

/** Tamaño de página de la papelera: listado tabular como `/c/[type]`, mismo `DEFAULT_PER_PAGE`
 *  informal que el resto de listados de registros (no la rejilla de miniaturas de `/media`). */
export const TRASH_PER_PAGE = 30;

/** Construye la `Query` de `vega_revisions` para `page` (1-based): solo `kind:'delete'`, `created`
 *  desc, la página pedida. */
export function buildTrashListQuery(page: number): Query {
	return {
		filter: { kind: 'cond', field: 'kind', op: 'eq', value: 'delete' },
		sort: [{ field: 'created', dir: 'desc' }],
		page,
		perPage: TRASH_PER_PAGE
	};
}

/** Parsea `?page=` de la URL de la papelera. Ausente, no-entero o `< 1` → `1` (nunca lanza) —
 *  idéntico criterio que `parseMediaPage`. */
export function parseTrashPage(params: URLSearchParams): number {
	const raw = params.get('page');
	const num = raw === null ? NaN : Number(raw);
	return Number.isInteger(num) && num >= 1 ? num : 1;
}

/** Serializa `page` a `URLSearchParams` (`page === 1` no se escribe) — idéntico criterio que
 *  `mediaPageToParams`. */
export function trashPageToParams(page: number): URLSearchParams {
	const params = new URLSearchParams();
	if (page !== 1) params.set('page', String(page));
	return params;
}
