/**
 * `viewport-storage.ts`: toca `localStorage` de verdad, así que va en el proyecto `dom` (jsdom) —
 * mismo criterio que `column-widths-storage.dom.test.ts`.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_VIEWPORT_PREFERENCE } from './viewport';
import { readViewportPreference, writeViewportPreference } from './viewport-storage';

const STORAGE_KEY = 'vega.visual.viewport.v1';

beforeEach(() => {
	localStorage.clear();
});

describe('readViewportPreference', () => {
	test('sin nada guardado → la preferencia de partida', () => {
		expect(readViewportPreference()).toEqual(DEFAULT_VIEWPORT_PREFERENCE);
	});

	test('round-trip: lo que se escribe es lo que se lee después', () => {
		writeViewportPreference({ preset: 'tablet', zoom: 'fit' });
		expect(readViewportPreference()).toEqual({ preset: 'tablet', zoom: 'fit' });
	});

	test('JSON corrupto → la preferencia de partida, no lanza', () => {
		localStorage.setItem(STORAGE_KEY, '{ esto no es JSON');
		expect(readViewportPreference()).toEqual(DEFAULT_VIEWPORT_PREFERENCE);
	});

	test('guardado con la forma equivocada (otro esquema) → la preferencia de partida', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
		expect(readViewportPreference()).toEqual(DEFAULT_VIEWPORT_PREFERENCE);
	});

	test('guardado a mano fuera de vocabulario → se sanea al leer (sanitizeViewportPreference)', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: 'watch', zoom: 42 }));
		expect(readViewportPreference()).toEqual(DEFAULT_VIEWPORT_PREFERENCE);
	});

	test('clave distinta de la de columnas: no interfiere con `vega.visual.columns.v1`', () => {
		localStorage.setItem('vega.visual.columns.v1', JSON.stringify({ tree: 999, inspector: 999 }));
		expect(readViewportPreference()).toEqual(DEFAULT_VIEWPORT_PREFERENCE);
	});
});

describe('writeViewportPreference', () => {
	test('persiste tal cual bajo la clave vega.visual.viewport.v1', () => {
		writeViewportPreference({ preset: 'mobile', zoom: 50 });
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
			preset: 'mobile',
			zoom: 50
		});
	});
});
