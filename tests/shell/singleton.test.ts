/**
 * Suite A.3 (§7 del contrato P3): `resolveSingletonTarget` (P2 §4.6) como función pura sobre un
 * `totalItems` simulado. 0→new, 1→edit(id), >1→edit(primero)+flag de aviso.
 */

import { describe, expect, test } from 'vitest';
import { resolveSingletonTarget } from '$lib/nav/singleton';

describe('resolveSingletonTarget', () => {
	test('0 registros → crear', () => {
		expect(resolveSingletonTarget('settings', 0)).toEqual({
			kind: 'new',
			url: '/c/settings/new',
			warnManyRecords: false
		});
	});

	test('1 registro → editar ese id, sin aviso', () => {
		expect(resolveSingletonTarget('settings', 1, 'rec_1')).toEqual({
			kind: 'edit',
			url: '/c/settings/rec_1',
			warnManyRecords: false
		});
	});

	test('>1 registros → editar el primero + aviso', () => {
		expect(resolveSingletonTarget('settings', 4, 'rec_first')).toEqual({
			kind: 'edit',
			url: '/c/settings/rec_first',
			warnManyRecords: true
		});
	});

	test('totalItems > 0 sin firstId → error de contrato entre funciones puras', () => {
		expect(() => resolveSingletonTarget('settings', 1)).toThrow();
	});

	test('totalItems negativo → error de contrato (nunca lo produce list())', () => {
		expect(() => resolveSingletonTarget('settings', -1)).toThrow();
	});
});
