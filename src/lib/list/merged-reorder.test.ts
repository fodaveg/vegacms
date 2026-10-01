/**
 * Tests de `planMergedReorder` (reordenado de `/v/[view]`): cuántas filas se escriben al mover una
 * fila, comparado con la renumeración completa de `computeReorder` que usaba `/v` antes de
 * delegar en `computeSpanReorder`. Las filas salen de `mergeViewResults`, igual que en la ruta.
 */

import { describe, expect, test, vi } from 'vitest';
import { mergeViewResults, type MergedRow } from './merged-merge';
import { persistMergedReorder, planMergedReorder } from './merged-reorder';
import { computeReorder } from './reorder';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { VEGA_REVISIONS_COLLECTION } from '$lib/revisions/revisions-collection';
import { withRevisions } from '$lib/revisions/with-revisions';
import type { ResolvedMergedSource, ResolvedMergedView } from '$lib/model/types';
import type { Field, VegaRecord } from '$lib/backend/types';

function makeSource(collection: string, orderField = 'sort'): ResolvedMergedSource {
	return { collection, where: null, orderField, titleField: 'title', label: collection };
}

function makeView(sources: ResolvedMergedSource[]): ResolvedMergedView {
	return { id: 'v', label: 'V', icon: null, group: null, order: 0, sources };
}

function rec(type: string, id: string, values: VegaRecord['values']): VegaRecord {
	return { id, type, values };
}

/** Una sola colección con `values[i]` como valor de orden de la fila `r{i}`. */
function singleSource(values: number[]): MergedRow[] {
	const items = values.map((value, i) => rec('arte', `r${i}`, { sort: value }));
	return mergeViewResults(makeView([makeSource('arte')]), [items]);
}

/** El «antes»: lo que hacía `/v` (renumeración completa vía `computeReorder`). */
function legacyCount(rows: MergedRow[], from: number, to: number): number {
	const keys = rows.map((r) => `${r.record.type}:${r.record.id}`);
	const values: Record<string, number> = {};
	rows.forEach((r, i) => (values[keys[i]] = r.orderValue));
	return computeReorder(keys, values, from, to).length;
}

