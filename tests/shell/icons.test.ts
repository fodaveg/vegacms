/**
 * Suite A.7 (§7 del contrato P3): `IconRegistry.has` / `knownIcons` estable y ordenado.
 */

import { describe, expect, test } from 'vitest';
import { iconRegistry, knownIcons } from '$lib/icons/registry';

describe('iconRegistry', () => {
	test('knownIcons no está vacío', () => {
		expect(knownIcons.length).toBeGreaterThan(0);
	});

	test('knownIcons está ordenado alfabéticamente (estable)', () => {
		expect([...knownIcons]).toEqual([...knownIcons].sort());
	});

	test('knownIcons no tiene duplicados', () => {
		expect(new Set(knownIcons).size).toBe(knownIcons.length);
	});

	test('has() true para un id conocido', () => {
		for (const id of knownIcons) {
			expect(iconRegistry.has(id)).toBe(true);
		}
	});

	test('has() false para un id desconocido', () => {
		expect(iconRegistry.has('no-existe-este-icono')).toBe(false);
	});

	test('iconRegistry.knownIcons es el mismo array que la exportación suelta', () => {
		expect(iconRegistry.knownIcons).toEqual(knownIcons);
	});
});
