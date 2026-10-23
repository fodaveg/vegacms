/** Filtros sobre columnas reales y cursor estable (created descendente, id ascendente). */
import type { FilterNode, Query } from '$lib/backend/query';
import type { ActivityEntry } from './activity-collection';

export interface ActivityFilters {
	actor: string;
	/** Directory identity includes its auth collection; absent preserves legacy callers. */
	actorCollection?: string;
	collection: string;
	action: string;
	from: string;
	to: string;
}
export const EMPTY_ACTIVITY_FILTERS: ActivityFilters = {
	actor: '',
	collection: '',
	action: '',
	from: '',
	to: ''
};
export type ActivityCursor = Pick<ActivityEntry, 'created' | 'id'>;

/** `id` desempata ascendente en ambos adaptadores; el puerto no admite ordenarlo explícitamente. */
export function activityQuery(filters: ActivityFilters, cursor?: ActivityCursor): Query {
	const nodes: FilterNode[] = [];
	const eq = (field: string, value: string): FilterNode => ({
		kind: 'cond',
		field,
		op: 'eq',
		value
	});
	if (filters.actor)
		nodes.push(eq(filters.actor === '_superusers' ? 'actorCollection' : 'actorId', filters.actor));
	if (filters.actor && filters.actor !== '_superusers' && filters.actorCollection)
		nodes.push(eq('actorCollection', filters.actorCollection));
	if (filters.collection) nodes.push(eq('collection', filters.collection));
	if (['create', 'update', 'delete'].includes(filters.action))
		nodes.push(eq('action', filters.action));
	if (/^\d{4}-\d{2}-\d{2}$/.test(filters.from))
		nodes.push({
			kind: 'cond',
			field: 'created',
			op: 'gte',
			value: `${filters.from}T00:00:00.000Z`
		});
	if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to))
		nodes.push({ kind: 'cond', field: 'created', op: 'lte', value: `${filters.to}T23:59:59.999Z` });
	if (cursor)
		nodes.push({
			kind: 'group',
			combinator: 'or',
			nodes: [
				{ kind: 'cond', field: 'created', op: 'lt', value: cursor.created },
				{
					kind: 'group',
					combinator: 'and',
					nodes: [
						eq('created', cursor.created),
						{ kind: 'cond', field: 'id', op: 'gt', value: cursor.id }
					]
				}
			]
		});
	return {
		page: 1,
		perPage: 50,
		sort: [{ field: 'created', dir: 'desc' }],
		...(nodes.length ? { filter: { kind: 'group', combinator: 'and', nodes } as FilterNode } : {})
	};
}
