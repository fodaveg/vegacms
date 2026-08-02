/**
 * Suite de `insert-position.ts` (ver su cabecera): función PURA, sin DOM que montar — mismo
 * criterio de fichero que `viewport.test.ts`/`column-widths.test.ts` en este mismo directorio.
 */
import { describe, expect, test } from 'vitest';
import { resolveInsertPosition } from './insert-position';

describe('resolveInsertPosition', () => {
	test('mitad superior del bloque → antes de él (`index`)', () => {
		expect(resolveInsertPosition(2, 15, { top: 10, height: 50 })).toBe(2); // 15 < 35 (punto medio)
	});

	test('mitad inferior del bloque → después de él (`index + 1`)', () => {
		expect(resolveInsertPosition(2, 40, { top: 10, height: 50 })).toBe(3); // 40 >= 35
	});

	test('extremo: el borde SUPERIOR exacto cae en la mitad superior', () => {
		expect(resolveInsertPosition(0, 10, { top: 10, height: 50 })).toBe(0);
	});

	test('extremo: el borde INFERIOR exacto cae en la mitad inferior', () => {
		expect(resolveInsertPosition(0, 60, { top: 10, height: 50 })).toBe(1);
	});

	test('el punto medio exacto cae del lado de "después" (`<`, no `<=`)', () => {
		expect(resolveInsertPosition(4, 35, { top: 10, height: 50 })).toBe(5);
	});

	test('rect de altura 0: el punto medio coincide con `top`, así que cae siempre "después"', () => {
		expect(resolveInsertPosition(1, 10, { top: 10, height: 0 })).toBe(2);
	});

	test('`y` muy por encima del rect sigue siendo "antes" (no hay tope inferior a la resta)', () => {
		expect(resolveInsertPosition(3, -100, { top: 10, height: 50 })).toBe(3);
	});

	test('`y` muy por debajo del rect sigue siendo "después"', () => {
		expect(resolveInsertPosition(3, 9999, { top: 10, height: 50 })).toBe(4);
	});

	test('`index` viaja tal cual, la función no asume nada sobre su rango', () => {
		expect(resolveInsertPosition(0, 0, { top: 0, height: 10 })).toBe(0);
		expect(resolveInsertPosition(99, 0, { top: 0, height: 10 })).toBe(99);
	});
});
