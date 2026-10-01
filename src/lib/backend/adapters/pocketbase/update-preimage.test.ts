/**
 * Lote 9 (audit del 30 sep 2026): guardar con `withRevisions` + adaptador `pocketbase` leía el
 * registro previo DOS veces (la pre-imagen del decorador y la relectura del adaptador). Ahora el
 * decorador pasa la lectura que acaba de hacer en este mismo guardado (`UpdateOptions.preImage`) y
 * el adaptador no repite el `GET`. Se cuentan las peticiones REALES con `fetch` mockeado (mismo
 * patrón que `schema-cache.test.ts`).
 *
 * La detección de conflicto no se debilita: la lectura compartida es la fresca de ESTE guardado, y
 * un `preImage` que no corresponde al registro (otro id/tipo) se ignora y se relee.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { VegaConflictError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import { withRevisions } from '$lib/revisions/with-revisions';
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

const TITLE_FIELD = {
	name: 'title',
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

function emptyPage(): Response {
	return jsonResponse({ page: 1, perPage: 1, totalItems: 0, totalPages: 0, items: [] });
}

/** Servidor falso: `posts/p1` con el título que diga `serverTitle()`; cuenta cada petición. */
function stubServer(serverTitle: () => string) {
	const calls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			const key = `${(init?.method ?? 'GET').toUpperCase()} ${new URL(raw).pathname}`;
			calls.push(key);
			switch (key) {
				case 'POST /api/collections/_superusers/auth-with-password':
					return jsonResponse({
						token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
						record: { id: 'su1', email: 'admin@example.com', collectionName: '_superusers' }
					});
				case 'GET /api/collections':
					return jsonResponse({
						page: 1,
						perPage: 200,
						totalItems: 1,
						totalPages: 1,
						items: [
							{
								id: 'col_posts',
								name: 'posts',
								type: 'base',
								system: false,
								fields: [TITLE_FIELD],
								indexes: []
							}
						]
					});
				case 'GET /api/collections/vega/records':
					return emptyPage(); // manifiesto vacío ⇒ revisiones activas con los defaults
				case 'GET /api/collections/posts/records/p1':
					return jsonResponse({ id: 'p1', collectionName: 'posts', title: serverTitle() });
				case 'PATCH /api/collections/posts/records/p1': {
					const body = JSON.parse(String(init?.body ?? '{}')) as { title?: string };
					return jsonResponse({ id: 'p1', collectionName: 'posts', title: body.title ?? '' });
				}
				default:
					// `vega_revisions` no existe en este esquema: la revisión falla con `not-found`
					// (camino §4, nunca rompe el guardado) y no hace falta más servidor.
					throw new Error(`fetch no mockeado en el test: ${key}`);
			}
		})
	);
	return { calls };
}

async function decoratedPort() {
	const port = createPocketBaseBackend({ url: BASE_URL });
	await port.login({ email: 'admin@example.com', password: 'x' });
	return withRevisions(port);
}

const RECORD_GETS = (calls: string[]) =>
	calls.filter((c) => c === 'GET /api/collections/posts/records/p1').length;
const PATCHES = (calls: string[]) => calls.filter((c) => c.startsWith('PATCH ')).length;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('guardar con withRevisions sobre el adaptador pocketbase', () => {
	test('lee el registro previo UNA vez (antes: dos GET idénticos)', async () => {
		const { calls } = stubServer(() => 'Antes');
		const port = await decoratedPort();

		await port.update('posts', 'p1', { title: 'Después' });

		// Medido ANTES del cambio: 2. Después: 1.
		console.info(`[l9-guardar] GET del registro previo: ${RECORD_GETS(calls)}`);
		expect(RECORD_GETS(calls)).toBe(1);
		expect(PATCHES(calls)).toBe(1);
	});

	test('con versión esperada vigente guarda, y con una caducada sigue fallando cerrado sin PATCH', async () => {
		let title = 'Antes';
		const { calls } = stubServer(() => title);
		const port = await decoratedPort();
		const stale = recordVersion({ id: 'p1', type: 'posts', values: { title: 'Antes' } });

		// El servidor cambió DESPUÉS de que el formulario leyó `stale`: la lectura compartida es la
		// de este guardado (ve «Otro»), no una copia anterior, así que el conflicto salta.
		title = 'Otro';
		await expect(
			port.update('posts', 'p1', { title: 'Mío' }, { expectedVersion: stale })
		).rejects.toBeInstanceOf(VegaConflictError);
		expect(PATCHES(calls)).toBe(0);
		expect(RECORD_GETS(calls)).toBe(1);

		const fresh = recordVersion({ id: 'p1', type: 'posts', values: { title: 'Otro' } });
		await expect(
			port.update('posts', 'p1', { title: 'Mío' }, { expectedVersion: fresh })
		).resolves.toMatchObject({ id: 'p1' });
		expect(PATCHES(calls)).toBe(1);
	});

	test('un preImage de OTRO registro se ignora y el adaptador relee', async () => {
		const { calls } = stubServer(() => 'Antes');
		const raw = createPocketBaseBackend({ url: BASE_URL });
		await raw.login({ email: 'admin@example.com', password: 'x' });

		await raw.update(
			'posts',
			'p1',
			{ title: 'x' },
			{ preImage: { id: 'otro', type: 'posts', values: { title: 'Ajeno' } } }
		);

		expect(RECORD_GETS(calls)).toBe(1);
	});
});
