import { describe, expect, test } from 'vitest';
import { parseJsonInput, stringifyJsonValue } from './json-field';

describe('stringifyJsonValue', () => {
	test('pretty-print de un objeto', () => {
		expect(stringifyJsonValue({ a: 1 })).toBe('{\n  "a": 1\n}');
	});

	test('null se serializa como el literal "null"', () => {
		expect(stringifyJsonValue(null)).toBe('null');
	});

	test('un array de primitivos', () => {
		expect(stringifyJsonValue([1, 'x', false])).toBe('[\n  1,\n  "x",\n  false\n]');
	});
});

describe('parseJsonInput', () => {
	test('objeto válido', () => {
		expect(parseJsonInput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
	});

	test('cadena vacía → ok con value null (vaciar el campo, no un error)', () => {
		expect(parseJsonInput('')).toEqual({ ok: true, value: null });
	});

	test('solo espacios en blanco → igual que vacío', () => {
		expect(parseJsonInput('   \n  ')).toEqual({ ok: true, value: null });
	});

	test('JSON a medio escribir → ok:false, NO propaga un valor parcial', () => {
		expect(parseJsonInput('{"a": ')).toEqual({ ok: false });
	});

	test('array válido', () => {
		expect(parseJsonInput('[1,2,3]')).toEqual({ ok: true, value: [1, 2, 3] });
	});

	test('literal escalar válido (number)', () => {
		expect(parseJsonInput('42')).toEqual({ ok: true, value: 42 });
	});
});
