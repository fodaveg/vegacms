/**
 * `takeResetToken`: el token de `/restablecer` se lee una vez y desaparece de la URL, para que no
 * viaje en `Referer` ni quede en el historial.
 */
import { describe, expect, test, vi } from 'vitest';
import { takeResetToken } from './reset-token';

describe('takeResetToken', () => {
	test('devuelve el token y deja la URL sin él', () => {
		const replaceUrl = vi.fn();
		const token = takeResetToken(
			new URL('https://admin.example.org/restablecer?token=abc.def'),
			replaceUrl
		);

		expect(token).toBe('abc.def');
		expect(replaceUrl).toHaveBeenCalledExactlyOnceWith('/restablecer');
	});

	test('conserva el base path, el resto de la query y el ancla', () => {
		const replaceUrl = vi.fn();
		const token = takeResetToken(
			new URL('https://example.org/vegacms/restablecer?lang=es&token=abc&x=1#pie'),
			replaceUrl
		);

		expect(token).toBe('abc');
		expect(replaceUrl).toHaveBeenCalledExactlyOnceWith('/vegacms/restablecer?lang=es&x=1#pie');
	});

	test('recorta espacios del token', () => {
		const token = takeResetToken(
			new URL('https://example.org/restablecer?token=%20abc%20'),
			() => {}
		);
		expect(token).toBe('abc');
	});

	test('sin token (la recarga de la URL ya limpia) devuelve vacío y no toca el historial', () => {
		const replaceUrl = vi.fn();
		const token = takeResetToken(new URL('https://example.org/restablecer'), replaceUrl);

		expect(token).toBe('');
		expect(replaceUrl).not.toHaveBeenCalled();
	});

	test('un parámetro vacío también se retira de la URL', () => {
		const replaceUrl = vi.fn();
		const token = takeResetToken(new URL('https://example.org/restablecer?token='), replaceUrl);

		expect(token).toBe('');
		expect(replaceUrl).toHaveBeenCalledExactlyOnceWith('/restablecer');
	});

	test('no modifica la URL que recibe', () => {
		const url = new URL('https://example.org/restablecer?token=abc');
		takeResetToken(url, () => {});
		expect(url.href).toBe('https://example.org/restablecer?token=abc');
	});
});
