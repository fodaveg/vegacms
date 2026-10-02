/**
 * `placeViewportMenu` (`action-menu.ts`, lámina 7): dónde se pinta el menú de fila anclado a la
 * ventana — debajo si cabe, hacia arriba en las últimas filas, pegado al borde derecho del
 * disparador y nunca fuera de la ventana. Puro, sin DOM.
 */
import { describe, expect, test } from 'vitest';
import { MENU_GAP_PX, placeViewportMenu } from './action-menu';

const viewport = { width: 1440, height: 900 };

describe('placeViewportMenu', () => {
	test('cabe debajo: se abre hacia abajo, alineado al borde derecho del disparador', () => {
		const placement = placeViewportMenu({ top: 200, right: 1400, bottom: 228 }, 90, viewport);
		expect(placement.direction).toBe('down');
		expect(placement.style).toBe(`right: 40px; top: ${228 + MENU_GAP_PX}px;`);
	});

	test('no cabe debajo pero sí arriba (últimas filas): se abre hacia arriba', () => {
		const placement = placeViewportMenu({ top: 850, right: 1400, bottom: 878 }, 90, viewport);
		expect(placement.direction).toBe('up');
		expect(placement.style).toBe(`right: 40px; bottom: ${900 - 850 + MENU_GAP_PX}px;`);
	});

	test('no cabe en ningún lado (ventana muy baja): hacia abajo, que al menos se puede desplazar', () => {
		const placement = placeViewportMenu({ top: 10, right: 300, bottom: 38 }, 200, {
			width: 390,
			height: 120
		});
		expect(placement.direction).toBe('down');
	});

	test('el borde derecho nunca se sale de la ventana: `right` mínimo de MENU_GAP_PX', () => {
		const placement = placeViewportMenu({ top: 100, right: 390, bottom: 128 }, 90, {
			width: 390,
			height: 844
		});
		expect(placement.style.startsWith(`right: ${MENU_GAP_PX}px;`)).toBe(true);
	});

	test('justo al límite inferior: cabe debajo si el menú termina en el borde', () => {
		const menuHeight = 90;
		const bottom = viewport.height - menuHeight - MENU_GAP_PX;
		const placement = placeViewportMenu(
			{ top: bottom - 28, right: 1400, bottom },
			menuHeight,
			viewport
		);
		expect(placement.direction).toBe('down');
	});
});
