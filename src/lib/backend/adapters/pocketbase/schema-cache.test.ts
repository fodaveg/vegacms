/**
 * Caché del esquema vivo del adaptador `pocketbase` en modo superuser (`schemaDiscovery: true`,
 * audit de rendimiento del 23 sep 2026, p1). Antes, cada `list`/`get`/`create`/`update`/`delete`
 * paginaba `GET /api/collections` entero solo para encontrar su `ContentType`: la barra lateral lo
 * pedía una vez por recuento. Se cuentan las peticiones REALES con `fetch` mockeado (mismo patrón
 * que `auth-collection.test.ts`), nunca con un espía sobre la función interna.
 *
 * Cobertura:
 * - Una carga de pantalla (`listContentTypes` + N `list` concurrentes, como el arranque del shell)
 *   paga UNA sola `GET /api/collections`.
 * - Tras una escritura de esquema (`ensureCollections`, `addCollectionFields`) la siguiente
 *   operación vuelve a pedirla; `listContentTypes()` explícito siempre vuelve a pedirla.
 * - Una lectura rechazada no queda cacheada: la siguiente operación reintenta.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPocketBaseBackend } from './index';

const BASE_URL = 'https://pb.example.test';

function fakeJwt(payload: Record<string, unknown>): string {
	const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64');
	return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function pbTextField(name: string): Record<string, unknown> {
	return {
		name,
		type: 'text',
		system: false,
		primaryKey: false,
		required: false,
		presentable: false,
		hidden: false,
		min: 0,
		max: 0,
		pattern: ''
	};
}

function pbCollection(name: string, fields: Record<string, unknown>[]): Record<string, unknown> {
	return { id: `col_${name}`, name, type: 'base', system: false, fields, indexes: [] };
}

function collectionsPage(items: Record<string, unknown>[]): Response {
	return jsonResponse({ page: 1, perPage: 200, totalItems: items.length, totalPages: 1, items });
}

function emptyRecordsPage(): Response {
	return jsonResponse({ page: 1, perPage: 1, totalItems: 0, totalPages: 0, items: [] });
}

type Handler = (method: string) => Response | Promise<Response>;

/** Enrutador por `MÉTODO pathname`; cualquier ruta no declarada lanza (nunca red real). */
function stubFetch(routes: Record<string, Handler>): { calls: string[] } {
	const calls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			const method = (init?.method ?? 'GET').toUpperCase();
			const key = `${method} ${new URL(raw).pathname}`;
			calls.push(key);
			const handler = routes[key];
			if (!handler) throw new Error(`fetch no mockeado en el test: ${key}`);
			return handler(method);
		})
	);
	return { calls };
}

const LOGIN_ROUTE = {
	'POST /api/collections/_superusers/auth-with-password': () =>
		jsonResponse({
			token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
			record: { id: 'su1', email: 'admin@example.com', collectionName: '_superusers' }
		})
};

async function loggedInPort() {
	const port = createPocketBaseBackend({ url: BASE_URL });
	await port.login({ email: 'admin@example.com', password: 'x' });
	return port;
}

function countSchemaReads(calls: string[]): number {
	return calls.filter((c) => c === 'GET /api/collections').length;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('caché del esquema vivo (superuser)', () => {
	test('una carga de pantalla (listContentTypes + recuentos concurrentes + get) pide el esquema UNA vez', async () => {
		const { calls } = stubFetch({
			...LOGIN_ROUTE,
			'GET /api/collections': () =>
				collectionsPage([
					pbCollection('pages', [pbTextField('title')]),
					pbCollection('posts', [pbTextField('title')])
				]),
			'GET /api/collections/pages/records': emptyRecordsPage,
			'GET /api/collections/posts/records': emptyRecordsPage,
			'GET /api/collections/posts/records/p1': () =>
				jsonResponse({ id: 'p1', collectionName: 'posts', title: 'Hola' })
		});
		const port = await loggedInPort();

		// Mismo orden que el arranque: el layout lee el esquema y, sin esperar, el shell lanza los
		// recuentos de la barra lateral en paralelo.
		await Promise.all([
			port.listContentTypes(),
			port.list('posts', { perPage: 1 }),
			port.list('pages', { perPage: 1 })
		]);
		await port.list('posts', { perPage: 1 });
		const record = await port.get('posts', 'p1');

		expect(record.values.title).toBe('Hola');
		expect(countSchemaReads(calls)).toBe(1);
	});

	test('tras una escritura de esquema (ensureCollections / addCollectionFields) se vuelve a pedir', async () => {
		let schema = [pbCollection('posts', [pbTextField('title')])];
		const { calls } = stubFetch({
			...LOGIN_ROUTE,
			'GET /api/collections': () => collectionsPage(schema),
			'GET /api/collections/posts/records': emptyRecordsPage,
			'GET /api/collections/pages/records': emptyRecordsPage,
			'GET /api/collections/pages': () =>
				jsonResponse({ status: 404, message: 'x', data: {} }, 404),
			'POST /api/collections': () => {
				schema = [...schema, pbCollection('pages', [pbTextField('title')])];
				return jsonResponse(schema[schema.length - 1]);
			},
			'GET /api/collections/posts': () => jsonResponse(schema[0]),
			'PATCH /api/collections/posts': () => {
				schema = [
					pbCollection('pages', [pbTextField('title')]),
					pbCollection('posts', [pbTextField('title'), pbTextField('summary')])
				];
				return jsonResponse(schema[1]);
			}
		});
		const port = await loggedInPort();

		await port.list('posts');
		expect(countSchemaReads(calls)).toBe(1);

		// Sin invalidar, `pages` no existiría para la caché y esto sería un `not-found` falso.
		await port.ensureCollections([{ name: 'pages', fields: [{ name: 'title', type: 'text' }] }]);
		await expect(port.list('pages')).resolves.toMatchObject({ totalItems: 0 });
		expect(countSchemaReads(calls)).toBe(2);

		await port.addCollectionFields('posts', [{ name: 'summary', type: 'text' }]);
		// El campo nuevo solo es filtrable si la caché se renovó (si no, `validateQuery` lo
		// rechazaría como campo desconocido).
		await port.list('posts', {
			filter: { kind: 'cond', field: 'summary', op: 'eq', value: 'x' }
		});
		expect(countSchemaReads(calls)).toBe(3);

		// La lectura EXPLÍCITA del esquema es en vivo aunque la caché ya esté resuelta, y deja la
		// caché renovada para las operaciones siguientes.
		await port.listContentTypes();
		await port.list('posts');
		expect(countSchemaReads(calls)).toBe(4);
	});

	test('una lectura rechazada NO se cachea: la siguiente operación reintenta', async () => {
		let attempts = 0;
		stubFetch({
			...LOGIN_ROUTE,
			'GET /api/collections': () => {
				attempts += 1;
				if (attempts === 1) throw new TypeError('network down (forzado por el test)');
				return collectionsPage([pbCollection('posts', [pbTextField('title')])]);
			},
			'GET /api/collections/posts/records': emptyRecordsPage
		});
		const port = await loggedInPort();

		await expect(port.list('posts')).rejects.toMatchObject({ kind: 'network' });
		await expect(port.list('posts')).resolves.toMatchObject({ totalItems: 0 });
		await expect(port.list('posts')).resolves.toMatchObject({ totalItems: 0 });
		expect(attempts).toBe(2);
	});
});
