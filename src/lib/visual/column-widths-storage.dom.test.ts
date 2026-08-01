/**
 * `column-widths-storage.ts`: toca `localStorage` de verdad, así que va en el proyecto `dom`
 * (jsdom) — mismo criterio que `theme/apply.dom.test.ts`/`update/storage.dom.test.ts`.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_COLUMN_WIDTHS, INSPECTOR_MAX_WIDTH, TREE_MIN_WIDTH } from './column-widths';
import { readColumnWidths, writeColumnWidths } from './column-widths-storage';

const STORAGE_KEY = 'vega.visual.columns.v1';

beforeEach(() => {
	localStorage.clear();
});

describe('readColumnWidths', () => {
	test('sin nada guardado → los anchos de partida', () => {
		expect(readColumnWidths()).toEqual(DEFAULT_COLUMN_WIDTHS);
	});

	test('round-trip: lo que se escribe es lo que se lee después', () => {
		writeColumnWidths({ tree: 300, inspector: 350 });
		expect(readColumnWidths()).toEqual({ tree: 300, inspector: 350 });
	});

	test('JSON corrupto → los anchos de partida, no lanza', () => {
		localStorage.setItem(STORAGE_KEY, '{ esto no es JSON');
		expect(readColumnWidths()).toEqual(DEFAULT_COLUMN_WIDTHS);
	});

	test('guardado con la forma equivocada (otro esquema) → los anchos de partida', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
		expect(readColumnWidths()).toEqual(DEFAULT_COLUMN_WIDTHS);
	});

	test('guardado a mano fuera de rango → se recorta al leer (sanitizeColumnWidths)', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ tree: -50, inspector: 9999 }));
		expect(readColumnWidths()).toEqual({ tree: TREE_MIN_WIDTH, inspector: INSPECTOR_MAX_WIDTH });
	});
});

describe('writeColumnWidths', () => {
	test('persiste tal cual bajo la clave vega.visual.columns.v1', () => {
		writeColumnWidths({ tree: 260, inspector: 400 });
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
			tree: 260,
			inspector: 400
		});
	});
});
