/** Datos fijos del escaparate; no simulan que memory ejecuta hooks de servidor. */
import type { ContentType, Field } from '$lib/backend/types';
import { ACTIVITY_COLLECTION, ACTIVITY_FIELDS } from './activity-collection';

export const ACTIVITY_DEMO_TYPE: ContentType = {
	name: ACTIVITY_COLLECTION,
	readonly: false,
	access: { list: 'denied', view: 'denied', create: 'denied', update: 'denied', delete: 'denied' },
	fields: ACTIVITY_FIELDS.map((name): Field => {
		const base = {
			name,
			required: ['action', 'collection', 'recordId', 'actorId', 'actorCollection'].includes(name),
			readonly: name === 'created',
			presentable: false,
			hidden: false,
			unique: false
		};
		return name === 'created'
			? { ...base, type: 'date' }
			: name === 'changes'
				? { ...base, type: 'json' }
				: { ...base, type: 'text', subtype: 'plain' };
	})
};

export function activityDemoRecords(collection = 'posts', id = 'post_1') {
	return [
		{
			id: 'activity_01',
			values: {
				action: 'update',
				collection,
				recordId: id,
				label: 'Título anterior',
				actorId: 'editor_ana',
				actorCollection: 'vega_editors',
				actorEmail: 'ana.ruiz@fodaveg.net',
				changes: [{ field: 'status', from: 'draft', to: 'published' }],
				created: '2026-10-22T11:20:00.000Z'
			}
		},
		{
			id: 'activity_02',
			values: {
				action: 'update',
				collection,
				recordId: id,
				label: 'Título anterior',
				actorId: 'editor_ana',
				actorCollection: 'vega_editors',
				actorEmail: 'ana.ruiz@fodaveg.net',
				changes: [{ field: 'title' }],
				created: '2026-10-22T11:16:00.000Z'
			}
		},
		{
			id: 'activity_03',
			values: {
				action: 'delete',
				collection,
				recordId: 'deleted_demo',
				label: 'Una entrada retirada',
				actorId: 'editor_jorge',
				actorCollection: 'vega_editors',
				actorEmail: 'jorge.p@fodaveg.net',
				changes: [],
				created: '2026-10-22T10:00:00.000Z'
			}
		},
		...[1, 2, 3, 4].map((n) => ({
			id: `activity_bulk_${n}`,
			values: {
				action: 'create',
				collection,
				recordId: `imported_${n}`,
				label: `Entrada importada ${n}`,
				actorId: 'demo_superuser',
				actorCollection: '_superusers',
				actorEmail: 'demo@vega.dev',
				changes: [],
				created: '2026-10-21T09:00:00.000Z'
			}
		}))
	];
}
