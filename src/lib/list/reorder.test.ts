/**
 * Tests unitarios de `computeReorder` (reorder manual): mover hacia abajo/arriba, no-op, valores
 * previos no contiguos (campo legacy) y casos límite de índices fuera de rango.
 */

import { describe, expect, test } from 'vitest';
import { computeReorder } from './reorder';

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
