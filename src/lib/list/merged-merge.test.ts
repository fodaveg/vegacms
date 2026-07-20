/**
 * Tests unitarios de `merged-merge.ts` (Fase L7b): fusión/dedupe/orden de los resultados de una
 * vista fusionada, la lógica delicada que `merged-load.svelte.ts` delega aquí precisamente para
 * poder testearla sin runas.
 */

import { describe, expect, test } from 'vitest';
import { mergeViewResults, truncatedCollections } from './merged-merge';
import type { ResolvedMergedSource, ResolvedMergedView } from '$lib/model/types';
import type { Page, VegaRecord } from '$lib/backend/types';

/** Construye una `ResolvedMergedSource` de prueba con overrides mínimos. */
function makeSource(
	overrides: Partial<ResolvedMergedSource> & { collection: string }
): ResolvedMergedSource {
	return {
		where: null,
		orderField: 'sort',
		titleField: 'title',
		label: overrides.collection,
		...overrides
	};
}

/** Construye una `ResolvedMergedView` de prueba con las `sources` dadas. */
function makeView(sources: ResolvedMergedSource[]): ResolvedMergedView {
	return { id: 'destacados', label: 'Destacados', icon: null, group: null, order: 0, sources };
}

/** Construye un `VegaRecord` de prueba. */
function makeRecord(type: string, id: string, values: VegaRecord['values'] = {}): VegaRecord {
	return { id, type, values };
}

describe('mergeViewResults', () => {
	test('orden final: asc por orderValue, con desempate (collection, id) ante colisión entre tablas', () => {
		// arte y music arrancan cada una en 0,1,2… (valores por-tabla que colisionan entre sí).
		const arte = makeSource({ collection: 'arte' });
		const music = makeSource({ collection: 'music' });
		const view = makeView([arte, music]);

		const arteItems = [
			makeRecord('arte', 'a1', { sort: 0 }),
			makeRecord('arte', 'a2', { sort: 1 })
		];
		const musicItems = [
			makeRecord('music', 'm1', { sort: 0 }),
			makeRecord('music', 'm2', { sort: 1 })
		];

		const rows = mergeViewResults(view, [arteItems, musicItems]);

		// orderValue 0: arte/a1 y music/m1 empatan → desempata 'arte' < 'music'.
		// orderValue 1: arte/a2 y music/m2 empatan → desempata 'arte' < 'music'.
		expect(rows.map((r) => `${r.record.type}:${r.record.id}`)).toEqual([
			'arte:a1',
			'music:m1',
			'arte:a2',
			'music:m2'
		]);
	});

	test('desempate por id cuando collection y orderValue coinciden', () => {
		const source = makeSource({ collection: 'arte' });
		const view = makeView([source]);
		const items = [makeRecord('arte', 'b', { sort: 5 }), makeRecord('arte', 'a', { sort: 5 })];
		const rows = mergeViewResults(view, [items]);
		expect(rows.map((r) => r.record.id)).toEqual(['a', 'b']);
	});

	test('huecos/valores ausentes en orderField se tratan como 0', () => {
		const source = makeSource({ collection: 'arte', orderField: 'sort' });
		const view = makeView([source]);
		const items = [
			makeRecord('arte', 'sin-sort', {}), // sin la clave 'sort'
			makeRecord('arte', 'con-sort-negativo', { sort: -1 }),
			makeRecord('arte', 'no-numerico', { sort: 'x' }) // valor no-number
		];
		const rows = mergeViewResults(view, [items]);
		// -1 va primero; 'sin-sort' y 'no-numerico' empatan en 0, desempatan por id.
		expect(rows.map((r) => r.record.id)).toEqual(['con-sort-negativo', 'no-numerico', 'sin-sort']);
		expect(rows.find((r) => r.record.id === 'sin-sort')?.orderValue).toBe(0);
		expect(rows.find((r) => r.record.id === 'no-numerico')?.orderValue).toBe(0);
	});

	test('dedupe first-source-wins: la misma colección en 2 sources con solapamiento', () => {
		const destacados = makeSource({ collection: 'arte', label: 'Destacado' });
		const resto = makeSource({ collection: 'arte', label: 'Arte' });
		const view = makeView([destacados, resto]);

		const shared = makeRecord('arte', 'a1', { sort: 0 });
		const rows = mergeViewResults(view, [
			[shared], // destacados (primera source): gana
			[shared, makeRecord('arte', 'a2', { sort: 1 })] // resto: a1 duplicado, a2 nuevo
		]);

		expect(rows).toHaveLength(2);
		const a1 = rows.find((r) => r.record.id === 'a1');
		expect(a1?.source.label).toBe('Destacado'); // la source de 'destacados', no 'resto'
	});

	test('source vacía (0 items) no rompe nada', () => {
		const conDatos = makeSource({ collection: 'arte' });
		const vacia = makeSource({ collection: 'music' });
		const view = makeView([conDatos, vacia]);
		const rows = mergeViewResults(view, [[makeRecord('arte', 'a1', { sort: 0 })], []]);
		expect(rows.map((r) => r.record.id)).toEqual(['a1']);
	});

	test('itemsBySource con menos entradas que view.sources se trata como [] (defensivo)', () => {
		const source = makeSource({ collection: 'arte' });
		const view = makeView([source]);
		expect(mergeViewResults(view, [])).toEqual([]);
	});

	test('itemsBySource con MÁS entradas que view.sources: las extra se ignoran', () => {
		const source = makeSource({ collection: 'arte' });
		const view = makeView([source]); // una sola source declarada
		const rows = mergeViewResults(view, [
			[makeRecord('arte', 'a1', { sort: 0 })],
			[makeRecord('music', 'm1', { sort: 0 })] // extra: no corresponde a ninguna source
		]);
		expect(rows.map((r) => r.record.id)).toEqual(['a1']); // sin rastro de 'm1'
	});

	test('dedupe first-source-wins: el orderValue de la fila ganadora viene de la PRIMERA source, no solo el label', () => {
		// Las dos sources en colisión declaran un orderField DISTINTO: confirma que se toma
		// 'sortA' (primera source) y no 'sortB' (segunda), no solo la metadata (label/titleField).
		const primera = makeSource({ collection: 'arte', orderField: 'sortA', label: 'Primera' });
		const segunda = makeSource({ collection: 'arte', orderField: 'sortB', label: 'Segunda' });
		const view = makeView([primera, segunda]);

		const shared = makeRecord('arte', 'a1', { sortA: 7, sortB: 99 });
		const rows = mergeViewResults(view, [[shared], [shared]]);

		expect(rows).toHaveLength(1);
		expect(rows[0].orderValue).toBe(7); // de 'sortA' (primera source), no 'sortB' (99)
		expect(rows[0].source.label).toBe('Primera');
	});

	test('orderValue NaN/Infinity/-Infinity en el registro cae a 0 (respalda Number.isFinite)', () => {
		const source = makeSource({ collection: 'arte' });
		const view = makeView([source]);
		const items = [
			makeRecord('arte', 'nan', { sort: NaN }),
			makeRecord('arte', 'inf', { sort: Infinity }),
			makeRecord('arte', 'neg-inf', { sort: -Infinity })
		];
		const rows = mergeViewResults(view, [items]);
		for (const row of rows) {
			expect(row.orderValue).toBe(0);
		}
		// las tres empatan en orderValue 0 → desempate determinista por id.
		expect(rows.map((r) => r.record.id)).toEqual(['inf', 'nan', 'neg-inf']);
	});

	test('determinismo: mismo input produce siempre el mismo output', () => {
		const arte = makeSource({ collection: 'arte' });
		const music = makeSource({ collection: 'music' });
		const view = makeView([arte, music]);
		const arteItems = [
			makeRecord('arte', 'a1', { sort: 0 }),
			makeRecord('arte', 'a2', { sort: 2 })
		];
		const musicItems = [makeRecord('music', 'm1', { sort: 1 })];

		const first = mergeViewResults(view, [arteItems, musicItems]);
		const second = mergeViewResults(view, [arteItems, musicItems]);
		expect(first.map((r) => r.record.id)).toEqual(second.map((r) => r.record.id));
		expect(first.map((r) => r.record.id)).toEqual(['a1', 'm1', 'a2']);
	});
});

