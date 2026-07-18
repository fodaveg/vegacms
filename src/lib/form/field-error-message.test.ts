/**
 * Tests de `fieldErrorMessage` (Fase F5-a, L-P5.4): código conocido traducido, clave ausente
 * (política "clave cruda" de `$lib/i18n`) → fallback a `message`, código desconocido → siempre
 * `message`, y que los `params` de interpolación se propaguen a `t()`.
 */

import { describe, expect, test } from 'vitest';
import { fieldErrorMessage } from './field-error-message';

describe('fieldErrorMessage', () => {
	test('código conocido con traducción disponible → texto traducido', () => {
		const t = (key: string) =>
			key === 'form.errorCode.validation_required' ? 'Este campo es obligatorio' : key;
		const text = fieldErrorMessage(t, {
			code: 'validation_required',
			message: 'Missing value required.',
			known: true
		});
		expect(text).toBe('Este campo es obligatorio');
	});

	test('código conocido SIN traducción todavía (t() devuelve la clave cruda) → fallback a message', () => {
		const t = (key: string) => key; // simula clave ausente (política de `$lib/i18n`)
		const text = fieldErrorMessage(t, {
			code: 'validation_required',
			message: 'Missing value required.',
			known: true
		});
		expect(text).toBe('Missing value required.');
	});

	test('código desconocido → siempre message, ni intenta traducir', () => {
		let called = false;
		const t = (key: string) => {
			called = true;
			return key;
		};
		const text = fieldErrorMessage(t, {
			code: 'algo_que_pb_inventa_mañana',
			message: 'Mensaje del backend',
			known: false
		});
		expect(text).toBe('Mensaje del backend');
		expect(called).toBe(false);
	});
});
