/**
 * `column-widths.ts`: `clamp` y `sanitizeColumnWidths`, las dos puertas puras que deciden
 * "hasta dónde llega" un ancho de columna. Sin DOM ni `localStorage` (eso lo cubre
 * `column-widths-storage.dom.test.ts`).
 */

import { describe, expect, test } from 'vitest';
import {
	clamp,
	INSPECTOR_DEFAULT_WIDTH,
	INSPECTOR_MIN_WIDTH,
	sanitizeColumnWidths,
	TREE_DEFAULT_WIDTH,
	TREE_MAX_WIDTH
} from './column-widths';

describe('clamp', () => {
	test('dentro de rango: se devuelve tal cual', () => {
		expect(clamp(300, 220, 480)).toBe(300);
	});

	test('por debajo del mínimo: sube al mínimo', () => {
		expect(clamp(10, 220, 480)).toBe(220);
	});

	test('por encima del máximo: baja al máximo', () => {
		expect(clamp(9999, 220, 480)).toBe(480);
	});

	test('justo en los bordes: se conserva', () => {
		expect(clamp(220, 220, 480)).toBe(220);
		expect(clamp(480, 220, 480)).toBe(480);
	});
});

describe('sanitizeColumnWidths', () => {
	test('valores válidos y dentro de rango: se conservan', () => {
		expect(sanitizeColumnWidths({ tree: 300, inspector: 350 })).toEqual({
			tree: 300,
			inspector: 350
		});
	});

	test('sin nada guardado (objeto vacío) → los defaults de cada columna', () => {
		expect(sanitizeColumnWidths({})).toEqual({
			tree: TREE_DEFAULT_WIDTH,
			inspector: INSPECTOR_DEFAULT_WIDTH
		});
	});

	test('fuera de rango: se recorta a su propio tope, no al default', () => {
		expect(sanitizeColumnWidths({ tree: 9999, inspector: -100 })).toEqual({
			tree: TREE_MAX_WIDTH,
			inspector: INSPECTOR_MIN_WIDTH
		});
	});

	test('tipo equivocado, NaN, o campo ausente: cae al default de SU columna, sin arrastrar a la otra', () => {
		expect(sanitizeColumnWidths({ tree: '300px', inspector: 350 })).toEqual({
			tree: TREE_DEFAULT_WIDTH,
			inspector: 350
		});
		expect(sanitizeColumnWidths({ tree: 300, inspector: Number.NaN })).toEqual({
			tree: 300,
			inspector: INSPECTOR_DEFAULT_WIDTH
		});
	});

	test('entrada que no es un objeto (null, array, string, número suelto): todo a los defaults, no lanza', () => {
		expect(sanitizeColumnWidths(null)).toEqual({
			tree: TREE_DEFAULT_WIDTH,
			inspector: INSPECTOR_DEFAULT_WIDTH
		});
		expect(sanitizeColumnWidths('esto no es JSON de columnas')).toEqual({
			tree: TREE_DEFAULT_WIDTH,
			inspector: INSPECTOR_DEFAULT_WIDTH
		});
		expect(sanitizeColumnWidths(42)).toEqual({
			tree: TREE_DEFAULT_WIDTH,
			inspector: INSPECTOR_DEFAULT_WIDTH
		});
	});
});
