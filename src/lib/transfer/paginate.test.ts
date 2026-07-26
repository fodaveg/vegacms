/**
 * Tests unitarios de `fetchAllPages` (§3 del contrato: paginación por CURSOR de `id` + progreso +
 * cancelación, ver la cabecera de `export-collection.ts` y de este módulo). `list` es una función
 * de mentira: no hace falta ningún adaptador real para ejercitar la lógica de paginación.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { FilterNode, Query } from '$lib/backend/query';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { fetchAllPages } from './paginate';

function record(id: string): VegaRecord {
	return { id, type: 'posts', values: { title: id } };
}

/** Extrae el cursor `id > X` de `query.filter`: un `cond` directo (primera página sin scope), o
 *  dentro del grupo `and` que arma `withCursor` al combinarlo con un `filter` de scope (ver
 *  `paginate.ts`). `null` si no hay cursor (primera página). */
function extractCursor(filter: FilterNode | undefined): string | null {
	if (!filter) return null;
	if (filter.kind === 'cond' && filter.field === 'id' && filter.op === 'gt') {
		return filter.value as string;
	}
	if (filter.kind === 'group') {
		for (const node of filter.nodes) {
			const found = extractCursor(node);
			if (found !== null) return found;
		}
	}
	return null;
}

/**
 * `list` de mentira KEYSET sobre `getRecords()` (una función, no un array fijo — para que un test
 * pueda MUTAR la colección entre llamadas, el escenario que demuestra la inmunidad del cursor a
 * los borrados). Ordena SIEMPRE por `id` ascendente (mismo criterio que garantizan `memory`/
 * `pocketbase` cuando no se pide `sort` explícito, ver la cabecera de `paginate.ts`), filtra por
 * el cursor si lo hay y trocea a `perPage` — un `page` en la query sería un bug de `fetchAllPages`
 * (la paginación por cursor nunca lo necesita), así que ni se mira.
 */
function keysetFakeList(
	getRecords: () => VegaRecord[]
): (query: Query) => Promise<Page<VegaRecord>> {
	return async (query: Query) => {
		const cursor = extractCursor(query.filter);
		const sorted = getRecords()
			.slice()
			.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		const remaining = cursor === null ? sorted : sorted.filter((r) => r.id > cursor);
		const perPage = query.perPage ?? MAX_PER_PAGE;
		const items = remaining.slice(0, perPage);
		return {
			items,
			page: 1,
			perPage,
			totalItems: remaining.length,
			totalPages: Math.ceil(remaining.length / perPage) || 0
		};
	};
}

function ids(n: number): string[] {
	return Array.from({ length: n }, (_, i) => `r${String(i).padStart(4, '0')}`);
}

function records(n: number): VegaRecord[] {
	return ids(n).map(record);
}

