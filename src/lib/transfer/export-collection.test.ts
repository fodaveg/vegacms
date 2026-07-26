/**
 * Tests unitarios de `exportCollection` (§3 del contrato, ver la cabecera de
 * `export-collection.ts`): scope `'all'` vs `'filtered'` (reutiliza `buildListQuery`, la MISMA
 * query que el listado), serialización de cada página descargada y propagación de la
 * cancelación. El "puerto" es un doble mínimo (`Pick<BackendPort, 'list' | 'fileUrl'>`, ver la
 * firma de `exportCollection`) — nada de adaptadores reales.
 */

import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { Field, Page, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import type { ResolvedContentType } from '$lib/model/types';
import type { ViewState } from '$lib/list/query-state';
import { exportCollection } from './export-collection';

function field(overrides: Partial<Field> & Pick<Field, 'name' | 'type'>): Field {
	return {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	} as Field;
}

/** `ResolvedContentType` mínimo: `exportCollection`/`buildListQuery` solo miran `schema`, `name`,
 *  `titleField`/`listFields`/`statusField` (para la búsqueda) y `defaultSort`/`orderField`. */
function contentType(
	fields: Field[],
	overrides: Partial<ResolvedContentType> = {}
): ResolvedContentType {
	return {
		schema: { name: 'posts', readonly: false, fields },
		name: 'posts',
		label: 'Posts',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: 'title',
		subtitleField: null,
		slugField: null,
		statusField: null,
		statusLabels: null,
		orderField: null,
		defaultSort: null,
		previewUrl: null,
		fields: [],
		listFields: ['title'],
		fieldGroups: [],
		editorRail: false,
		...overrides
	};
}

const emptyViewState: ViewState = { q: '', sort: null, status: null, page: 1 };

function record(id: string, title: string): VegaRecord {
	return { id, type: 'posts', values: { id, title } };
}

/** Doble mínimo de puerto: `list` pagina de verdad sobre `allRecords` (mismo criterio que
 *  `paginate.test.ts`), `fileUrl` es determinista para poder afirmar sobre ella. */
function fakePort(allRecords: VegaRecord[]) {
	const listCalls: Query[] = [];
	return {
		listCalls,
		port: {
			list: async (_type: string, query: Query = {}): Promise<Page<VegaRecord>> => {
				listCalls.push(query);
				const page = query.page ?? 1;
				const perPage = query.perPage ?? 30;
				const filtered = query.filter
					? allRecords.filter((r) =>
							String(r.values.title).includes(
								String((query.filter as { value?: unknown }).value ?? '')
							)
						)
					: allRecords;
				const start = (page - 1) * perPage;
				return {
					items: filtered.slice(start, start + perPage),
					page,
					perPage,
					totalItems: filtered.length,
					totalPages: Math.ceil(filtered.length / perPage) || 0
				};
			},
			fileUrl: (rec: Pick<VegaRecord, 'type' | 'id'>, f: string, file: string) =>
				`https://origin.test/${rec.type}/${rec.id}/${f}/${file}`
		}
	};
}

describe('exportCollection', () => {
	it('scope "all": ignora viewState.q por completo, exporta la colección entera serializada', async () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const { port, listCalls } = fakePort([record('r1', 'Uno'), record('r2', 'Dos')]);
		const viewStateWithSearch: ViewState = { q: 'Uno', sort: null, status: null, page: 1 };

		const result = await exportCollection(port, type, 'all', viewStateWithSearch);

		expect(result.cancelled).toBe(false);
		expect(result.collection.type).toBe('posts');
		expect(result.collection.records).toEqual([
			{ id: 'r1', values: { id: 'r1', title: 'Uno' } },
			{ id: 'r2', values: { id: 'r2', title: 'Dos' } }
		]);
		// Ninguna llamada a `list` llevó `filter`: scope "all" no aplica ni siquiera un q activo.
		expect(listCalls.every((q) => q.filter === undefined)).toBe(true);
	});

	it('scope "filtered": aplica la MISMA query que el listado (buildListQuery) sobre viewState.q', async () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const { port, listCalls } = fakePort([record('r1', 'Uno'), record('r2', 'Dos')]);
		const viewState: ViewState = { q: 'Uno', sort: null, status: null, page: 1 };

		const result = await exportCollection(port, type, 'filtered', viewState);

		expect(result.collection.records).toEqual([{ id: 'r1', values: { id: 'r1', title: 'Uno' } }]);
		expect(listCalls.every((q) => q.filter !== undefined)).toBe(true);
	});

	it('enriquece los campos file con la URL de origen del registro correcto (no una fija)', async () => {
		const type = contentType([
			field({ name: 'title', type: 'text', subtype: 'plain' }),
			field({ name: 'cover', type: 'file', multiple: false })
		]);
		const r1: VegaRecord = { id: 'r1', type: 'posts', values: { title: 'Uno', cover: 'a.jpg' } };
		const r2: VegaRecord = { id: 'r2', type: 'posts', values: { title: 'Dos', cover: 'b.jpg' } };
		const { port } = fakePort([r1, r2]);

		const result = await exportCollection(port, type, 'all', emptyViewState);

		expect(result.collection.records[0].values.cover).toEqual({
			file: 'a.jpg',
			url: 'https://origin.test/posts/r1/cover/a.jpg'
		});
		expect(result.collection.records[1].values.cover).toEqual({
			file: 'b.jpg',
			url: 'https://origin.test/posts/r2/cover/b.jpg'
		});
	});

	it('propaga la cancelación de fetchAllPages (records descartables por el llamador)', async () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const many = Array.from({ length: 5 }, (_, i) => record(`r${i}`, `Título ${i}`));
		const { port } = fakePort(many);

		const result = await exportCollection(port, type, 'all', emptyViewState, {
			isCancelled: () => true
		});

		expect(result.cancelled).toBe(true);
		expect(result.collection.records).toEqual([]);
	});
});
