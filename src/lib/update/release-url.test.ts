/**
 * `safeReleaseUrl` (ver la cabecera de `release-url.ts`): la lista de evasiones de la revisión de
 * seguridad del 30 sep 2026, más las formas en que un parseo permisivo cambia de host.
 */

import { describe, expect, test } from 'vitest';
import { safeReleaseUrl } from './release-url';

describe('safeReleaseUrl', () => {
	test('una página del repositorio de Vega se acepta', () => {
		expect(safeReleaseUrl('https://github.com/fodaveg/vegacms/releases/tag/v1.2.3')).toBe(
			'https://github.com/fodaveg/vegacms/releases/tag/v1.2.3'
		);
	});

	test('devuelve la forma NORMALIZADA (lo que se validó es lo que se enlaza)', () => {
		expect(safeReleaseUrl('  HTTPS://GitHub.com:443/fodaveg/vegacms  ')).toBe(
			'https://github.com/fodaveg/vegacms'
		);
	});

	test.each([
		'https://github.com/fodaveg/vegacms',
		'https://github.com/fodaveg/vegacms/',
		'https://github.com/fodaveg/vegacms/issues/1?view=all#comentario',
		'https://github.com/fodaveg/vegacms/releases/tag/v1.2.3%2ffeature'
	])('acepta una ruta del repositorio sin exigir releases (%s)', (candidate) => {
		expect(safeReleaseUrl(candidate)).toBe(candidate);
	});

	test.each([
		'https://github.com/fodaveg/otro/releases/tag/v1.2.3',
		'https://github.com/otro/vegacms/releases/tag/v1.2.3',
		'https://github.com/fodaveg/vegacms-evil/releases',
		'https://github.com/fodaveg/prefijo-vegacms/releases',
		'https://github.com/fodaveg/vegacms.evil/releases',
		'https://github.com/fodaveg/vegacms%2freleases',
		'https://github.com/%66odaveg/vegacms/releases',
		'https://github.com/fodaveg/%76egacms/releases',
		'https://github.com/fodaveg/vegacms/../otro/releases',
		'https://github.com/fodaveg/otro/../vegacms/releases',
		'https://github.com/fodaveg/vegacms/%2e%2e/otro/releases',
		'https://github.com/fodaveg/vegacms/releases/../issues',
		'https://github.com/fodaveg/vegacms/%2e%2e%2fother',
		'https://github.com/fodaveg/vegacms/%2f..%2fother',
		'https://github.com/fodaveg/vegacms/%2e%2e%5cother',
		'https://github.com/fodaveg/vegacms/releases%2f..%2fissues',
		'https://github.com/fodaveg',
		'https://github.com\\@evil.example/',
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
