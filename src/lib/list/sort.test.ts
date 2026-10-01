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

describe('cycleSort con defaultSort — cada click cambia el orden VISIBLE', () => {
	/** Orden que se ve: el explícito de la URL o, sin él, el default del tipo. */
	function visible(sort: ViewState['sort'], def: ViewState['sort']): ViewState['sort'] {
		return sort ?? def;
	}

	const defaults: NonNullable<ViewState['sort']>[] = [
		{ field: 'title', dir: 'asc' },
		{ field: 'title', dir: 'desc' }
	];

	for (const def of defaults) {
		for (const field of ['title', 'status']) {
			test(`default ${def.field} ${def.dir}, clicks en «${field}»: ningún click deja el orden igual`, () => {
				let sort: ViewState['sort'] = null;
				for (let click = 1; click <= 6; click++) {
					const before = visible(sort, def);
					sort = cycleSort(sort, field, def);
					expect(visible(sort, def), `click ${click}`).not.toEqual(before);
				}
			});
		}
	}

	test('en la columna del default alterna asc ⇄ desc y nunca ofrece «sin orden»', () => {
		const def: ViewState['sort'] = { field: 'title', dir: 'desc' };
		const seen: ViewState['sort'][] = [];
		let sort: ViewState['sort'] = null;
		for (let i = 0; i < 4; i++) {
			sort = cycleSort(sort, 'title', def);
			seen.push(visible(sort, def));
		}
		expect(seen).toEqual([
			{ field: 'title', dir: 'asc' },
			{ field: 'title', dir: 'desc' },
			{ field: 'title', dir: 'asc' },
			{ field: 'title', dir: 'desc' }
		]);
	});

	test('un resultado igual al default no se escribe en la URL (null)', () => {
		const def: ViewState['sort'] = { field: 'title', dir: 'asc' };
		expect(cycleSort({ field: 'title', dir: 'desc' }, 'title', def)).toBeNull();
	});

	test('en otra columna el ciclo sigue siendo asc → desc → vuelta al default', () => {
		const def: ViewState['sort'] = { field: 'title', dir: 'asc' };
		const first = cycleSort(null, 'status', def);
		expect(first).toEqual({ field: 'status', dir: 'asc' });
		const second = cycleSort(first, 'status', def);
		expect(second).toEqual({ field: 'status', dir: 'desc' });
		expect(cycleSort(second, 'status', def)).toBeNull();
	});
});
