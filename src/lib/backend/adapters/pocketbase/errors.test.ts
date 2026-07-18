/**
 * Tests unitarios de `mapPocketBaseError` (§5): construye `ClientResponseError` sintéticos (sin
 * levantar PocketBase real) para cubrir formas de `data` que son difíciles/imposibles de
 * provocar de forma fiable contra un servidor real (claves anidadas por índice, claves ajenas
 * al esquema Vega). El resto de mapeos (401/403/404/5xx/red/forma inesperada) se cubren aquí
 * también por ser triviales de sintetizar y no depender de infraestructura.
 */

import { describe, expect, test } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { mapPocketBaseError } from './errors';

function pbError(status: number, response?: Record<string, unknown>): ClientResponseError {
	return new ClientResponseError({ status, response: response ?? {} });
}

describe('mapPocketBaseError — 400 con data (§5, campos anidados/desconocidos)', () => {
	test('clave = campo Vega conocido, forma plana {code,message} → fieldErrors[campo]', () => {
		const err = pbError(400, { data: { title: { code: 'validation_required', message: 'x' } } });
		const mapped = mapPocketBaseError(err, { hadSession: true, knownFields: ['title', 'body'] });
		expect(mapped.kind).toBe('validation');
		expect(mapped.fieldErrors).toEqual({
			title: { code: 'validation_required', message: 'x' }
		});
	});

	test("clave que NO es un campo Vega conocido → fieldErrors[''] (nivel registro)", () => {
		const err = pbError(400, {
			data: { requestData: { code: 'validation_invalid_body', message: 'malformed' } }
		});
		const mapped = mapPocketBaseError(err, { hadSession: true, knownFields: ['title', 'body'] });
		expect(mapped.kind).toBe('validation');
		expect(mapped.fieldErrors).toHaveProperty('');
		expect(mapped.fieldErrors!['']).toMatchObject({
			message: expect.stringContaining('malformed')
		});
		expect(mapped.fieldErrors).not.toHaveProperty('requestData');
	});

	test("forma anidada por índice en un campo CONOCIDO (p.ej. errores por ítem) → fieldErrors['']", () => {
		const err = pbError(400, {
			data: {
				gallery: {
					'0': { code: 'validation_invalid_mime_type', message: 'bad mime' }
				}
			}
		});
		const mapped = mapPocketBaseError(err, { hadSession: true, knownFields: ['gallery'] });
		expect(mapped.kind).toBe('validation');
		expect(mapped.fieldErrors).not.toHaveProperty('gallery');
		expect(mapped.fieldErrors).toHaveProperty('');
	});

	test('varias claves colapsadas a la vez concatenan el mensaje en vez de perder información', () => {
		const err = pbError(400, {
			data: {
				desconocidoA: { code: 'x', message: 'primero' },
				desconocidoB: { code: 'y', message: 'segundo' }
			}
		});
		const mapped = mapPocketBaseError(err, { hadSession: true, knownFields: ['title'] });
		expect(mapped.fieldErrors!['']?.message).toContain('primero');
		expect(mapped.fieldErrors!['']?.message).toContain('segundo');
	});

	test('sin knownFields (llamador que no lo sabe, p.ej. list/get) → se atribuye tal cual (comportamiento previo)', () => {
		const err = pbError(400, {
			data: { status: { code: 'validation_invalid_value', message: 'x' } }
		});
		const mapped = mapPocketBaseError(err, { hadSession: true });
		expect(mapped.fieldErrors).toEqual({
			status: { code: 'validation_invalid_value', message: 'x' }
		});
	});

	test('400 sin data por campo → backend (petición malformada)', () => {
		const err = pbError(400, { message: 'Something went wrong' });
		const mapped = mapPocketBaseError(err, { hadSession: true });
		expect(mapped.kind).toBe('backend');
	});
});

describe('mapPocketBaseError — resto de la tabla §5', () => {
	test('401/403 con hadSession → auth-expired', () => {
		expect(mapPocketBaseError(pbError(401), { hadSession: true }).kind).toBe('auth-expired');
		expect(mapPocketBaseError(pbError(403), { hadSession: true }).kind).toBe('auth-expired');
	});

	test('401/403 sin hadSession → forbidden', () => {
		expect(mapPocketBaseError(pbError(401), { hadSession: false }).kind).toBe('forbidden');
		expect(mapPocketBaseError(pbError(403), { hadSession: false }).kind).toBe('forbidden');
	});

	test('404 → not-found', () => {
		expect(mapPocketBaseError(pbError(404), { hadSession: true }).kind).toBe('not-found');
	});

	test('5xx → backend', () => {
		expect(mapPocketBaseError(pbError(500), { hadSession: true }).kind).toBe('backend');
		expect(mapPocketBaseError(pbError(503), { hadSession: true }).kind).toBe('backend');
	});

	test('abort/status 0 (sin red) → network retryable', () => {
		const mapped = mapPocketBaseError(pbError(0), { hadSession: true });
		expect(mapped.kind).toBe('network');
		expect(mapped.retryable).toBe(true);
	});

	test('error que no es ClientResponseError → backend (nunca escapa crudo, L2)', () => {
		expect(mapPocketBaseError(new TypeError('boom'), { hadSession: true }).kind).toBe('backend');
	});

	test('un VegaError ya mapeado pasa tal cual (idempotente)', () => {
		const err = pbError(500);
		const first = mapPocketBaseError(err, { hadSession: true });
		const second = mapPocketBaseError(first, { hadSession: false });
		expect(second).toBe(first);
	});
});
