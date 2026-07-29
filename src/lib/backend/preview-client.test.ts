/**
 * Suite de `preview-client.ts` (lote "publicación", fase B): `parsePreviewToken` (todo-o-nada, sin
 * campos opcionales que degradar) y `createPreviewClient` (`POST {apiUrl}/token`, cabecera
 * `Authorization` sin `Bearer`, cuerpo `{collection, id}`, mapeo de HTTP no-2xx y de forma
 * inesperada). Mismo criterio de tests que `backend/build-client.test.ts`.
 */

import { describe, expect, test, vi } from 'vitest';
import {
	createPreviewClient,
	parsePreviewToken,
	type PreviewDraft,
	type PreviewToken
} from './preview-client';

const TOKEN: PreviewToken = {
	url: 'https://example.test/preview/posts/abc123?token=signed-value',
	expiresAt: '2026-07-25T10:15:00.000Z'
};

describe('parsePreviewToken', () => {
	test('acepta el documento completo del contrato', () => {
		expect(parsePreviewToken(TOKEN)).toEqual(TOKEN);
	});

	test('acepta el token POST opcional de un borrador sin cambiar la forma guardada', () => {
		expect(parsePreviewToken({ ...TOKEN, postToken: 'v2.encrypted' })).toEqual({
			...TOKEN,
			postToken: 'v2.encrypted'
		});
		expect(parsePreviewToken({ ...TOKEN, postToken: 42 })).toEqual(TOKEN);
	});

	test('sin "url" o sin "expiresAt" (o de tipo inesperado) invalida el documento entero', () => {
		expect(parsePreviewToken({ expiresAt: TOKEN.expiresAt })).toBeNull();
		expect(parsePreviewToken({ url: TOKEN.url })).toBeNull();
		expect(parsePreviewToken({ url: '', expiresAt: TOKEN.expiresAt })).toBeNull();
		expect(parsePreviewToken({ url: TOKEN.url, expiresAt: 42 })).toBeNull();
	});

	test('documento sin forma → null', () => {
		expect(parsePreviewToken(null)).toBeNull();
		expect(parsePreviewToken('nope')).toBeNull();
		expect(parsePreviewToken({})).toBeNull();
	});
});

describe('createPreviewClient', () => {
	function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
		return vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
			handler(String(url), init ?? {})
		) as unknown as typeof fetch;
	}

	test('requestPreview(): POST {apiUrl}/token con Authorization sin "Bearer" y {collection, id} en el cuerpo', async () => {
		let seenUrl = '';
		let seenInit: RequestInit = {};
		const fetcher = fakeFetch((url, init) => {
			seenUrl = url;
			seenInit = init;
			return new Response(JSON.stringify(TOKEN), { status: 200 });
		});
		const client = createPreviewClient({
			apiUrl: 'https://pb.test/api/vega-preview/',
			token: 'tok-1',
			fetcher
		});

		await expect(client.requestPreview('posts', 'abc123')).resolves.toEqual(TOKEN);
		expect(seenUrl).toBe('https://pb.test/api/vega-preview/token');
		expect(seenInit.method).toBe('POST');
		expect((seenInit.headers as Record<string, string>).Authorization).toBe('tok-1');
		expect(JSON.parse(String(seenInit.body))).toEqual({ collection: 'posts', id: 'abc123' });
	});

	test('requestPreview(): añade el draft canónico solo cuando el editor lo proporciona', async () => {
		let seenBody: unknown;
		const fetcher = fakeFetch((_url, init) => {
			seenBody = JSON.parse(String(init.body));
			return new Response(JSON.stringify({ ...TOKEN, postToken: 'v2.encrypted' }), { status: 200 });
		});
		const client = createPreviewClient({
			apiUrl: 'https://pb.test/api/vega-preview',
			token: 'tok-1',
			fetcher
		});
		const draft: PreviewDraft = {
			record: { id: 'abc123', fields: { title: 'Sin guardar' } },
			blocks: [{ id: 'block-1', fields: { parent: 'abc123', body: 'Texto nuevo' } }]
		};

		await expect(client.requestPreview('posts', 'abc123', draft)).resolves.toEqual({
			...TOKEN,
			postToken: 'v2.encrypted'
		});
		expect(seenBody).toEqual({ collection: 'posts', id: 'abc123', draft });
	});

	test('HTTP no-2xx rechaza con un Error legible, nunca un VegaError (cliente ajeno al puerto)', async () => {
		const fetcher = fakeFetch(() => new Response('nope', { status: 404 }));
		const client = createPreviewClient({
			apiUrl: 'https://pb.test/api/vega-preview',
			token: 'tok',
			fetcher
		});

		await expect(client.requestPreview('posts', 'abc123')).rejects.toThrow(/404/);
	});

	test('respuesta 2xx con forma inesperada rechaza en vez de inventar una URL', async () => {
		const fetcher = fakeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const client = createPreviewClient({
			apiUrl: 'https://pb.test/api/vega-preview',
			token: 'tok',
			fetcher
		});

		await expect(client.requestPreview('posts', 'abc123')).rejects.toThrow(/forma válida/);
	});
});
