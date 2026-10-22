/**
 * `markdown-split.ts`: «Dividido» solo se ofrece si cada columna deja `SPLIT_MIN_CHARS` caracteres
 * de texto (spec del 22 oct 2026, parte C). Las cifras de los casos son las medidas en Chromium con
 * la fuente del editor (sonda de 32ch a 14 px de monoespaciada: 268,8 px; rellenos de 40 px en
 * «Escribir» y 44,8 + 1 px en «Vista»).
 */
import { describe, expect, test } from 'vitest';
import { SPLIT_MIN_CHARS, splitFits } from './markdown-split';

const measured = { minTextWidth: 268.8, writeInset: 40, previewInset: 45.8 };

describe('splitFits', () => {
	test('el mínimo legible es de 32 caracteres', () => {
		expect(SPLIT_MIN_CHARS).toBe(32);
	});

	test('cabe cuando la columna más estrecha deja al menos los 32 caracteres', () => {
		// (629,2 / 2) − 45,8 = 268,8: justo en el límite.
		expect(splitFits({ ...measured, bodyWidth: 629.2 })).toBe(true);
		expect(splitFits({ ...measured, bodyWidth: 900 })).toBe(true);
	});

	test('no cabe en cuanto una columna baja del mínimo (la ficha del editor visual, ~420 px)', () => {
		expect(splitFits({ ...measured, bodyWidth: 629 })).toBe(false);
		expect(splitFits({ ...measured, bodyWidth: 420 })).toBe(false);
	});

	test('manda la columna con más relleno, sea cual sea', () => {
		expect(splitFits({ bodyWidth: 400, minTextWidth: 150, writeInset: 60, previewInset: 10 })).toBe(
			false
		);
		expect(splitFits({ bodyWidth: 400, minTextWidth: 150, writeInset: 10, previewInset: 50 })).toBe(
			true
		);
	});

	test('sin medida honesta (0 o NaN) no decide: se sigue ofreciendo', () => {
		expect(splitFits({ ...measured, bodyWidth: 0 })).toBe(true);
		expect(splitFits({ ...measured, bodyWidth: Number.NaN })).toBe(true);
		expect(splitFits({ ...measured, bodyWidth: 300, minTextWidth: 0 })).toBe(true);
	});
});
