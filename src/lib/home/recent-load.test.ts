import { describe, expect, test, vi } from 'vitest';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import { VegaError } from '$lib/backend/errors';
import { loadRecentRows } from './recent-load';
import type { RecentEdit } from './recent-edits';
import { model, type } from './fixture';

function page(items: VegaRecord[]): Page<VegaRecord> {
	return { items, page: 1, perPage: 30, totalItems: items.length, totalPages: 1 };
}

/** Puerto de mentira sobre `db`: `list` filtra por los ids pedidos; `get` da 404 si no está. */
function fakePort(db: Record<string, VegaRecord[]>) {
	return {
		list: vi.fn(async (collection: string, query?: Query) => {
			const filter = query?.filter;
			const ids = filter?.kind === 'cond' && filter.op === 'in' ? filter.value : [];
			return page((db[collection] ?? []).filter((record) => ids.includes(record.id)));
		}),
		get: vi.fn(async (collection: string, id: string) => {
			const found = (db[collection] ?? []).find((record) => record.id === id);
			if (!found) throw VegaError.notFound();
			return found;
		})
	};
}

const record = (collection: string, id: string, title = id): VegaRecord => ({
	id,
	type: collection,
	values: { title }
});

const edit = (collection: string, id: string, savedAt: number): RecentEdit => ({
	collection,
	id,
	savedAt
});

const MODEL = model([type('posts', { statusField: 'status' }), type('pages')]);

describe('loadRecentRows', () => {
	test('una list por colección filtrando por ids, y las filas por hora de guardado', async () => {
		const port = fakePort({
			posts: [record('posts', 'p1'), record('posts', 'p2')],
			pages: [record('pages', 'g1')]
		});

		const result = await loadRecentRows(port, MODEL, [
			edit('posts', 'p1', 30),
			edit('pages', 'g1', 20),
			edit('posts', 'p2', 10)
		]);

		expect(result.rows.map((row) => [row.type.name, row.record.id, row.savedAt])).toEqual([
			['posts', 'p1', 30],
			['pages', 'g1', 20],
			['posts', 'p2', 10]
		]);
		expect(result.gone).toEqual([]);
		expect(port.list).toHaveBeenCalledTimes(2);
		expect(port.list).toHaveBeenCalledWith('posts', {
			filter: { kind: 'cond', field: 'id', op: 'in', value: ['p1', 'p2'] },
			perPage: 2,
			fields: ['title', 'status']
		});
		expect(port.get).not.toHaveBeenCalled();
	});

	test('un registro borrado se cae de la lista y va a gone', async () => {
		const port = fakePort({ posts: [record('posts', 'p1')] });

		const result = await loadRecentRows(port, MODEL, [
			edit('posts', 'p1', 30),
			edit('posts', 'borrado', 20)
		]);

		expect(result.rows.map((row) => row.record.id)).toEqual(['p1']);
		expect(result.gone).toEqual([{ collection: 'posts', id: 'borrado' }]);
	});

	test('una colección que ya no está en el modelo, oculta o sin permiso: gone, sin consultarla', async () => {
		const port = fakePort({});
		const restricted = model([
			type('posts', { permissions: { list: false, view: true } }),
			type('secret', { hidden: true })
		]);

		const result = await loadRecentRows(port, restricted, [
			edit('posts', 'p1', 3),
			edit('secret', 's1', 2),
			edit('desaparecida', 'x1', 1)
		]);

		expect(result.rows).toEqual([]);
		expect(result.gone).toHaveLength(3);
		expect(port.list).not.toHaveBeenCalled();
	});

	test('la colección responde prohibido: sus registros van a gone y el resto se pinta', async () => {
		const port = fakePort({ pages: [record('pages', 'g1')] });
		port.list.mockImplementationOnce(async () => {
			throw VegaError.forbidden();
		});

		const result = await loadRecentRows(port, MODEL, [
			edit('posts', 'p1', 2),
			edit('pages', 'g1', 1)
		]);

		expect(result.rows.map((row) => row.record.id)).toEqual(['g1']);
		expect(result.gone).toEqual([{ collection: 'posts', id: 'p1' }]);
	});

	test('un fallo de red rechaza (la portada enseña su caja de error) y no declara nada borrado', async () => {
		const port = fakePort({});
		port.list.mockImplementation(async () => {
			throw VegaError.network();
		});

		await expect(loadRecentRows(port, MODEL, [edit('posts', 'p1', 1)])).rejects.toMatchObject({
			kind: 'network'
		});
	});

	test('un get que falla sin ser 404 no pinta la fila, pero tampoco la da por borrada', async () => {
		const port = fakePort({});
		port.get.mockImplementation(async () => {
			throw VegaError.backend('500');
		});

		const result = await loadRecentRows(port, MODEL, [edit('posts', 'p1', 1)]);

		expect(result).toEqual({ rows: [], gone: [] });
	});
});
