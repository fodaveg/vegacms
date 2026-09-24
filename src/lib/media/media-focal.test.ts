/**
 * Suite de `media-focal.ts`: lectura tolerante del campo `focal` de `vega_media`, lo que se guarda
 * (el centro como vacío), el punto bajo el puntero y el movimiento con flechas.
 */
import { describe, expect, test } from 'vitest';
import {
	MEDIA_FOCAL_CENTER,
	mediaFocalEquals,
	mediaFocalFromPointer,
	mediaFocalPercent,
	mediaFocalToFieldValue,
	moveMediaFocal,
	normalizeMediaFocal
} from './media-focal';

describe('normalizeMediaFocal (json tolerante: vacío o forma rara = centro)', () => {
	test('lee un {x, y} válido', () => {
		expect(normalizeMediaFocal({ x: 0.3, y: 0.25 })).toEqual({ x: 0.3, y: 0.25 });
	});

	test.each([
		['null', null],
		['ausente', undefined],
		['cadena', 'centro'],
		['array', [0.3, 0.2]],
		['sin y', { x: 0.3 }],
		['texto en x', { x: '0.3', y: 0.2 }],
		['NaN no llega por JSON, pero tampoco pasa', { x: Number.NaN, y: 0.2 }]
	] as const)('%s → null (centro)', (_label, value) => {
		expect(normalizeMediaFocal(value as never)).toBeNull();
	});

	test('un número fuera de rango se acota en vez de descartarse', () => {
		expect(normalizeMediaFocal({ x: -0.2, y: 1.7 })).toEqual({ x: 0, y: 1 });
	});
});

describe('mediaFocalToFieldValue (lo que se guarda)', () => {
	test('el centro exacto y «sin punto» se guardan igual: vacío', () => {
		expect(mediaFocalToFieldValue(null)).toBeNull();
		expect(mediaFocalToFieldValue({ x: 0.5, y: 0.5 })).toBeNull();
	});

	test('otro punto se guarda como objeto plano nuevo', () => {
		const draft = { x: 0.2, y: 0.8 };
		const stored = mediaFocalToFieldValue(draft);
		expect(stored).toEqual({ x: 0.2, y: 0.8 });
		expect(stored).not.toBe(draft);
	});

	test('mediaFocalEquals trata null y el centro como el mismo punto', () => {
		expect(mediaFocalEquals(null, { ...MEDIA_FOCAL_CENTER })).toBe(true);
		expect(mediaFocalEquals({ x: 0.2, y: 0.8 }, { x: 0.2, y: 0.8 })).toBe(true);
		expect(mediaFocalEquals({ x: 0.2, y: 0.8 }, null)).toBe(false);
	});
});

describe('mediaFocalFromPointer', () => {
	const rect = { left: 100, top: 50, width: 400, height: 200 };

	test('fracción de la caja de la imagen pintada', () => {
		expect(mediaFocalFromPointer(200, 100, rect)).toEqual({ x: 0.25, y: 0.25 });
		expect(mediaFocalFromPointer(500, 250, rect)).toEqual({ x: 1, y: 1 });
	});

	test('fuera de la caja se acota al borde', () => {
		expect(mediaFocalFromPointer(0, 400, rect)).toEqual({ x: 0, y: 1 });
	});

	test('sin área (imagen sin cargar) no hay punto', () => {
		expect(mediaFocalFromPointer(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
	});
});

describe('moveMediaFocal (flechas; Mayúsculas afina)', () => {
	test('desde vacío parte del centro, paso de 5 %', () => {
		expect(moveMediaFocal(null, 'ArrowLeft')).toEqual({ x: 0.45, y: 0.5 });
		expect(moveMediaFocal(null, 'ArrowDown')).toEqual({ x: 0.5, y: 0.55 });
	});

	test('con paso fino, 1 %, sin errores de coma flotante acumulados', () => {
		let point = moveMediaFocal({ x: 0.1, y: 0.1 }, 'ArrowRight', true);
		point = moveMediaFocal(point, 'ArrowRight', true);
		expect(point).toEqual({ x: 0.12, y: 0.1 });
	});

	test('no pasa del borde', () => {
		expect(moveMediaFocal({ x: 0, y: 1 }, 'ArrowLeft')).toEqual({ x: 0, y: 1 });
		expect(moveMediaFocal({ x: 0, y: 1 }, 'ArrowDown')).toEqual({ x: 0, y: 1 });
	});

	test('otra tecla no mueve', () => {
		expect(moveMediaFocal(null, 'Enter')).toBeNull();
	});

	test('mediaFocalPercent redondea a enteros; vacío = 50/50', () => {
		expect(mediaFocalPercent(null)).toEqual({ x: 50, y: 50 });
		expect(mediaFocalPercent({ x: 0.333, y: 0.0449 })).toEqual({ x: 33, y: 4 });
	});
});
