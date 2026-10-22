import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { activityQuery, EMPTY_ACTIVITY_FILTERS } from './activity-query';
import { hasActivityCollection, parseActivity, type ActivityEntry } from './activity-collection';
import { ACTIVITY_DEMO_TYPE, activityDemoRecords } from './activity-demo';
import { activityVerb, groupActivity } from './activity-groups';
import { resolveActivityTargets, targetKey } from './activity-links';
import { VEGA_REVISIONS_COLLECTION } from '$lib/revisions/revisions-collection';
import { DEMO_SEED } from '$lib/session/demo-seed';
import type { VegaRecord } from '$lib/backend';

const entry = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
	id: 'a',
	action: 'update',
	collection: 'posts',
	recordId: 'post_1',
	label: 'Viejo',
	actorId: 'ana',
	actorCollection: 'editors',
	actorEmail: 'ana@vega.test',
	changes: [],
	created: '2026-10-22T12:00:00.000Z',
	...overrides
});
const model = resolveContentModel({
	types: DEMO_SEED.contentTypes,
	manifestRaw: { collections: { posts: { orderField: 'priority' } } }
});
const postType = model.types.find((type) => type.name === 'posts')!;

describe('forma y lectura hostil', () => {
	test('solo esquema completo, tipos y reglas cerradas', () => {
		expect(hasActivityCollection([ACTIVITY_DEMO_TYPE])).toBe(true);
		expect(hasActivityCollection([])).toBe(false);
		expect(hasActivityCollection([{ ...ACTIVITY_DEMO_TYPE, access: undefined }])).toBe(false);
		expect(
			hasActivityCollection([{ ...ACTIVITY_DEMO_TYPE, fields: ACTIVITY_DEMO_TYPE.fields.slice(1) }])
		).toBe(false);
		expect(
			hasActivityCollection([
				{ ...ACTIVITY_DEMO_TYPE, access: { ...ACTIVITY_DEMO_TYPE.access!, list: 'allowed' } }
			])
		).toBe(false);
	});
	test('rechaza acción y fecha desconocidas; acota cambios', () => {
		const row: VegaRecord = {
			id: 'a',
			type: 'vega_activity',
			values: activityDemoRecords()[0].values
		};
		expect(parseActivity(row)?.action).toBe('update');
		expect(parseActivity({ ...row, values: { ...row.values, action: 'surprise' } })).toBeNull();
		expect(parseActivity({ ...row, values: { ...row.values, created: 'nunca' } })).toBeNull();
		expect(
			parseActivity({
				...row,
				values: { ...row.values, changes: [{ field: 'title', to: { secret: 1 } }, null] }
			})?.changes
		).toEqual([{ field: 'title' }]);
	});
});

describe('frases y agrupado', () => {
	test('publicación, retirada, reordenado y medios', () => {
		expect(
			activityVerb(
				entry({ changes: [{ field: 'status', from: 'draft', to: 'published' }] }),
				postType
			)
		).toBe('published');
		expect(
			activityVerb(
				entry({ changes: [{ field: 'status', from: 'published', to: 'draft' }] }),
				postType
			)
		).toBe('unpublished');
		expect(
			activityVerb(entry({ changes: [{ field: 'priority' }] }), {
				...postType,
				orderField: 'priority'
			})
		).toBe('reordered');
		expect(activityVerb(entry({ action: 'create', collection: 'vega_media' }))).toBe('uploaded');
		expect(activityVerb(entry({ action: 'delete' }))).toBe('deleted');
	});
	test('guardados seguidos menores a diez minutos; identidad incluye colección auth', () => {
		expect(
			groupActivity([entry(), entry({ id: 'b', created: '2026-10-22T11:51:00.000Z' })])[0].kind
		).toBe('saves');
		expect(
			groupActivity([entry(), entry({ id: 'b', created: '2026-10-22T11:50:00.000Z' })])
		).toHaveLength(2);
		expect(
			groupActivity([entry(), entry({ id: 'b', actorCollection: 'other_auth' })])
		).toHaveLength(2);
		expect(groupActivity([entry(), entry({ id: 'b', action: 'delete' })])).toHaveLength(2);
	});
	test('plegado de más de tres rachas, conserva todas las filas', () => {
		const rows = [1, 2, 3, 4].map((n) =>
			entry({ id: String(n), recordId: String(n), action: 'create' })
		);
		expect(groupActivity(rows)).toEqual([{ kind: 'bulk', entries: rows }]);
		expect(groupActivity(rows.slice(0, 3))).toHaveLength(3);
	});
});

