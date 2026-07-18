/**
 * Estado de vista de un listado ⇄ `URLSearchParams` (Parte 4, Fase 4b del contrato P4).
 *
 * El estado de vista es EFÍMERO y vive en la URL (L-P4.7, D-P4.9): no se persiste en ningún
 * store ni backend, solo en las claves `?q=&sort=&dir=&status=&page=`. Este módulo es puro
 * transporte de strings; no conoce el modelo (`ResolvedContentType`) ni valida que un campo de
 * sort exista o sea escalar — esa elegibilidad es responsabilidad de `search.ts`.
 */

/** Estado de vista de un listado, ya tipado (nunca strings sueltos fuera de este módulo). */
export interface ViewState {
	/** Texto de búsqueda libre; `''` = sin búsqueda. */
	q: string;
	/** Orden activo, o `null` = sin orden explícito. */
	sort: { field: string; dir: 'asc' | 'desc' } | null;
	/** Valor de `statusField` por el que filtrar, o `null` = sin filtro de estado. */
	status: string | null;
	/** Página 1-based; siempre >= 1. */
	page: number;
}

/**
 * Parsea `URLSearchParams` a `ViewState`. TOLERANTE (L-P4.13): una URL corrupta o tecleada a
 * mano NUNCA lanza, degrada al valor por defecto de cada clave:
 * - `page` ausente, no-entero o < 1 → `1`.
 * - `dir` fuera de `{asc,desc}`, o `sort` ausente/vacío → `sort: null` (se descarta el par
 *   entero: un `sort` sin `dir` válido no tiene semántica).
 * - `q` ausente → `''`.
 * - `status` ausente o vacío → `null`.
 */
export function parseViewState(params: URLSearchParams): ViewState {
	const q = params.get('q') ?? '';

	const sortField = params.get('sort');
	const dir = params.get('dir');
	let sort: ViewState['sort'] = null;
	if (sortField && (dir === 'asc' || dir === 'desc')) {
		sort = { field: sortField, dir };
	}

	const statusRaw = params.get('status');
	const status = statusRaw && statusRaw !== '' ? statusRaw : null;

	const pageRaw = params.get('page');
	const pageNum = pageRaw === null ? NaN : Number(pageRaw);
	const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;

	return { q, sort, status, page };
}

/**
 * Serializa `state` a `URLSearchParams`, omitiendo los valores por defecto (URLs limpias,
 * D-P4.9): `page === 1` no se escribe, `q === ''` no se escribe, `sort === null` no escribe ni
 * `sort` ni `dir`, `status === null` no se escribe. Junto con `parseViewState`, cumple la
 * propiedad de round-trip: `parseViewState(viewStateToParams(s))` preserva el estado
 * significativo de `s`.
 */
/**
 * Subconjunto de `ViewState` que puede parchear una navegación de vista (Fase 4d, D-P4.3/
 * D-P4.4/D-P4.6): NUNCA incluye `page` — quien aplica el parche (`navigateView` en
 * `+page.svelte`) SIEMPRE la resetea a 1, un filtro/búsqueda/orden nuevo no debe dejar al
 * usuario varado en una página que puede ni existir en el resultado nuevo. Vive aquí (`.ts`) y
 * no en el `.svelte` que lo consume para que el `Partial` (con sus `?` internos) no aparezca
 * literalmente en ningún fichero `.svelte` del repo.
 */
export type ViewStatePatch = Partial<Pick<ViewState, 'q' | 'sort' | 'status'>>;

export function viewStateToParams(state: ViewState): URLSearchParams {
	const params = new URLSearchParams();
	if (state.q !== '') params.set('q', state.q);
	if (state.sort !== null) {
		params.set('sort', state.sort.field);
		params.set('dir', state.sort.dir);
	}
	if (state.status !== null) params.set('status', state.status);
	if (state.page !== 1) params.set('page', String(state.page));
	return params;
}