const contiguous = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('planMergedReorder', () => {
	test('mover una posición (lista contigua de 10): 2 escrituras, antes 2', () => {
		const rows = singleSource(contiguous(10));
		expect(planMergedReorder(rows, 4, 5)).toHaveLength(2);
		expect(legacyCount(rows, 4, 5)).toBe(2);
	});

	test('mover varias posiciones (lista contigua de 10, 2 → 6): 5 escrituras, antes 5', () => {
		const rows = singleSource(contiguous(10));
		expect(planMergedReorder(rows, 2, 6)).toHaveLength(5);
		expect(legacyCount(rows, 2, 6)).toBe(5);
	});

	test('valores con huecos (10, 20, 30…): solo el tramo, antes casi toda la lista', () => {
		const rows = singleSource(Array.from({ length: 10 }, (_, i) => (i + 1) * 10));
		const writes = planMergedReorder(rows, 4, 5);
		expect(writes).toEqual([
			{ collection: 'arte', id: 'r5', field: 'sort', value: 50 },
			{ collection: 'arte', id: 'r4', field: 'sort', value: 60 }
		]);
		expect(legacyCount(rows, 4, 5)).toBe(10 - 0); // renumera a 0..9: ninguna coincide
	});

	test('mover al principio y al final con huecos: solo el tramo', () => {
		const rows = singleSource(Array.from({ length: 10 }, (_, i) => (i + 1) * 10));
		expect(planMergedReorder(rows, 9, 0)).toHaveLength(10);
		expect(planMergedReorder(rows, 0, 9)).toHaveLength(10);
		// Un tramo corto en los extremos escribe solo ese tramo.
		expect(planMergedReorder(rows, 1, 0)).toHaveLength(2);
		expect(planMergedReorder(rows, 8, 9)).toHaveLength(2);
		expect(legacyCount(rows, 1, 0)).toBe(10);
	});

	test('valores repetidos (todos a 0): normaliza una vez, igual que antes', () => {
		const rows = singleSource([0, 0, 0, 0, 0, 0]);
		const writes = planMergedReorder(rows, 4, 5);
		expect(writes).toHaveLength(legacyCount(rows, 4, 5));
		// Tras normalizar, la lista queda estrictamente creciente en el orden nuevo.
		expect(writes.length).toBeGreaterThan(2);
	});

	test('no-op e índices fuera de rango: sin escrituras', () => {
		const rows = singleSource(contiguous(4));
		expect(planMergedReorder(rows, 2, 2)).toEqual([]);
		expect(planMergedReorder(rows, -1, 2)).toEqual([]);
		expect(planMergedReorder(rows, 0, 4)).toEqual([]);
	});

	test('dos colecciones con orderField distinto y valores globales crecientes: cada escritura va a su colección y campo', () => {
		// Orden global: a0(1) m0(2) a1(3) m1(4) — ya normalizado por un reorder previo.
		const view = makeView([makeSource('arte', 'sort'), makeSource('music', 'pos')]);
		const rows = mergeViewResults(view, [
			[rec('arte', 'a0', { sort: 1 }), rec('arte', 'a1', { sort: 3 })],
			[rec('music', 'm0', { pos: 2 }), rec('music', 'm1', { pos: 4 })]
		]);
		expect(rows.map((r) => r.record.id)).toEqual(['a0', 'm0', 'a1', 'm1']);
		// Mover m0 (1) tras a1 (2): se redistribuyen los valores 2 y 3.
		const writes = planMergedReorder(rows, 1, 2);
		expect(writes).toEqual([
			{ collection: 'arte', id: 'a1', field: 'sort', value: 2 },
			{ collection: 'music', id: 'm0', field: 'pos', value: 3 }
		]);
		// Antes: 1,2,3,4 → 0,1,2,3 con m0 ya en 2 (índice 2): cambian a0, a1 y m1, no m0 → 3.
		expect(legacyCount(rows, 1, 2)).toBe(3);
	});

	test('dos colecciones arrancando cada una en 0,1: empates, normaliza con índice global', () => {
		const view = makeView([makeSource('arte'), makeSource('music')]);
		const rows = mergeViewResults(view, [
			[rec('arte', 'a0', { sort: 0 }), rec('arte', 'a1', { sort: 1 })],
			[rec('music', 'm0', { sort: 0 }), rec('music', 'm1', { sort: 1 })]
		]);
		const writes = planMergedReorder(rows, 0, 3);
		expect(writes).toHaveLength(legacyCount(rows, 0, 3));
		expect(new Set(writes.map((w) => w.value)).size).toBe(writes.length);
	});
});

/**
 * Orden FINAL: aplica las escrituras a los registros de origen y vuelve a fusionar con
 * `mergeViewResults` (el mismo orden `(orderValue, type, id)` que pinta la vista tras recargar).
 */
function applyWrites(
	view: ResolvedMergedView,
	itemsBySource: VegaRecord[][],
	writes: ReturnType<typeof planMergedReorder>
): string[] {
	const next = itemsBySource.map((items) =>
		items.map((r) => {
			const w = writes.find((x) => x.collection === r.type && x.id === r.id);
			return w ? { ...r, values: { ...r.values, [w.field]: w.value } } : r;
		})
	);
	return mergeViewResults(view, next).map((r) => `${r.record.type}:${r.record.id}`);
}

