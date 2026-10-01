/**
 * `safeReleaseUrl` (ver la cabecera de `release-url.ts`): la lista de evasiones de la revisión de
 * seguridad del 30 sep 2026, más las formas en que un parseo permisivo cambia de host.
 */

import { describe, expect, test } from 'vitest';
import { safeReleaseUrl } from './release-url';

describe('safeReleaseUrl', () => {
	test('una página de https://github.com/ se acepta', () => {
		expect(safeReleaseUrl('https://github.com/fodaveg/vegacms/releases/tag/v1.2.3')).toBe(
			'https://github.com/fodaveg/vegacms/releases/tag/v1.2.3'
		);
	});

	test('devuelve la forma NORMALIZADA (lo que se validó es lo que se enlaza)', () => {
		expect(safeReleaseUrl('  HTTPS://GitHub.com:443/fodaveg  ')).toBe('https://github.com/fodaveg');
		// La barra invertida es separador de ruta en `https:`: queda dentro de github.com.
		expect(safeReleaseUrl('https://github.com\\@evil.example/')).toBe(
			'https://github.com/@evil.example/'
		);
	});

	test.each([
		'https://github.com.evil.example/',
		'https://github.com@evil.example/',
		'https://github.com:pass@evil.example/',
		'https://alguien@github.com/',
		'https://alguien:clave@github.com/',
		'http://github.com/',
		'https://gist.github.com/',
		'https://github.com:8443/',
		'https://evil.example/https://github.com/',
		'//github.com/',
		'/fodaveg/vegacms',
		'javascript:alert(1)',
		'data:text/html,hola',
		'file:///etc/passwd',
		'blob:https://github.com/1234',
		'esto no es una URL',
		''
	])('rechaza %s', (candidate) => {
		expect(safeReleaseUrl(candidate)).toBeNull();
	});

	test.each([null, undefined, 42, {}, ['https://github.com/']])(
		'un valor que no es string (%s) se rechaza',
		(candidate) => {
			expect(safeReleaseUrl(candidate)).toBeNull();
		}
	);
});
