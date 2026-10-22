/** Las fechas del puerto son ISO; solo el adaptador traduce al formato almacenado de PB. */
import { expect, test } from 'vitest';
import PocketBase from 'pocketbase';
import type { Field } from '../../types';
import type { FilterNode } from '../../query';
import { compileFilter } from './query';
const date: Field = {
	name: 'created',
	type: 'date',
	readonly: true,
	required: false,
	presentable: false,
	hidden: false,
	unique: false
};
const pb = new PocketBase('http://localhost');
test('igualdad y comparaciones de fechas enlazan espacio; texto permanece intacto', () => {
	for (const op of ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'] as const) {
		const filter: FilterNode = {
			kind: 'cond',
			field: 'created',
			op,
			value: '2026-10-22T12:00:00.000Z'
		};
		expect(compileFilter(pb, [date], filter)).toContain('2026-10-22 12:00:00.000Z');
	}
	const text: Field = { ...date, type: 'text', subtype: 'plain' };
	expect(
		compileFilter(pb, [text], {
			kind: 'cond',
			field: 'created',
			op: 'eq',
			value: '2026-10-22T12:00:00.000Z'
		})
	).toContain('2026-10-22T12:00:00.000Z');
});
test('los vacíos de fecha conservan el literal vacío', () => {
	expect(
		compileFilter(pb, [date], { kind: 'cond', field: 'created', op: 'empty', value: null })
	).toBe("created = ''");
});
