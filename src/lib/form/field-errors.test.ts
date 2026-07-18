/**
 * Tests de `mapFieldErrors`/`isFieldValidationError` (Fase F5-a, L-P5.4 / Audit Finding 7):
 * mapeo campo↔registro, código conocido de cada tabla (PB y local), código desconocido →
 * fallback a `message`, otros `kind` → vista vacía, y que `cause` nunca se lee.
 */

import { describe, expect, test } from 'vitest';
import { LOCAL_REJECTION_CODES, PB_VALIDATION_CODES, VegaError } from '$lib/backend/errors';
import { isFieldValidationError, mapFieldErrors } from './field-errors';

describe('mapFieldErrors — kind distinto de "validation" → vista vacía', () => {
	test.each([
		VegaError.notFound(),
		VegaError.forbidden(),
		VegaError.authExpired(),
		VegaError.network(),
		VegaError.backend('boom')
	])('$kind → { byField: {}, record: null }', (err) => {
		expect(isFieldValidationError(err)).toBe(false);
		expect(mapFieldErrors(err)).toEqual({ byField: {}, record: null });
	});
});

describe('mapFieldErrors — kind "validation"', () => {
	test('clave "" → error de registro, no de campo', () => {
		const err = VegaError.validation({ '': { code: 'validation_required', message: 'Required' } });
		expect(isFieldValidationError(err)).toBe(true);
		const view = mapFieldErrors(err);
		expect(view.byField).toEqual({});
		expect(view.record).toEqual({ code: 'validation_required', message: 'Required', known: true });
	});

	test('claves de campo → byField, cada una traducida por separado', () => {
		const err = VegaError.validation({
			title: { code: PB_VALIDATION_CODES.required, message: 'Missing value required.' },
			rating: { code: PB_VALIDATION_CODES.maxNumber, message: 'Value must be at most 5.' }
		});
		const view = mapFieldErrors(err);
		expect(view.record).toBeNull();
		expect(view.byField).toEqual({
			title: {
				code: PB_VALIDATION_CODES.required,
				message: 'Missing value required.',
				known: true
			},
			rating: {
				code: PB_VALIDATION_CODES.maxNumber,
				message: 'Value must be at most 5.',
				known: true
			}
		});
	});

	test.each(Object.entries(PB_VALIDATION_CODES))(
		'código PB conocido "%s" → known: true',
		(_key, code) => {
			const err = VegaError.validation({ f: { code, message: 'x' } });
			expect(mapFieldErrors(err).byField.f.known).toBe(true);
		}
	);

	test.each(Object.entries(LOCAL_REJECTION_CODES))(
		'código local conocido "%s" → known: true',
		(_key, code) => {
			const err = VegaError.validation({ f: { code, message: 'x' } });
			expect(mapFieldErrors(err).byField.f.known).toBe(true);
		}
	);

	test('código desconocido → known: false, se conserva message como fallback honesto', () => {
		const err = VegaError.validation({
			f: { code: 'algo_que_pb_inventa_mañana', message: 'Mensaje del backend' }
		});
		expect(mapFieldErrors(err).byField.f).toEqual({
			code: 'algo_que_pb_inventa_mañana',
			message: 'Mensaje del backend',
			known: false
		});
	});

	test('nunca lee err.cause: un cause "peligroso" no se filtra a la vista', () => {
		const err = VegaError.validation({ f: { code: 'validation_required', message: 'x' } });
		// Fuerza un cause con datos que NUNCA deberían acabar en la UI.
		Object.assign(err, { cause: { url: 'http://internal/secret', sql: 'DROP TABLE x' } });
		const view = mapFieldErrors(err);
		expect(JSON.stringify(view)).not.toContain('secret');
		expect(JSON.stringify(view)).not.toContain('DROP TABLE');
	});
});
