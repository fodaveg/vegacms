import { describe, expect, test } from 'vitest';
import { CHROME_CLEARANCE, placeChrome } from './overlay-chrome';

/** La fila [centro ± alto/2] no pisa el contenido [top, top + height]. */
function clearOfContent(center: number, row: number, top: number, height: number): boolean {
	return center + row / 2 <= top || center - row / 2 >= top + height;
}

describe('placeChrome', () => {
	test('con sitio arriba: encima del contorno, sin tocar el contenido', () => {
		// «Sobre mí» a 72 %: el bloque empieza 220 px por debajo del borde del lienzo.
		const scale = 1 / 0.72;
		const placed = placeChrome({ top: 220, height: 484, canvasHeight: 1115, scale, rowHeight: 40 });
		expect(placed.side).toBe('above');
		expect(placed.center).toBeCloseTo(220 - (CHROME_CLEARANCE + 20) * scale, 5);
		expect(clearOfContent(placed.center, 40 * scale, 220, 484)).toBe(true);
	});

	test('pegado arriba del lienzo: debajo del bloque', () => {
		const placed = placeChrome({
			top: 10,
			height: 200,
			canvasHeight: 900,
			scale: 1,
			rowHeight: 40
		});
		expect(placed).toEqual({ side: 'below', center: 210 + CHROME_CLEARANCE + 20 });
		expect(clearOfContent(placed.center, 40, 10, 200)).toBe(true);
	});

	test('sin medir el lienzo (0): debajo si arriba no cabe', () => {
		expect(
			placeChrome({ top: 0, height: 300, canvasHeight: 0, scale: 1, rowHeight: 22 }).side
		).toBe('below');
	});

	test('ocupa todo el alto visible: dentro, al pie de lo visible, lejos de la primera línea', () => {
		const placed = placeChrome({
			top: 0,
			height: 2000,
			canvasHeight: 900,
			scale: 1,
			rowHeight: 40
		});
		expect(placed).toEqual({ side: 'inside', center: 900 - CHROME_CLEARANCE - 20 });
	});

	test('el tamaño físico se conserva con el zoom: a 50 % la fila ocupa el doble en la página', () => {
		const placed = placeChrome({
			top: 80,
			height: 100,
			canvasHeight: 900,
			scale: 2,
			rowHeight: 40
		});
		// Arriba harían falta (8 + 40) × 2 = 96 px y solo hay 80.
		expect(placed.side).toBe('below');
		expect(placed.center).toBe(180 + 16 + 40);
	});
});
