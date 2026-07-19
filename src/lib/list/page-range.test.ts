/**
 * Tests unitarios de `pageRange` (R4 del rediseño C2): casos límite de la ventana con elipsis —
 * pocas páginas (sin elipsis), página actual al principio/medio/final con muchas páginas (con
 * elipsis en uno o los dos lados), una sola página, y clamping de `page` fuera de rango.
 */

import { describe, expect, test } from 'vitest';
import { pageRange } from './page-range';

describe('pageRange', () => {
	test('una sola página: [1], nunca elipsis', () => {
		expect(pageRange(1, 1)).toEqual([1]);
	});

	test('totalPages <= 0: rango vacío, sin lanzar', () => {
		expect(pageRange(1, 0)).toEqual([]);
		expect(pageRange(1, -3)).toEqual([]);
	});

	test('pocas páginas (caben en la ventana): todas, sin elipsis', () => {
		expect(pageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(pageRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	test('muchas páginas, actual al principio: elipsis solo a la derecha', () => {
		expect(pageRange(1, 20)).toEqual([1, 2, 'ellipsis', 20]);
	});

	test('muchas páginas, actual en medio: elipsis a ambos lados', () => {
		expect(pageRange(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
	});

	test('muchas páginas, actual al final: elipsis solo a la izquierda', () => {
		expect(pageRange(20, 20)).toEqual([1, 'ellipsis', 19, 20]);
	});

	test('hueco de tamaño 1 se rellena con el número, nunca con "…" (ni izquierda ni derecha)', () => {
		// totalWindow(siblingCount=1) = 7 < totalPages(8): entra en la rama con elipsis, pero el
		// hueco entre "1" y el vecino izquierdo (o entre el vecino derecho y "8") puede ser de un
		// solo número — ese caso se rellena, no se colapsa (ver cabecera del módulo).
		expect(pageRange(3, 8)).toEqual([1, 2, 3, 4, 'ellipsis', 8]);
		expect(pageRange(6, 8)).toEqual([1, 'ellipsis', 5, 6, 7, 8]);
	});

	test('page fuera de [1, totalPages] se clampa, nunca produce un rango inválido', () => {
		expect(pageRange(0, 20)).toEqual(pageRange(1, 20));
		expect(pageRange(999, 20)).toEqual(pageRange(20, 20));
	});

	test('siblingCount configurable amplía la ventana', () => {
		expect(pageRange(10, 20, 2)).toEqual([1, 'ellipsis', 8, 9, 10, 11, 12, 'ellipsis', 20]);
	});
});
