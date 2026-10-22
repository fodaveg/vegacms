/** Lecturas del árbol por el puerto, con proyección y cursor reutilizados del exportador. */
import type { BackendPort } from '$lib/backend/port';
import type { VegaRecord } from '$lib/backend/types';
import { fetchAllPages } from '$lib/transfer/paginate';

export async function loadTreeRecords(
	port: Pick<BackendPort, 'list'>,
	collection: string,
	fields?: string[]
): Promise<VegaRecord[]> {
	const result = await fetchAllPages(
		(query) => port.list(collection, { ...query, ...(fields ? { fields } : {}) }),
		undefined
	);
	return result.records;
}
