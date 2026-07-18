import { describe, expect, test } from 'vitest';
import { toggleValue } from './select-value';

describe('toggleValue', () => {
	test('añade una opción a un array vacío', () => {
		expect(toggleValue([], 'vega')).toEqual(['vega']);
	});

	test('añade una opción nueva al FINAL (orden de selección, no el de options)', () => {
		expect(toggleValue(['demo'], 'vega')).toEqual(['demo', 'vega']);
	});

	test('quita una opción ya seleccionada, preservando el orden del resto', () => {
		expect(toggleValue(['demo', 'vega', 'news'], 'vega')).toEqual(['demo', 'news']);
	});

	test('quitar la única opción deja el array vacío', () => {
		expect(toggleValue(['vega'], 'vega')).toEqual([]);
	});

	test('no muta el array recibido', () => {
		const current = ['demo'];
		const result = toggleValue(current, 'vega');
		expect(current).toEqual(['demo']);
		expect(result).not.toBe(current);
	});

	test('reactivar una opción quitada la vuelve a poner al final, no en su posición original', () => {
		const afterAdd = toggleValue([], 'demo');
		const afterAdd2 = toggleValue(afterAdd, 'vega');
		const afterRemove = toggleValue(afterAdd2, 'demo');
		const afterReadd = toggleValue(afterRemove, 'demo');
		expect(afterReadd).toEqual(['vega', 'demo']);
	});
});