describe('truncatedCollections', () => {
	function makePage(items: VegaRecord[], totalItems: number): Page<VegaRecord> {
		return { items, page: 1, perPage: 200, totalItems, totalPages: 1 };
	}

	test('sin ninguna source al tope: array vacío', () => {
		const view = makeView([
			makeSource({ collection: 'arte' }),
			makeSource({ collection: 'music' })
		]);
		const pages = [
			makePage([makeRecord('arte', 'a1')], 1),
			makePage([makeRecord('music', 'm1')], 1)
		];
		expect(truncatedCollections(view, pages)).toEqual([]);
	});

	test('una source con totalItems > items.length se señala', () => {
		const view = makeView([
			makeSource({ collection: 'arte' }),
			makeSource({ collection: 'music' })
		]);
		const arteItems = Array.from({ length: 2 }, (_, i) => makeRecord('arte', `a${i}`));
		const musicItems = [makeRecord('music', 'm1')];
		const pages = [makePage(arteItems, 5), makePage(musicItems, 1)];
		expect(truncatedCollections(view, pages)).toEqual(['arte']);
	});

	test('pages más corto que view.sources: no rompe (rama defensiva `if (page && …)`)', () => {
		const view = makeView([
			makeSource({ collection: 'arte' }),
			makeSource({ collection: 'music' })
		]);
		const pages = [makePage([makeRecord('arte', 'a1')], 1)]; // falta la página de 'music'
		expect(truncatedCollections(view, pages)).toEqual([]);
	});
});
