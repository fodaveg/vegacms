/**
 * Tests unitarios de `fetchAllPages` (§3 del contrato: iteración paginada + progreso +
 * cancelación, ver la cabecera de `export-collection.ts` y de este módulo). `list` es una función
 * de mentira: no hace falta ningún adaptador real para ejercitar la lógica de paginación.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { fetchAllPages } from './paginate';

/** Fábrica de un `list` de mentira sobre `allRecords`, paginando de verdad según `query.page`/
 *  `query.perPage` (igual que haría un adaptador real) — así los tests comprueban el CONTRATO de
 *  paginación (page/perPage correctos, se para en `totalPages`), no un mock que finge. */
function fakeList(allRecords: VegaRecord[]): (query: Query) => Promise<Page<VegaRecord>> {
	return async (query: Query) => {
		const page = query.page ?? 1;
		const perPage = query.perPage ?? MAX_PER_PAGE;
		const start = (page - 1) * perPage;
		const items = allRecords.slice(start, start + perPage);
		return {
			items,
			page,
			perPage,
			totalItems: allRecords.length,
			totalPages: Math.ceil(allRecords.length / perPage) || 0
		};
	};
}

function record(id: string): VegaRecord {
	return { id, type: 'posts', values: { title: id } };
}

describe('fetchAllPages', () => {
	it('una colección vacía hace UNA petición y devuelve records: []', async () => {
		const list = vi.fn(fakeList([]));
		const result = await fetchAllPages(list, undefined);
		expect(result).toEqual({ records: [], cancelled: false });
		expect(list).toHaveBeenCalledTimes(1);
	});

	it('agota todas las páginas hasta totalPages, siempre con perPage = MAX_PER_PAGE', async () => {
		const all = Array.from({ length: 450 }, (_, i) => record(`r${i}`));
		const list = vi.fn(fakeList(all));

		const result = await fetchAllPages(list, undefined);

		expect(result.cancelled).toBe(false);
		expect(result.records).toHaveLength(450);
		expect(result.records.map((r) => r.id)).toEqual(all.map((r) => r.id));
		// 450 registros / 200 por página = 3 peticiones (200 + 200 + 50).
		expect(list).toHaveBeenCalledTimes(3);
		for (const call of list.mock.calls) {
			expect(call[0].perPage).toBe(MAX_PER_PAGE);
		}
		expect(list.mock.calls.map((call) => call[0].page)).toEqual([1, 2, 3]);
	});

	it('propaga filter/sort de baseQuery en CADA página, sin tocar page/perPage del caller', async () => {
		const all = Array.from({ length: 250 }, (_, i) => record(`r${i}`));
		const list = vi.fn(fakeList(all));
		const baseQuery: Pick<Query, 'filter' | 'sort'> = {
			filter: { kind: 'cond', field: 'title', op: 'contains', value: 'r' },
			sort: [{ field: 'title', dir: 'asc' }]
		};

		await fetchAllPages(list, baseQuery);

		expect(list).toHaveBeenCalledTimes(2);
		for (const call of list.mock.calls) {
			expect(call[0].filter).toBe(baseQuery.filter);
			expect(call[0].sort).toBe(baseQuery.sort);
		}
	});

	it('onProgress se llama tras cada página con (fetched acumulado, total real)', async () => {
		const all = Array.from({ length: 250 }, (_, i) => record(`r${i}`));
		const list = fakeList(all);
		const onProgress = vi.fn();

		await fetchAllPages(list, undefined, { onProgress });

		expect(onProgress).toHaveBeenCalledTimes(2);
		expect(onProgress).toHaveBeenNthCalledWith(1, 200, 250);
		expect(onProgress).toHaveBeenNthCalledWith(2, 250, 250);
	});

	it('isCancelled() se comprueba ANTES de cada página: cancelar tras la primera para la segunda', async () => {
		const all = Array.from({ length: 450 }, (_, i) => record(`r${i}`));
		const list = vi.fn(fakeList(all));
		let cancelAfterFirst = false;
		const isCancelled = vi.fn(() => cancelAfterFirst);

		const result = await fetchAllPages(list, undefined, {
			isCancelled,
			onProgress: () => {
				cancelAfterFirst = true; // se pide cancelar justo tras completar la primera página
			}
		});

		expect(result.cancelled).toBe(true);
		expect(result.records).toHaveLength(200); // solo la primera página, la segunda nunca se pidió
		expect(list).toHaveBeenCalledTimes(1);
	});

	it('cancelado ANTES de la primera petición: ni una sola llamada a list, records vacío', async () => {
		const list = vi.fn(fakeList([record('r0')]));
		const result = await fetchAllPages(list, undefined, { isCancelled: () => true });

		expect(result).toEqual({ records: [], cancelled: true });
		expect(list).not.toHaveBeenCalled();
	});
});