describe('consulta y cursor', () => {
	test('50 filas y solo columnas reales; superusuarios separado del id de actor', () => {
		const query = activityQuery({
			...EMPTY_ACTIVITY_FILTERS,
			actor: '_superusers',
			action: 'delete',
			collection: 'posts',
			from: '2026-10-01',
			to: '2026-10-22'
		});
		expect(query.perPage).toBe(50);
		expect(JSON.stringify(query.filter)).toContain('actorCollection');
		expect(JSON.stringify(query.filter)).toContain('2026-10-22T23:59:59.999Z');
	});
	test('cursor compuesto no repite ni salta fechas iguales al entrar una fila nueva', async () => {
		const records = Array.from({ length: 110 }, (_, i) => ({
			id: `row${String(i).padStart(3, '0')}`,
			values: {
				...activityDemoRecords()[0].values,
				created: i < 60 ? '2026-10-22T12:00:00.000Z' : '2026-10-21T12:00:00.000Z'
			}
		}));
		const port = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'x' }],
			contentTypes: [ACTIVITY_DEMO_TYPE],
			records: { vega_activity: records }
		});
		await port.login({ email: 'admin@vega.test', password: 'x' });
		const first = await port.list('vega_activity', activityQuery(EMPTY_ACTIVITY_FILTERS));
		await port.create(
			'vega_activity',
			Object.fromEntries(
				Object.entries(activityDemoRecords()[0].values).filter(([key]) => key !== 'created')
			)
		);
		const last = first.items.at(-1)!;
		const second = await port.list(
			'vega_activity',
			activityQuery(EMPTY_ACTIVITY_FILTERS, { id: last.id, created: String(last.values.created) })
		);
		expect(second.items[0].id).toBe('row050');
		expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(100);
	});
});

describe('enlaces', () => {
	test('título vivo, consulta id-in agrupada y etiqueta borrada sin copia', async () => {
		const port = createMemoryBackend(DEMO_SEED);
		await port.login({ email: 'demo@vega.dev', password: 'vega-demo' });
		const list = vi.spyOn(port, 'list');
		const rows = [
			entry(),
			entry({ id: 'b', action: 'delete', recordId: 'gone', label: 'Eliminada' })
		];
		const targets = await resolveActivityTargets(port, model, rows);
		expect(targets[targetKey(rows[0])].label).toBe('Bienvenido a Vega');
		expect(targets[targetKey(rows[0])].href).toBe('/c/posts/post_1');
		expect(targets[targetKey(rows[1])]).toEqual({
			label: 'Eliminada',
			href: null,
			missing: true,
			copied: false
		});
		expect(list).toHaveBeenCalledTimes(1);
		expect(list.mock.calls[0][1]?.filter).toEqual({
			kind: 'cond',
			field: 'id',
			op: 'in',
			value: ['post_1', 'gone']
		});
	});
	test('busca copias más allá de 200 revisiones sin afirmar ausencias falsas', async () => {
		const port = createMemoryBackend(DEMO_SEED);
		await port.login({ email: 'demo@vega.dev', password: 'vega-demo' });
		await port.ensureCollections([VEGA_REVISIONS_COLLECTION]);
		for (let i = 0; i < 201; i++)
			await port.create(
				'vega_revisions',
				{
					collection: 'posts',
					recordId: i < 200 ? 'gone1' : 'gone2',
					kind: 'delete',
					values: {},
					label: 'Borrado'
				},
				{ id: `rev${String(i).padStart(4, '0')}` }
			);
		const currentModel = resolveContentModel({
			types: await port.listContentTypes(),
			manifestRaw: null
		});
		const rows = [entry({ recordId: 'gone1' }), entry({ id: 'b', recordId: 'gone2' })];
		const targets = await resolveActivityTargets(port, currentModel, rows);
		expect(targets[targetKey(rows[0])].copied).toBe(true);
		expect(targets[targetKey(rows[1])].href).toBe('/papelera');
	});
});
