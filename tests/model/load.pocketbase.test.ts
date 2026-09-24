/**
 * Secuencia de red del ARRANQUE contra el adaptador `pocketbase` (audit de rendimiento del 23 sep
 * 2026, p1/p3): `loadContentModel` (lo que hace `+layout.svelte` al tener sesión) seguido de los
 * recuentos de la barra lateral (`Sidebar.svelte`: un `list(tipo, { perPage: 1 })` por colección
 * y otro de `vega_media`, todos a la vez). `fetch` mockeado por `MÉTODO pathname`, mismo patrón
 * que `adapters/pocketbase/schema-cache.test.ts`: se cuentan peticiones reales, no llamadas a
 * funciones internas.
 *
 * Antes de la caché del esquema vivo, esta misma secuencia pedía `GET /api/collections` una vez
 * para `listContentTypes`, otra para leer el manifiesto y otra por cada recuento.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { loadContentModel } from '$lib/model/load';

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

function pbField(name: string, type: 'text' | 'json'): Record<string, unknown> {
	return {
		name,
		type,
		system: false,
		primaryKey: false,
		required: false,
		presentable: false,
		hidden: false
	};
}

function pbCollection(name: string, fields: Record<string, unknown>[]): Record<string, unknown> {
	return {
		id: `col_${name}`,
		name,
		type: 'base',
		system: false,
		fields,
		indexes: [],
		listRule: '',
		viewRule: '',
		createRule: '',
		updateRule: '',
		deleteRule: ''
	};
}

function recordsPage(items: Record<string, unknown>[]): Response {
	return jsonResponse({ page: 1, perPage: 30, totalItems: items.length, totalPages: 1, items });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('arranque contra pocketbase: loadContentModel + recuentos de la barra lateral', () => {
	test('UNA sola GET /api/collections; el manifiesto y los recuentos la reutilizan', async () => {
		const calls: string[] = [];
		const routes: Record<string, () => Response> = {
			'POST /api/collections/_superusers/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
					record: { id: 'su1', email: 'admin@example.com', collectionName: '_superusers' }
				}),
			'GET /api/collections': () =>
				jsonResponse({
					page: 1,
					perPage: 200,
					totalItems: 3,
					totalPages: 1,
					items: [
						pbCollection('vega', [pbField('manifest', 'json'), pbField('key', 'text')]),
						pbCollection('posts', [pbField('title', 'text')]),
						pbCollection('pages', [pbField('title', 'text')])
					]
				}),
			'GET /api/collections/vega/records': () =>
				recordsPage([{ id: 'vega1', key: 'default', manifest: { schemaVersion: 1 } }]),
			'GET /api/collections/posts/records': () => recordsPage([]),
			'GET /api/collections/pages/records': () => recordsPage([])
		};
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const raw =
					typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
				const key = `${(init?.method ?? 'GET').toUpperCase()} ${new URL(raw).pathname}`;
				calls.push(key);
				const handler = routes[key];
				if (!handler) throw new Error(`fetch no mockeado en el test: ${key}`);
				return handler();
			})
		);

		const port = createPocketBaseBackend({ url: BASE_URL });
		await port.login({ email: 'admin@example.com', password: 'x' });
		calls.length = 0;

		const model = await loadContentModel(port);
		// Lo que lanza `Sidebar.svelte` al montar el shell: todo a la vez, `vega_media` incluida
		// (aquí no existe: `not-found` local, sin tocar la red).
		const counts = await Promise.allSettled(
			[...model.types.map((t) => t.name).filter((n) => n !== 'vega'), 'vega_media'].map((type) =>
				port.list(type, { perPage: 1 })
			)
		);

		expect(counts.filter((c) => c.status === 'fulfilled')).toHaveLength(2);
		expect(calls.filter((c) => c === 'GET /api/collections')).toHaveLength(1);
		// Orden en serie: esquema → manifiesto → recuentos (en paralelo entre sí).
		expect(calls.slice(0, 2)).toEqual([
			'GET /api/collections',
			'GET /api/collections/vega/records'
		]);
		expect([...calls.slice(2)].sort()).toEqual([
			'GET /api/collections/pages/records',
			'GET /api/collections/posts/records'
		]);
	});
});