describe('planMergedReorder — orden final tras aplicar las escrituras', () => {
	const view = makeView([makeSource('arte', 'sort'), makeSource('music', 'pos')]);
	const fixtures: Record<string, [VegaRecord[], VegaRecord[]]> = {
		'empates entre fuentes (cada una en 0,1,2)': [
			[0, 1, 2].map((n) => rec('arte', `a${n}`, { sort: n })),
			[0, 1, 2].map((n) => rec('music', `m${n}`, { pos: n }))
		],
		'valores repetidos (todo a 0) y campo ausente': [
			[rec('arte', 'a0', { sort: 0 }), rec('arte', 'a1', { sort: 0 }), rec('arte', 'a2', {})],
			[rec('music', 'm0', { pos: 0 }), rec('music', 'm1', { pos: 0 })]
		],
		'globalmente crecientes con huecos': [
			[
				rec('arte', 'a0', { sort: 10 }),
				rec('arte', 'a1', { sort: 30 }),
				rec('arte', 'a2', { sort: 50 })
			],
			[rec('music', 'm0', { pos: 20 }), rec('music', 'm1', { pos: 40 })]
		],
		'desordenados y con negativos': [
			[
				rec('arte', 'a0', { sort: 5 }),
				rec('arte', 'a1', { sort: -3 }),
				rec('arte', 'a2', { sort: 5 })
			],
			[rec('music', 'm0', { pos: 2 }), rec('music', 'm1', { pos: 5 })]
		]
	};

	for (const [name, items] of Object.entries(fixtures)) {
		test(`${name}: todo par (from, to) deja la fila donde el usuario la soltó`, () => {
			const rows = mergeViewResults(view, items);
			const keys = rows.map((r) => `${r.record.type}:${r.record.id}`);
			for (let from = 0; from < keys.length; from++) {
				for (let to = 0; to < keys.length; to++) {
					if (from === to) continue;
					const expected = [...keys];
					expected.splice(to, 0, expected.splice(from, 1)[0]);
					const writes = planMergedReorder(rows, from, to);
					expect(applyWrites(view, items, writes), `${from} → ${to}`).toEqual(expected);
				}
			}
		});
	}
});

describe('persistMergedReorder', () => {
	const number = (name: string): Field => ({
		name,
		type: 'number',
		integer: true,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	});

	async function seeded(
		contentTypes: { name: string; field: string }[],
		records: Record<string, { id: string; values: Record<string, number> }[]>
	) {
		const inner = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'pw' }],
			contentTypes: contentTypes.map((t) => ({
				name: t.name,
				readonly: false,
				fields: [number(t.field)]
			})),
			records
		});
		await inner.login({ email: 'admin@vega.test', password: 'pw' });
		await inner.ensureCollections([VEGA_REVISIONS_COLLECTION]);
		return inner;
	}

	test('cada update lleva orderOnlyField y, tras withRevisions real, no deja ninguna revisión', async () => {
		const inner = await seeded(
			[
				{ name: 'arte', field: 'sort' },
				{ name: 'music', field: 'pos' }
			],
			{
				arte: [{ id: 'a0', values: { sort: 1 } }],
				music: [{ id: 'm0', values: { pos: 2 } }]
			}
		);
		const port = withRevisions(inner);
		const spy = vi.spyOn(port, 'update');

		await persistMergedReorder(port, [
			{ collection: 'arte', id: 'a0', field: 'sort', value: 2 },
			{ collection: 'music', id: 'm0', field: 'pos', value: 1 }
		]);

		expect(spy.mock.calls).toEqual([
			['arte', 'a0', { sort: 2 }, { orderOnlyField: 'sort' }],
			['music', 'm0', { pos: 1 }, { orderOnlyField: 'pos' }]
		]);
		expect((await inner.get('arte', 'a0')).values.sort).toBe(2);
		expect((await inner.get('music', 'm0')).values.pos).toBe(1);
		expect((await inner.list('vega_revisions', {})).totalItems).toBe(0);
	});

	test('control: sin orderOnlyField (el comportamiento antiguo de /v) SÍ crea una revisión', async () => {
		const inner = await seeded([{ name: 'arte', field: 'sort' }], {
			arte: [{ id: 'a0', values: { sort: 1 } }]
		});
		await withRevisions(inner).update('arte', 'a0', { sort: 2 });
		expect((await inner.list('vega_revisions', {})).totalItems).toBe(1);
	});

	test('un rechazo corta la tanda: las siguientes no se intentan y el error sube', async () => {
		const update = vi
			.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error('boom'))
			.mockResolvedValue({});
		await expect(
			persistMergedReorder({ update }, [
				{ collection: 'arte', id: 'a', field: 'sort', value: 1 },
				{ collection: 'arte', id: 'b', field: 'sort', value: 2 },
				{ collection: 'arte', id: 'c', field: 'sort', value: 3 }
			])
		).rejects.toThrow('boom');
		expect(update).toHaveBeenCalledTimes(2);
	});
});
