/**
 * Suite A.4 (§7 del contrato P3): mapeo intención→ruta de los constructores de URL puros de
 * `nav/routes.ts`. Una aserción por helper, más los casos de codificación.
 */

import { describe, expect, test } from 'vitest';
import {
	indexRoute,
	listRoute,
	loginRoute,
	mediaRoute,
	newRoute,
	recordRoute,
	settingsRoute
} from '$lib/nav/routes';

describe('constructores de URL de NavApi', () => {
	test('indexRoute → /', () => {
		expect(indexRoute()).toBe('/');
	});

	test('listRoute(type) → /c/:type', () => {
		expect(listRoute('post')).toBe('/c/post');
	});

	test('newRoute(type) → /c/:type/new', () => {
		expect(newRoute('post')).toBe('/c/post/new');
	});

	test('recordRoute(type, id) → /c/:type/:id', () => {
		expect(recordRoute('post', 'abc123')).toBe('/c/post/abc123');
	});

	test('mediaRoute → /media', () => {
		expect(mediaRoute()).toBe('/media');
	});

	test('settingsRoute → /settings', () => {
		expect(settingsRoute()).toBe('/settings');
	});

	test('loginRoute → /login', () => {
		expect(loginRoute()).toBe('/login');
	});

	test('type/id con caracteres especiales se codifican', () => {
		expect(listRoute('a b')).toBe('/c/a%20b');
		expect(recordRoute('post', 'a/b')).toBe('/c/post/a%2Fb');
	});
});
