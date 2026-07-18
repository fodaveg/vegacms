/**
 * Tests de `structuralEqual`/`hasPendingFiles`/`dirtyFields`/`isDirty` (Fase F5-a, L-P5.6/D-P5.4):
 * escalares, arrays (incluido reordenar = distinto), objetos `json` por igualdad estructural
 * profunda, y `File` SIEMPRE sucio.
 */

import { describe, expect, test } from 'vitest';
import type { FormValues } from './form-model';
import {
	dirtyFields,
	hasPendingFiles,
	isDirty,
	structuralEqual,
	type FormInputValues
} from './dirty';

describe('structuralEqual — escalares y null', () => {
	test('mismos primitivos → iguales', () => {
		expect(structuralEqual('a', 'a')).toBe(true);
		expect(structuralEqual(1, 1)).toBe(true);
		expect(structuralEqual(true, true)).toBe(true);
		expect(structuralEqual(null, null)).toBe(true);
	});

	test('primitivos distintos → distintos', () => {
		expect(structuralEqual('a', 'b')).toBe(false);
		expect(structuralEqual(1, 2)).toBe(false);
		expect(structuralEqual(null, '')).toBe(false);
	});
});

describe('structuralEqual — arrays (select/relation/file múltiples)', () => {
	test('mismos elementos, mismo orden → iguales', () => {
		expect(structuralEqual(['a', 'b'], ['a', 'b'])).toBe(true);
	});

	test('mismos elementos, ORDEN DISTINTO → distintos (el orden es dato)', () => {
		expect(structuralEqual(['a', 'b'], ['b', 'a'])).toBe(false);
	});

	test('longitudes distintas → distintos', () => {
		expect(structuralEqual(['a'], ['a', 'b'])).toBe(false);
	});

	test('array vacío contra array vacío → iguales', () => {
		expect(structuralEqual([], [])).toBe(true);
	});
});

describe('structuralEqual — tipos mixtos (nunca "iguales" por casualidad estructural)', () => {
	test('null contra array vacío → distintos', () => {
		expect(structuralEqual(null, [])).toBe(false);
	});

	test('escalar contra array → distintos', () => {
		expect(structuralEqual(1, [1])).toBe(false);
	});

	test('objeto contra array (aunque "parezcan" compatibles) → distintos', () => {
		expect(structuralEqual({ a: 1 }, [1])).toBe(false);
	});
});

describe('structuralEqual — objetos json (deep-equal estructural, no por referencia)', () => {
	test('mismas claves/valores, objetos DISTINTOS por referencia → iguales', () => {
		expect(structuralEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
	});

	test('orden de claves distinto → sigue igual (estructural, no textual)', () => {
		expect(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
	});

	test('un valor anidado distinto → distintos', () => {
		expect(structuralEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 3] })).toBe(false);
	});

	test('claves de más o de menos → distintos', () => {
		expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	});
});

describe('hasPendingFiles / structuralEqual — File SIEMPRE sucio', () => {
	test('hasPendingFiles: un File suelto → true', () => {
		const file = new File(['x'], 'x.txt');
		expect(hasPendingFiles(file)).toBe(true);
	});

	test('hasPendingFiles: un array con un File dentro (multi-file mezclado con FileRef) → true', () => {
		const file = new File(['x'], 'x.txt');
		expect(hasPendingFiles(['existing.jpg', file])).toBe(true);
	});

	test('hasPendingFiles: sin File → false', () => {
		expect(hasPendingFiles('existing.jpg')).toBe(false);
		expect(hasPendingFiles(['a.jpg', 'b.jpg'])).toBe(false);
		expect(hasPendingFiles(null)).toBe(false);
	});

	test('structuralEqual: un File nunca es igual a nada, ni a sí mismo', () => {
		const file = new File(['x'], 'x.txt');
		// @ts-expect-error -- File no es FieldValue; se fuerza para probar la red de seguridad.
		expect(structuralEqual(file, file)).toBe(false);
	});
});

describe('dirtyFields / isDirty', () => {
	const baseline: FormValues = {
		title: 'Hola',
		tags: ['a', 'b'],
		metadata: { a: 1 },
		cover: 'existing.jpg',
		gallery: ['a.jpg', 'b.jpg']
	};

	test('sin cambios → sin campos sucios, isDirty false', () => {
		const current: FormInputValues = structuredClone(baseline);
		expect(dirtyFields(baseline, current)).toEqual(new Set());
		expect(isDirty(baseline, current)).toBe(false);
	});

	test('un escalar cambiado → solo ese campo sucio', () => {
		const current: FormInputValues = { ...structuredClone(baseline), title: 'Adiós' };
		expect(dirtyFields(baseline, current)).toEqual(new Set(['title']));
		expect(isDirty(baseline, current)).toBe(true);
	});

	test('array reordenado → dirty (L-P5.6: el orden cuenta)', () => {
		const current: FormInputValues = { ...structuredClone(baseline), tags: ['b', 'a'] };
		expect(dirtyFields(baseline, current)).toEqual(new Set(['tags']));
	});

	test('json con mismas claves en otro orden → NO dirty (estructural, no textual)', () => {
		const current: FormInputValues = { ...structuredClone(baseline), metadata: { a: 1 } };
		expect(dirtyFields(baseline, current)).toEqual(new Set());
	});

	test('File pendiente en un campo file de baseline con FileRef → dirty SIEMPRE, aunque "coincida"', () => {
		const file = new File(['x'], 'existing.jpg'); // mismo nombre que el FileRef del baseline
		const current: FormInputValues = { ...structuredClone(baseline), cover: file };
		expect(dirtyFields(baseline, current)).toEqual(new Set(['cover']));
	});

	test('varios campos sucios a la vez → todos en el Set', () => {
		const current: FormInputValues = {
			...structuredClone(baseline),
			title: 'Adiós',
			gallery: ['a.jpg']
		};
		expect(dirtyFields(baseline, current)).toEqual(new Set(['title', 'gallery']));
	});
});
