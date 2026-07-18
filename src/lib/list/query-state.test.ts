/**
 * Tests unitarios de `parseViewState`/`viewStateToParams` (Fase 4b, L-P4.13/D-P4.9):
 * round-trip de un `ViewState` significativo y tolerancia a params corruptos (nunca lanza).
 */

import { describe, expect, test } from 'vitest';
import { parseViewState, viewStateToParams, type ViewState } from './query-state';

describe('viewStateToParams → parseViewState (round-trip)', () => {
	const cases: ViewState[] = [
		{ q: '', sort: null, status: null, page: 1 }, // el "todo por defecto": URL vacía
		{ q: 'hola mundo', sort: null, status: null, page: 1 },
		{ q: '', sort: { field: 'title', dir: 'asc' }, status: null, page: 1 },
		{ q: '', sort: { field: 'createdAt', dir: 'desc' }, status: null, page: 1 },
		{ q: '', sort: null, status: 'published', page: 1 },
		{ q: '', sort: null, status: null, page: 7 },
		{ q: 'buscado', sort: { field: 'title', dir: 'desc' }, status: 'draft', page: 3 }
	];

	for (const state of cases) {
		test(`preserva ${JSON.stringify(state)}`, () => {
			const params = viewStateToParams(state);
			expect(parseViewState(params)).toEqual(state);
		});
	}

	test('el estado por defecto serializa a una URL vacía (D-P4.9)', () => {
		const params = viewStateToParams({ q: '', sort: null, status: null, page: 1 });
		expect(params.toString()).toBe('');
	});
});

describe('parseViewState — tolerancia a params corruptos (L-P4.13, nunca lanza)', () => {
	test('page ausente → 1', () => {
		expect(parseViewState(new URLSearchParams('q=x')).page).toBe(1);
	});

	test('page no numérico → 1', () => {
		expect(parseViewState(new URLSearchParams('page=abc')).page).toBe(1);
	});

	test('page no entero (decimal) → 1', () => {
		expect(parseViewState(new URLSearchParams('page=1.5')).page).toBe(1);
	});

	test('page < 1 (cero o negativo) → 1', () => {
		expect(parseViewState(new URLSearchParams('page=0')).page).toBe(1);
		expect(parseViewState(new URLSearchParams('page=-3')).page).toBe(1);
	});

	test('dir fuera de {asc,desc} → sort null', () => {
		const state = parseViewState(new URLSearchParams('sort=title&dir=sideways'));
		expect(state.sort).toBeNull();
	});

	test('sort vacío → sort null aunque dir sea válido', () => {
		const state = parseViewState(new URLSearchParams('sort=&dir=asc'));
		expect(state.sort).toBeNull();
	});

	test('sort sin dir → sort null', () => {
		const state = parseViewState(new URLSearchParams('sort=title'));
		expect(state.sort).toBeNull();
	});

	test('q ausente → cadena vacía', () => {
		expect(parseViewState(new URLSearchParams('')).q).toBe('');
	});

	test('status ausente o vacío → null', () => {
		expect(parseViewState(new URLSearchParams('')).status).toBeNull();
		expect(parseViewState(new URLSearchParams('status=')).status).toBeNull();
	});

	test('combinación de basura no lanza y degrada campo a campo', () => {
		const params = new URLSearchParams('page=NaN&dir=x&sort=&status=&q=hola');
		expect(() => parseViewState(params)).not.toThrow();
		expect(parseViewState(params)).toEqual({ q: 'hola', sort: null, status: null, page: 1 });
	});
});
