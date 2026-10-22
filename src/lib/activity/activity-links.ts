/** Una consulta id-in por colección y página; nunca un GET por fila. */
import type { BackendPort } from '$lib/backend/port';
import type { ContentModel } from '$lib/model/types';
import type { ActivityEntry } from './activity-collection';
import { mediaRoute, recordRoute, trashRoute } from '$lib/nav/routes';
export interface ActivityTarget {
	label: string;
	href: string | null;
	missing: boolean;
	copied: boolean;
}
export const targetKey = (entry: Pick<ActivityEntry, 'collection' | 'recordId'>): string =>
	JSON.stringify([entry.collection, entry.recordId]);

export async function resolveActivityTargets(
	port: BackendPort,
	model: ContentModel,
	entries: ActivityEntry[]
): Promise<Record<string, ActivityTarget>> {
	const targets: Record<string, ActivityTarget> = {};
	const collections = [...new Set(entries.map((entry) => entry.collection))];
	await Promise.all(
		collections.map(async (collection) => {
			const rows = entries.filter((entry) => entry.collection === collection);
			const ids = [...new Set(rows.map((entry) => entry.recordId))];
			const type = model.types.find((type) => type.name === collection);
			const titleField = type?.titleField;
			const live = type
				? (
						await port.list(collection, {
							perPage: 200,
							filter: { kind: 'cond', field: 'id', op: 'in', value: ids },
							fields: titleField ? [titleField] : []
						})
					).items
				: [];
			const deletedIds = ids.filter((id) => !live.some((record) => record.id === id));
			const revisionType = model.types.find((type) => type.name === 'vega_revisions');
			const copiedIds = new Set<string>();
			if (deletedIds.length && revisionType) {
				// Puede haber muchas revisiones del mismo id: una sola página no demuestra ausencia.
				for (let page = 1; ; page++) {
					const copies = await port.list('vega_revisions', {
						page,
						perPage: 200,
						fields: ['recordId'],
						filter: {
							kind: 'group',
							combinator: 'and',
							nodes: [
								{ kind: 'cond', field: 'collection', op: 'eq', value: collection },
								{ kind: 'cond', field: 'kind', op: 'eq', value: 'delete' },
								{ kind: 'cond', field: 'recordId', op: 'in', value: deletedIds }
							]
						}
					});
					for (const copy of copies.items) copiedIds.add(String(copy.values.recordId));
					if (copies.items.length < 200 || copiedIds.size === deletedIds.length) break;
				}
			}
			for (const row of rows) {
				const record = live.find((record) => record.id === row.recordId);
				const copied = copiedIds.has(row.recordId);
				const title = titleField && record?.values[titleField];
				targets[targetKey(row)] = {
					label: typeof title === 'string' && title.trim() ? title : row.label || row.recordId,
					href: record
						? collection === 'vega_media'
							? mediaRoute()
							: type && !type.hidden
								? recordRoute(collection, row.recordId)
								: null
						: copied
							? trashRoute()
							: null,
					missing: !record,
					copied
				};
			}
		})
	);
	return targets;
}
