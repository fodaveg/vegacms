/** Carga diferida del listado jerárquico: árbol completo, filtro del backend y orden por ramas. */
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedContentType } from '$lib/model/types';
import { loadTreeRecords } from '$lib/tree/load';
import { flattenTree } from '$lib/tree/records';
import { fetchAllPages } from '$lib/transfer/paginate';
import { buildListQuery } from './search';
import type { ViewState } from './query-state';

export async function loadTreeList(
	port: BackendPort,
	type: ResolvedContentType,
	viewState: ViewState
) {
	const records = await loadTreeRecords(port, type.name);
	const treeRows = flattenTree(records, type.tree!, type.orderField);
	const query = buildListQuery(type, viewState);
	const matching = query.filter
		? await fetchAllPages((query) => port.list(type.name, { ...query, fields: [] }), {
				filter: query.filter
			})
		: null;
	const ids = matching ? new Set(matching.records.map((record) => record.id)) : null;
	const items = treeRows.filter((row) => !ids || ids.has(row.record.id)).map((row) => row.record);
	return {
		treeRows,
		page: {
			items,
			page: 1,
			perPage: Math.max(1, items.length),
			totalItems: items.length,
			totalPages: items.length ? 1 : 0
		}
	};
}
