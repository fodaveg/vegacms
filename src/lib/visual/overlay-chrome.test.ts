import { describe, expect, test } from 'vitest';
import { EMPTY_BLOCK_MIN_HEIGHT, outlineRect } from './overlay-chrome';

describe('outlineRect', () => {
	test('un bloque con contenido conserva su caja', () => {
		expect(outlineRect({ top: 120, height: 300 }, 1)).toEqual({
			top: 120,
			height: 300,
			empty: false
		});
	});

	test('un bloque que el sitio pinta sin altura se marca con la altura mínima, centrado', () => {
		// Un «Botón» recién insertado: el sitio reporta 0 px en la junta (y = 400).
		expect(outlineRect({ top: 400, height: 0 }, 1)).toEqual({
			top: 400 - EMPTY_BLOCK_MIN_HEIGHT / 2,
			height: EMPTY_BLOCK_MIN_HEIGHT,
			empty: true
		});
		// A 50 %, los mismos píxeles físicos son el doble en la página.
		expect(outlineRect({ top: 400, height: 0 }, 2).height).toBe(EMPTY_BLOCK_MIN_HEIGHT * 2);
	});
});
