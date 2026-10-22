/** Sondas negativas de los helpers de producto sin alterar artefactos del servidor. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

type Hook = {
	request(event: object, action: string): void;
	positiveInt(value: string, fallback: number): number;
};
function helper(): Hook {
	const module = { exports: {} };
	vm.runInNewContext(readFileSync('infra/production/pb_hooks/vega-activity-lib.js', 'utf8'), {
		module
	});
	return module.exports as Hook;
}
test('un fallo de original() no impide la escritura ni filtra valores', () => {
	const warn = vi.fn();
	const next = vi.fn();
	const record = {
		id: 'post',
		get: () => '',
		collection: () => ({ name: 'posts', type: 'base', system: false, fields: [] }),
		original: () => {
			throw new Error('SECRETO');
		}
	};
	const event = {
		record,
		auth: { id: 'ana' },
		app: { store: () => ({ get: () => true }), logger: () => ({ warn }) },
		next
	};
	helper().request(event, 'update');
	expect(next).toHaveBeenCalledOnce();
	expect(warn).toHaveBeenCalledOnce();
	expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRETO');
});
test('el error de negocio de next() se propaga aunque falle la preparación', () => {
	const business = new Error('rechazado');
	const event = {
		record: {
			collection: () => {
				throw new Error('lectura');
			}
		},
		auth: { id: 'ana' },
		app: { logger: () => ({ warn: vi.fn() }) },
		next: () => {
			throw business;
		}
	};
	expect(() => helper().request(event, 'create')).toThrow(business);
});
test('retención ignora cero, decimales, negativos, infinito y enteros inseguros', () => {
	const lib = helper();
	for (const value of ['0', '-1', '1.5', 'Infinity', '9999999999999999999', 'abc', ''])
		expect(lib.positiveInt(value, 90)).toBe(90);
	expect(lib.positiveInt(' 12 ', 90)).toBe(12);
});
