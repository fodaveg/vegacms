import { describe, expect, test } from 'vitest';
import { EMPTY_BLOCK_HEIGHT, outlineRect } from './overlay-chrome';

describe('outlineRect', () => {
	test('un bloque con contenido conserva su caja', () => {
		expect(outlineRect({ top: 120, height: 300 }, 1)).toEqual({
			top: 120,
			height: 300,
			empty: false
		});
	});

	test('un bloque que el sitio pinta sin altura se marca vacío, en su junta y sin crecer', () => {
		// Un «Separador» recién insertado: el sitio reporta 0 px en la junta (y = 400). El contorno
		// no se infla sobre los vecinos (QA de fodaveg, 21 oct 2026: un marcador de 28 px con fondo
		// tapaba la línea de encima); su nombre lo dice la franja del escenario.
		expect(outlineRect({ top: 400, height: 0 }, 1)).toEqual({ top: 400, height: 0, empty: true });
		expect(outlineRect({ top: 400, height: EMPTY_BLOCK_HEIGHT - 1 }, 1).empty).toBe(true);
		expect(outlineRect({ top: 400, height: EMPTY_BLOCK_HEIGHT }, 1).empty).toBe(false);
		// A 50 %, los mismos píxeles físicos son el doble en la página.
		expect(outlineRect({ top: 400, height: EMPTY_BLOCK_HEIGHT + 1 }, 2).empty).toBe(true);
	});
});
