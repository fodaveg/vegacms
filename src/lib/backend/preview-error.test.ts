/**
 * `classifyPreviewError` (hallazgo p3, lote "formularios y medios"): un `TypeError` (rechazo de
 * `fetch()` en el motor, nunca construido por `preview-client.ts`) es `'network'`, sin mensaje —
 * un `Error` plano (el que SÍ lanza `preview-client.ts` para un HTTP no-2xx o un cuerpo inválido)
 * es `'http'` con su mensaje intacto; cualquier otra cosa lanzada es `'unknown'`.
 */
import { describe, expect, test } from 'vitest';
import { classifyPreviewError } from './preview-error';

describe('classifyPreviewError', () => {
	test('TypeError (fetch rechazado por el motor): network, sin mensaje', () => {
		expect(classifyPreviewError(new TypeError('Failed to fetch'))).toEqual({
			kind: 'network',
			message: null
		});
	});

	test('Error plano (el que lanza preview-client.ts para un HTTP no-2xx): http, con su mensaje', () => {
		const err = new Error('El endpoint de preview respondió con el estado 503 (POST .../token).');
		expect(classifyPreviewError(err)).toEqual({ kind: 'http', message: err.message });
	});

	test('algo lanzado que no es un Error: unknown, sin mensaje', () => {
		expect(classifyPreviewError('boom')).toEqual({ kind: 'unknown', message: null });
		expect(classifyPreviewError(undefined)).toEqual({ kind: 'unknown', message: null });
	});
});
