/**
 * Tests unitarios de `computeReorder` (reorder manual): mover hacia abajo/arriba, no-op, valores
 * previos no contiguos (campo legacy) y casos límite de índices fuera de rango.
 */

import { describe, expect, test } from 'vitest';
import { computeReorder, computeSpanReorder } from './reorder';

describe('computeReorder', () => {
	test('fromIndex === toIndex: no-op, sin updates', () => {
		expect(computeReorder(['a', 'b', 'c'], { a: 0, b: 1, c: 2 }, 1, 1)).toEqual([]);
	});

	test('índices fuera de rango: sin updates, no lanza', () => {
		const ids = ['a', 'b', 'c'];
		const values = { a: 0, b: 1, c: 2 };
		expect(computeReorder(ids, values, -1, 1)).toEqual([]);
		expect(computeReorder(ids, values, 0, 3)).toEqual([]);
		expect(computeReorder(ids, values, 5, 0)).toEqual([]);
	});

	test('mover hacia abajo: solo cambian los ids que se desplazan', () => {
		// a,b,c,d → mover 'a' (0) a la posición de 'c' (2): b,c,a,d
		const updates = computeReorder(['a', 'b', 'c', 'd'], { a: 0, b: 1, c: 2, d: 3 }, 0, 2);
		expect(updates).toEqual(
			expect.arrayContaining([
				{ id: 'b', value: 0 },
				{ id: 'c', value: 1 },
				{ id: 'a', value: 2 }
			])
		);
		expect(updates).toHaveLength(3); // 'd' no cambia de posición (índice 3)
	});

	test('mover hacia arriba: solo cambian los ids que se desplazan', () => {
		// a,b,c,d → mover 'c' (2) a la posición de 'a' (0): c,a,b,d
		const updates = computeReorder(['a', 'b', 'c', 'd'], { a: 0, b: 1, c: 2, d: 3 }, 2, 0);
		expect(updates).toEqual(
			expect.arrayContaining([
				{ id: 'c', value: 0 },
				{ id: 'a', value: 1 },
				{ id: 'b', value: 2 }
			])
		);
		expect(updates).toHaveLength(3);
	});

	test('valores previos no contiguos (campo legacy tipo "sort" de fodaveg): renumera desde 0', () => {
		// Valores de partida con huecos: 10, 20, 30. Mover 'x' (índice 0) a la posición de 'z' (2).
		const updates = computeReorder(['x', 'y', 'z'], { x: 10, y: 20, z: 30 }, 0, 2);
		expect(updates).toEqual([
			{ id: 'y', value: 0 },
			{ id: 'z', value: 1 },
			{ id: 'x', value: 2 }
		]);
	});

	test('extremos: mover el primero al último y viceversa', () => {
		const toLast = computeReorder(['a', 'b', 'c'], { a: 0, b: 1, c: 2 }, 0, 2);
		expect(toLast).toEqual([
			{ id: 'b', value: 0 },
			{ id: 'c', value: 1 },
			{ id: 'a', value: 2 }
		]);

		const toFirst = computeReorder(['a', 'b', 'c'], { a: 0, b: 1, c: 2 }, 2, 0);
		expect(toFirst).toEqual([
			{ id: 'c', value: 0 },
			{ id: 'a', value: 1 },
			{ id: 'b', value: 2 }
		]);
	});

	test('valores ya correctos tras el reordenado: sin updates de más', () => {
		// El único elemento que "cambia de índice" ya tenía ese valor por casualidad: no se emite.
		const updates = computeReorder(['a', 'b'], { a: 1, b: 0 }, 0, 1);
		// a,b → mover a(0) a 1 → b,a: b pasa a índice 0 (ya era 0 → sin update), a pasa a índice 1
		// (ya era 1 → sin update).
		expect(updates).toEqual([]);
	});
});

describe('computeSpanReorder (solo el tramo movido, L7c)', () => {
	/** 30 filas con orden 0..29, el caso de una colección ya normalizada. */
	const ids = Array.from({ length: 30 }, (_, i) => `r${i}`);
	const contiguous = Object.fromEntries(ids.map((id, i) => [id, i]));

	test('no-op e índices fuera de rango: sin updates', () => {
		expect(computeSpanReorder(ids, contiguous, 3, 3)).toEqual([]);
		expect(computeSpanReorder(ids, contiguous, -1, 3)).toEqual([]);
		expect(computeSpanReorder(ids, contiguous, 3, 30)).toEqual([]);
	});

	test('mover una posición abajo escribe 2 filas (no 30)', () => {
		const updates = computeSpanReorder(ids, contiguous, 4, 5);
		expect(updates).toEqual([
			{ id: 'r5', value: 4 },
			{ id: 'r4', value: 5 }
		]);
	});

	test('mover arriba un tramo de 4 escribe 4 filas con los valores que ya ocupaban', () => {
		// r10 pasa a la posición 7: r10,r7,r8,r9 ocupan 7..10.
		const updates = computeSpanReorder(ids, contiguous, 10, 7);
		expect(updates).toEqual([
			{ id: 'r10', value: 7 },
			{ id: 'r7', value: 8 },
			{ id: 'r8', value: 9 },
			{ id: 'r9', value: 10 }
		]);
	});

	test('extremos: primero al último escribe el tramo entero, y es el único caso grande', () => {
		const toLast = computeSpanReorder(ids, contiguous, 0, 29);
		expect(toLast).toHaveLength(30);
		const toFirst = computeSpanReorder(ids, contiguous, 29, 0);
		expect(toFirst).toHaveLength(30);
		expect(toFirst[0]).toEqual({ id: 'r29', value: 0 });
	});

	test('valores con huecos pero crecientes: se conservan los de fuera del tramo', () => {
		const spaced = { a: 10, b: 20, c: 30, d: 40 };
		expect(computeSpanReorder(['a', 'b', 'c', 'd'], spaced, 1, 2)).toEqual([
			{ id: 'c', value: 20 },
			{ id: 'b', value: 30 }
		]);
	});

	test('colección sembrada con todos a 0: normaliza UNA vez, 29 escrituras (la fila 0 ya vale 0)', () => {
		const seeded = Object.fromEntries(ids.map((id) => [id, 0]));
		const updates = computeSpanReorder(ids, seeded, 5, 6);
		expect(updates).toHaveLength(29);
		// Tras aplicar esa normalización, el siguiente arrastre ya es un tramo de 2.
		const after = { ...seeded };
		for (const u of updates) after[u.id] = u.value;
		const orderedAfter = [...ids];
		const [moved] = orderedAfter.splice(5, 1);
		orderedAfter.splice(6, 0, moved);
		expect(computeSpanReorder(orderedAfter, after, 2, 3)).toHaveLength(2);
	});

	test('valores repetidos solo en parte de la lista también normalizan', () => {
		const dup = { a: 0, b: 1, c: 1, d: 3 };
		expect(computeSpanReorder(['a', 'b', 'c', 'd'], dup, 0, 1)).toEqual(
			computeReorder(['a', 'b', 'c', 'd'], dup, 0, 1)
		);
	});

	test('valores vacíos (el llamador los cuenta como 0) duplicados: normaliza', () => {
		const empty = { a: 0, b: 0, c: 2 };
		const updates = computeSpanReorder(['a', 'b', 'c'], empty, 0, 2);
		// b,c,a → b ya vale 0 y no se escribe.
		expect(updates).toEqual([
			{ id: 'c', value: 1 },
			{ id: 'a', value: 2 }
		]);
	});
});
