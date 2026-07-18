/**
 * Tests unitarios de `cycleSort` (Fase 4d, D-P4.6): el ciclo asc→desc→sin-orden y la garantía de
 * que cambiar de columna siempre reinicia a `asc` (D-P4.6(a), una sola columna ordenada a la vez).
 */

import { describe, expect, test } from 'vitest';
import { cycleSort } from './sort';
import type { ViewState } from './query-state';

describe('cycleSort — ciclo asc → desc → sin-orden → asc…', () => {
	test('sin orden previo: arranca en asc', () => {
		expect(cycleSort(null, 'title')).toEqual({ field: 'title', dir: 'asc' });
	});

	test('mismo campo en asc → pasa a desc', () => {
		const current: ViewState['sort'] = { field: 'title', dir: 'asc' };
		expect(cycleSort(current, 'title')).toEqual({ field: 'title', dir: 'desc' });
	});

	test('mismo campo en desc → vuelve a sin-orden (null)', () => {
		const current: ViewState['sort'] = { field: 'title', dir: 'desc' };
		expect(cycleSort(current, 'title')).toBeNull();
	});

	test('el ciclo completo se repite: asc → desc → null → asc', () => {
		let sort: ViewState['sort'] = null;
		sort = cycleSort(sort, 'title');
		expect(sort).toEqual({ field: 'title', dir: 'asc' });
		sort = cycleSort(sort, 'title');
		expect(sort).toEqual({ field: 'title', dir: 'desc' });
		sort = cycleSort(sort, 'title');
		expect(sort).toBeNull();
		sort = cycleSort(sort, 'title');
		expect(sort).toEqual({ field: 'title', dir: 'asc' });
	});
});

describe('cycleSort — cambiar de columna (D-P4.6(a), una sola columna ordenada a la vez)', () => {
	test('desde asc en otro campo: el campo nuevo arranca en asc, no hereda la dirección', () => {
		const current: ViewState['sort'] = { field: 'title', dir: 'asc' };
		expect(cycleSort(current, 'status')).toEqual({ field: 'status', dir: 'asc' });
	});

	test('desde desc en otro campo: el campo nuevo también arranca en asc', () => {
		const current: ViewState['sort'] = { field: 'title', dir: 'desc' };
		expect(cycleSort(current, 'status')).toEqual({ field: 'status', dir: 'asc' });
	});
});
