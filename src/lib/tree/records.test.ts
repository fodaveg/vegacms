import { describe, expect, test } from 'vitest';
import type { VegaRecord } from '$lib/backend/types';
import { flattenTree, treeBranchIds, treeParentFilter, validateTreeMove } from './records';
const config = { parentField: 'parent', maxDepth: 3 };
const row = (id: string, parent: string | null = null, order = 0): VegaRecord => ({
	id,
	type: 'categories',
	values: { parent, order }
});

describe('árbol editorial iterativo', () => {
	test('ciclo directo, de tres nodos y madre inexistente', () => {
		expect(validateTreeMove([], 'a', 'a', config)).toBe('cycle');
		const records = [row('a'), row('b', 'a'), row('c', 'b')];
		expect(validateTreeMove(records, 'a', 'c', config)).toBe('cycle');
		expect(validateTreeMove(records, 'a', 'absent', config)).toBe('missing-parent');
	});
	test('la altura de la rama cuenta y cambiar su madre puede reparar un ciclo previo', () => {
		const records = [row('a'), row('b', 'a'), row('c'), row('d', 'c')];
		expect(validateTreeMove(records, 'a', 'd', config)).toBe('too-deep');
		expect(validateTreeMove(records, 'a', 'c', config)).toBeNull();
		expect(validateTreeMove([row('a', 'b'), row('b', 'a')], 'a', null, config)).toBeNull();
	});
	test('selector excluye propia y descendientes incluso con ciclo', () => {
		const records = [row('a', 'c'), row('b', 'a'), row('c', 'b'), row('other')];
		expect([...treeBranchIds(records, 'a', 'parent')].sort()).toEqual(['a', 'b', 'c']);
		expect(treeParentFilter(records, 'a', config)).toMatchObject({
			kind: 'group',
			combinator: 'and',
			nodes: expect.arrayContaining([{ kind: 'cond', field: 'id', op: 'neq', value: 'c' }])
		});
	});
	test('listado conserva ramas, orden de hermanas por order/id y profundidad', () => {
		const records = [
			row('z', null, 2),
			row('c', 'a', 1),
			row('b', 'a', 1),
			row('a', null, 1),
			row('d', 'b')
		];
		expect(
			flattenTree(records, config, 'order').map((item) => [item.record.id, item.depth])
		).toEqual([
			['a', 1],
			['b', 2],
			['d', 3],
			['c', 2],
			['z', 1]
		]);
	});
	test('raíces recuperables para ciclos, huérfanas y ramas demasiado profundas', () => {
		const records = [
			row('a', 'b'),
			row('b', 'a'),
			row('orphan', 'absent'),
			row('x'),
			row('y', 'x'),
			row('z', 'y'),
			row('deep', 'z')
		];
		const result = flattenTree(records, config, 'order');
		expect(result).toHaveLength(records.length);
		expect(
			result
				.filter((item) => item.problem)
				.map((item) => [item.record.id, item.depth, item.problem])
		).toEqual(
			expect.arrayContaining([
				['a', 1, 'cycle'],
				['b', 1, 'cycle'],
				['orphan', 1, 'missing-parent'],
				['deep', 1, 'too-deep']
			])
		);
	});
	test('1000 nodos en cadena y un ciclo de 1000 terminan sin recursión', () => {
		const records = Array.from({ length: 1000 }, (_, i) =>
			row(String(i), i ? String(i - 1) : null)
		);
		expect(flattenTree(records, config, null)).toHaveLength(1000);
		expect(validateTreeMove(records, '0', '999', config)).toBe('cycle');
	});
});
