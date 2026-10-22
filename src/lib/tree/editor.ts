/** Preparación diferida del selector y del aviso inicial de una colección en árbol. */
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedTreeConfig } from '$lib/model/types';
import { loadTreeRecords } from './load';
import { treeParentFilter, validateTreeMove } from './records';

export async function prepareTreeEditor(
	port: Pick<BackendPort, 'list'>,
	name: string,
	id: string | null,
	parent: string | null,
	config: ResolvedTreeConfig
) {
	const records = await loadTreeRecords(port, name, [config.parentField]);
	return {
		filter: treeParentFilter(records, id, config),
		problem: validateTreeMove(records, id ?? '__vega_new_record__', parent, config)
	};
}
