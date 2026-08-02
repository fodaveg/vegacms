/**
 * `viewport.ts`: `frameWidthFor`/`resolveZoomFactor`/`stageHeightFor`/`sanitizeViewportPreference`,
 * las puertas puras del tamaño de pantalla y el zoom del lienzo. Sin DOM ni `localStorage` (eso lo
 * cubre `viewport-storage.dom.test.ts`) — mismo reparto que `column-widths.test.ts`.
 */

import { describe, expect, test } from 'vitest';
import {
	DEFAULT_SCREEN_PRESET,
	DEFAULT_ZOOM,
	frameWidthFor,
	MOBILE_WIDTH,
	resolveZoomFactor,
	sanitizeViewportPreference,
	stageHeightFor,
	TABLET_WIDTH
} from './viewport';

describe('frameWidthFor', () => {
	test('móvil/tablet: anchos fijos, sin mirar el lienzo', () => {
		expect(frameWidthFor('mobile', 999)).toBe(MOBILE_WIDTH);
		expect(frameWidthFor('tablet', 12)).toBe(TABLET_WIDTH);
	});

	test('escritorio: el ancho MEDIDO, redondeado', () => {
		expect(frameWidthFor('desktop', 712.4)).toBe(712);
		expect(frameWidthFor('desktop', 712.6)).toBe(713);
	});

	test('escritorio con una medida no honesta (negativa, NaN, Infinity): nunca negativo', () => {
		expect(frameWidthFor('desktop', -50)).toBe(0);
		expect(frameWidthFor('desktop', Number.NaN)).toBe(0);
		expect(frameWidthFor('desktop', Number.POSITIVE_INFINITY)).toBe(0);
	});
});

describe('resolveZoomFactor', () => {
	test('niveles fijos: se traducen a factor sin mirar el lienzo', () => {
		expect(resolveZoomFactor(50, 100, 834)).toBe(0.5);
		expect(resolveZoomFactor(75, 100, 834)).toBe(0.75);
		expect(resolveZoomFactor(100, 1, 834)).toBe(1);
	});

	test('"ajustar": lienzo más ESTRECHO que el preset ⇒ encoge en proporción', () => {
		expect(resolveZoomFactor('fit', 417, 834)).toBe(0.5);
	});

	test('"ajustar": lienzo más ANCHO que el preset ⇒ tope en 1, nunca amplía', () => {
		expect(resolveZoomFactor('fit', 2000, 390)).toBe(1);
	});

	test('"ajustar" con el lienzo exactamente del ancho del preset ⇒ 1', () => {
		expect(resolveZoomFactor('fit', 390, 390)).toBe(1);
	});

	test('"ajustar" con un lienzo casi sin sitio: se recorta al piso, nunca a 0 ni negativo', () => {
		// La proporción real (1/834 ≈ 0.0012) cae muy por debajo del piso de seguridad: el
		// resultado es el PISO, no la proporción cruda.
		expect(resolveZoomFactor('fit', 1, 834)).toBeCloseTo(0.1);
	});

	test('"ajustar" sin nada medido todavía (frameWidth 0, o el lienzo a 0/NaN): cae a 1, no a Infinity', () => {
		expect(resolveZoomFactor('fit', 500, 0)).toBe(1);
		expect(resolveZoomFactor('fit', Number.NaN, 834)).toBe(1);
	});
});

describe('stageHeightFor', () => {
	test('factor 1: el alto del escenario es el mismo que el del lienzo', () => {
		expect(stageHeightFor(600, 1)).toBe(600);
	});

	test('factor 0.5: el doble de alto, para que al escalar a la mitad llene el lienzo exacto', () => {
		expect(stageHeightFor(600, 0.5)).toBe(1200);
	});

	test('alto no honesto (negativo, NaN) se sanea a 0 antes de dividir', () => {
		expect(stageHeightFor(-40, 1)).toBe(0);
		expect(stageHeightFor(Number.NaN, 1)).toBe(0);
	});

	test('factor <= 0 (no debería llegar aquí, ver cabecera): degrada sin dividir por cero', () => {
		expect(stageHeightFor(600, 0)).toBe(600);
		expect(stageHeightFor(600, -1)).toBe(600);
	});
});

describe('sanitizeViewportPreference', () => {
	test('valores válidos: se conservan tal cual', () => {
		expect(sanitizeViewportPreference({ preset: 'mobile', zoom: 75 })).toEqual({
			preset: 'mobile',
			zoom: 75
		});
		expect(sanitizeViewportPreference({ preset: 'tablet', zoom: 'fit' })).toEqual({
			preset: 'tablet',
			zoom: 'fit'
		});
	});

	test('sin nada guardado (objeto vacío) → los defaults', () => {
		expect(sanitizeViewportPreference({})).toEqual({
			preset: DEFAULT_SCREEN_PRESET,
			zoom: DEFAULT_ZOOM
		});
	});

	test('un campo corrupto cae a SU default, sin arrastrar al otro', () => {
		expect(sanitizeViewportPreference({ preset: 'watch', zoom: 75 })).toEqual({
			preset: DEFAULT_SCREEN_PRESET,
			zoom: 75
		});
		expect(sanitizeViewportPreference({ preset: 'mobile', zoom: 42 })).toEqual({
			preset: 'mobile',
			zoom: DEFAULT_ZOOM
		});
	});

	test('entrada que no es un objeto (null, array, string, número suelto): todo a los defaults, no lanza', () => {
		const expected = { preset: DEFAULT_SCREEN_PRESET, zoom: DEFAULT_ZOOM };
		expect(sanitizeViewportPreference(null)).toEqual(expected);
		expect(sanitizeViewportPreference('esto no es JSON de viewport')).toEqual(expected);
		expect(sanitizeViewportPreference(42)).toEqual(expected);
		expect(sanitizeViewportPreference(['mobile', 75])).toEqual(expected);
	});
});
