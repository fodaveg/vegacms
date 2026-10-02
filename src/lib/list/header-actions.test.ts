/**
 * `planHeaderActions` (Lote 12, lámina 6): los estados que la lámina pide construir, sin
 * navegador — ancho intacto; estrecho con «Crear» primero y «Más»; una sola secundaria como botón
 * suelto; sin secundarias; sin permiso de crear.
 */
import { describe, expect, test } from 'vitest';
import { planHeaderActions } from './header-actions';

describe('planHeaderActions (lámina 6)', () => {
	test('en ancho no cambia nada: los tres botones, Exportar e Importar como botones sueltos', () => {
		const plan = planHeaderActions({
			narrow: false,
			canCreate: true,
			canExport: true,
			canImport: true
		});
		expect(plan).toEqual({
			layout: 'wide',
			create: true,
			secondary: ['export', 'import'],
			secondaryAs: 'buttons'
		});
	});

	test('en estrecho con dos secundarias: «Crear» y un menú «Más» con Exportar e Importar', () => {
		const plan = planHeaderActions({
			narrow: true,
			canCreate: true,
			canExport: true,
			canImport: true
		});
		expect(plan.layout).toBe('narrow');
		expect(plan.create).toBe(true);
		expect(plan.secondaryAs).toBe('menu');
		expect(plan.secondary).toEqual(['export', 'import']);
	});

	test('en estrecho con UNA secundaria (solo lectura, 6.3): botón suelto, nunca un menú de una entrada', () => {
		const plan = planHeaderActions({
			narrow: true,
			canCreate: false,
			canExport: true,
			canImport: false
		});
		expect(plan).toEqual({
			layout: 'narrow',
			create: false,
			secondary: ['export'],
			secondaryAs: 'buttons'
		});
	});

	test('sin permiso de crear pero con Exportar e Importar (solo update): «Más» sin «Crear»', () => {
		const plan = planHeaderActions({
			narrow: true,
			canCreate: false,
			canExport: true,
			canImport: true
		});
		expect(plan.create).toBe(false);
		expect(plan.secondaryAs).toBe('menu');
	});

	test('sin ninguna secundaria: solo «Crear», sin «Más» ni hueco', () => {
		const plan = planHeaderActions({
			narrow: true,
			canCreate: true,
			canExport: false,
			canImport: false
		});
		expect(plan.secondary).toEqual([]);
		expect(plan.secondaryAs).toBe('none');
	});

	test('Exportar siempre va antes que Importar, se mire por donde se mire', () => {
		expect(
			planHeaderActions({ narrow: false, canCreate: false, canExport: true, canImport: true })
				.secondary
		).toEqual(['export', 'import']);
		expect(
			planHeaderActions({ narrow: true, canCreate: false, canExport: false, canImport: true })
				.secondary
		).toEqual(['import']);
	});
});