describe('fetchAllPages (cursor de id)', () => {
	it('una colección vacía hace UNA petición y devuelve records: []', async () => {
		const list = vi.fn(keysetFakeList(() => []));
		const result = await fetchAllPages(list, undefined);
		expect(result).toEqual({ records: [], cancelled: false });
		expect(list).toHaveBeenCalledTimes(1);
	});

	it('agota todas las páginas hasta que una vuelve corta, siempre con perPage = MAX_PER_PAGE y SIN `page`', async () => {
		const all = records(450);
		const list = vi.fn(keysetFakeList(() => all));

		const result = await fetchAllPages(list, undefined);

		expect(result.cancelled).toBe(false);
		expect(result.records).toHaveLength(450);
		expect(result.records.map((r) => r.id)).toEqual(all.map((r) => r.id));
		// 450 = 200 + 200 + 50 (corta): 3 peticiones. Ninguna lleva `page`.
		expect(list).toHaveBeenCalledTimes(3);
		for (const call of list.mock.calls) {
			expect(call[0].perPage).toBe(MAX_PER_PAGE);
			expect(call[0].page).toBeUndefined();
		}
	});

	it('cada petición usa `id > <id del último registro de la página anterior>`', async () => {
		const all = records(250);
		const list = vi.fn(keysetFakeList(() => all));

		await fetchAllPages(list, undefined);

		expect(list).toHaveBeenCalledTimes(2);
		expect(list.mock.calls[0][0].filter).toBeUndefined();
		expect(list.mock.calls[1][0].filter).toEqual({
			kind: 'cond',
			field: 'id',
			op: 'gt',
			value: all[199].id
		});
	});

	it('propaga el filter de baseQuery, combinado en AND con el cursor desde la 2ª página', async () => {
		const all = records(250);
		const list = vi.fn(keysetFakeList(() => all));
		const baseQuery = {
			filter: { kind: 'cond', field: 'title', op: 'contains', value: 'r' } as FilterNode
		};

		await fetchAllPages(list, baseQuery);

		expect(list).toHaveBeenCalledTimes(2);
		expect(list.mock.calls[0][0].filter).toBe(baseQuery.filter);
		expect(list.mock.calls[1][0].filter).toEqual({
			kind: 'group',
			combinator: 'and',
			nodes: [baseQuery.filter, { kind: 'cond', field: 'id', op: 'gt', value: all[199].id }]
		});
	});

	it('onProgress reporta el total FIJO de la primera respuesta, no el "restante" que se achica con el cursor', async () => {
		const all = records(250);
		const list = keysetFakeList(() => all);
		const onProgress = vi.fn();

		await fetchAllPages(list, undefined, { onProgress });

		expect(onProgress).toHaveBeenCalledTimes(2);
		expect(onProgress).toHaveBeenNthCalledWith(1, 200, 250);
		expect(onProgress).toHaveBeenNthCalledWith(2, 250, 250); // NO 50: el total no "encoge"
	});

	it('isCancelled() se comprueba ANTES de cada página: cancelar tras la primera para la segunda', async () => {
		const all = records(450);
		const list = vi.fn(keysetFakeList(() => all));
		let cancelAfterFirst = false;

		const result = await fetchAllPages(list, undefined, {
			isCancelled: () => cancelAfterFirst,
			onProgress: () => {
				cancelAfterFirst = true; // se pide cancelar justo tras completar la primera página
			}
		});

		expect(result.cancelled).toBe(true);
		expect(result.records).toHaveLength(200); // solo la primera página, la segunda nunca se pidió
		expect(list).toHaveBeenCalledTimes(1);
	});

	it('cancelado ANTES de la primera petición: ni una sola llamada a list, records vacío', async () => {
		const list = vi.fn(keysetFakeList(() => [record('r0000')]));
		const result = await fetchAllPages(list, undefined, { isCancelled: () => true });

		expect(result).toEqual({ records: [], cancelled: true });
		expect(list).not.toHaveBeenCalled();
	});

	/**
	 * El test que demuestra el fix (§3 del contrato, hallazgo de code-review): un registro YA
	 * entregado (dentro de la ventana de la primera página) se borra entre página y página.
	 *
	 * Bajo la paginación por OFFSET que tenía la primera entrega, esto habría sido letal: al pedir
	 * "página 2" (`skip 200, take 200`) sobre una colección que ya tiene un registro menos, TODO
	 * lo que estaba por delante del hueco se desplaza una posición — el registro `r0200` (que
	 * antes del borrado ocupaba la posición 200, el primero de la página 2) pasa a ocupar la
	 * posición 199, DENTRO de la página 1 que ya se pidió y ya devolvió su versión anterior de esa
	 * posición. La página 2, pedida DESPUÉS del borrado, arranca en la posición 200 del array YA
	 * desplazado — que ahora es `r0201` — así que `r0200` no se pide NUNCA. Se pierde en silencio.
	 *
	 * Bajo el cursor de `id` (esta implementación), el borrado de `r0050` es irrelevante para la
	 * segunda petición: sigue siendo `id > r0199` exactamente igual, ajena a cualquier cosa que
	 * pase por debajo de ese valor. Nada se pierde.
	 */
	it('un borrado de un registro YA entregado no descoloca las páginas siguientes (el bug que tenía el offset)', async () => {
		const all = records(250);
		const list = keysetFakeList(() => all);

		const result = await fetchAllPages(list, undefined, {
			onProgress: (fetched) => {
				if (fetched === 200) {
					const idx = all.findIndex((r) => r.id === 'r0050');
					all.splice(idx, 1); // borrado "por delante" en el sentido de offset: ya se leyó
				}
			}
		});

		// r0050 ya se había capturado en la página 1 ANTES de borrarse: sigue en el resultado (es
		// un snapshot al momento de leerlo, comportamiento esperado, no una fuga).
		const resultIds = result.records.map((r) => r.id);
		expect(resultIds).toHaveLength(250);
		expect(new Set(resultIds).size).toBe(250); // sin duplicados
		expect(resultIds).toContain('r0050');
		// La prueba real: r0200, que el offset habría perdido para siempre, SÍ aparece — de hecho
		// el resultado es la secuencia completa 0..249, sin ningún hueco.
		expect(resultIds).toContain('r0200');
		expect(resultIds).toEqual(ids(250));
	});
});
