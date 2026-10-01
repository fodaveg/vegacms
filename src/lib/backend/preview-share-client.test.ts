/**
 * Suite de `preview-share-client.ts`: los tres parsers (todo o nada) y `createPreviewShareClient`
 * (crear, listar y anular contra `{apiUrl}/share`, cabecera `Authorization` sin `Bearer`, mapeo de
 * HTTP no-2xx a `PreviewShareRequestError` con su `status`, y rechazo de formas inesperadas). Mismo
 * criterio de tests que `preview-client.test.ts`.
 */

import { describe, expect, test, vi } from 'vitest';
import {
	createPreviewShareClient,
	parseCreatedPreviewShareLink,
	parsePreviewShareLink,
	parsePreviewShareLinkList,
	PreviewShareRequestError,
	type CreatedPreviewShareLink,
	type PreviewShareLink
} from './preview-share-client';

const LINK: PreviewShareLink = {
	id: 'abc123def456ghi',
	label: 'Cliente Ana',
	createdAt: '2026-10-01T12:00:00.000Z',
	expiresAt: '2026-10-08T12:00:00.000Z',
	createdBy: 'editor000000001',
	createdByCollection: 'vega_editors'
};

const CREATED: CreatedPreviewShareLink = {
	...LINK,
	url: 'https://example.test/preview-share/s1.abc123def456ghi.opaque-secret'
};

interface SeenRequest {
	url: string;
	init: RequestInit;
}

function fakeFetch(handler: (url: string, init: RequestInit) => Response): {
	fetcher: typeof fetch;
	seen: SeenRequest[];
} {
	const seen: SeenRequest[] = [];
	const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		seen.push({ url: String(url), init: init ?? {} });
		return handler(String(url), init ?? {});
	}) as unknown as typeof fetch;
	return { fetcher, seen };
}

function clientWith(handler: (url: string, init: RequestInit) => Response, apiUrl?: string) {
	const { fetcher, seen } = fakeFetch(handler);
	const client = createPreviewShareClient({
		apiUrl: apiUrl ?? 'https://pb.test/api/vega-preview',
		token: 'tok-1',
		fetcher
	});
	return { client, seen };
}

function headersOf(request: SeenRequest): Record<string, string> {
	return request.init.headers as Record<string, string>;
}

describe('parsePreviewShareLink', () => {
	test('acepta el documento completo del contrato', () => {
		expect(parsePreviewShareLink(LINK)).toEqual(LINK);
	});

	test('la etiqueta puede venir vacía, pero tiene que ser texto', () => {
		expect(parsePreviewShareLink({ ...LINK, label: '' })).toEqual({ ...LINK, label: '' });
		expect(parsePreviewShareLink({ ...LINK, label: null })).toBeNull();
		expect(parsePreviewShareLink({ ...LINK, label: undefined })).toBeNull();
	});

	test.each(['id', 'createdAt', 'expiresAt', 'createdBy', 'createdByCollection'] as const)(
		'sin "%s" (ausente, vacío o de otro tipo) invalida el documento entero',
		(field) => {
			const missing: Record<string, unknown> = { ...LINK };
			delete missing[field];
			expect(parsePreviewShareLink(missing)).toBeNull();
			expect(parsePreviewShareLink({ ...LINK, [field]: '' })).toBeNull();
			expect(parsePreviewShareLink({ ...LINK, [field]: 42 })).toBeNull();
		}
	);

	test('no arrastra campos que el contrato no nombra (ni un hash que se colara)', () => {
		expect(parsePreviewShareLink({ ...LINK, secretHash: 'deadbeef', url: CREATED.url })).toEqual(
			LINK
		);
	});

	test('documento sin forma → null', () => {
		expect(parsePreviewShareLink(null)).toBeNull();
		expect(parsePreviewShareLink('nope')).toBeNull();
		expect(parsePreviewShareLink({})).toBeNull();
	});
});

describe('parseCreatedPreviewShareLink', () => {
	test('acepta el enlace con su URL', () => {
		expect(parseCreatedPreviewShareLink(CREATED)).toEqual(CREATED);
	});

	test('sin "url" utilizable no hay nada que compartir', () => {
		expect(parseCreatedPreviewShareLink(LINK)).toBeNull();
		expect(parseCreatedPreviewShareLink({ ...CREATED, url: '' })).toBeNull();
		expect(parseCreatedPreviewShareLink({ ...CREATED, url: 42 })).toBeNull();
		expect(parseCreatedPreviewShareLink({ url: CREATED.url })).toBeNull();
	});
});

describe('parsePreviewShareLinkList', () => {
	test('acepta la lista, también vacía', () => {
		expect(
			parsePreviewShareLinkList({ items: [LINK, { ...LINK, id: 'otro00000000000' }] })
		).toEqual([LINK, { ...LINK, id: 'otro00000000000' }]);
		expect(parsePreviewShareLinkList({ items: [] })).toEqual([]);
	});

	test('un solo elemento inválido invalida la lista entera, nunca la recorta', () => {
		expect(parsePreviewShareLinkList({ items: [LINK, { id: 'sin-fechas' }] })).toBeNull();
	});

	test('sin "items" en forma de lista → null', () => {
		expect(parsePreviewShareLinkList({})).toBeNull();
		expect(parsePreviewShareLinkList({ items: null })).toBeNull();
		expect(parsePreviewShareLinkList([LINK])).toBeNull();
		expect(parsePreviewShareLinkList(null)).toBeNull();
	});
});

describe('createPreviewShareClient', () => {
	test('createLink(): POST {apiUrl}/share con Authorization sin "Bearer", duración y etiqueta', async () => {
		const { client, seen } = clientWith(
			() => new Response(JSON.stringify(CREATED), { status: 201 }),
			'https://pb.test/api/vega-preview/'
		);

		await expect(
			client.createLink('posts', 'abc123', { ttlSeconds: 604800, label: 'Cliente Ana' })
		).resolves.toEqual(CREATED);
		expect(seen).toHaveLength(1);
		expect(seen[0].url).toBe('https://pb.test/api/vega-preview/share');
		expect(seen[0].init.method).toBe('POST');
		expect(seen[0].init.cache).toBe('no-store');
		expect(headersOf(seen[0]).Authorization).toBe('tok-1');
		expect(headersOf(seen[0])['Content-Type']).toBe('application/json');
		expect(JSON.parse(String(seen[0].init.body))).toEqual({
			collection: 'posts',
			id: 'abc123',
			ttlSeconds: 604800,
			label: 'Cliente Ana'
		});
	});

	test('createLink(): sin etiqueta no manda la clave "label"', async () => {
		const { client, seen } = clientWith(
			() => new Response(JSON.stringify(CREATED), { status: 201 })
		);

		await client.createLink('posts', 'abc123', { ttlSeconds: 3600 });
		expect(JSON.parse(String(seen[0].init.body))).toEqual({
			collection: 'posts',
			id: 'abc123',
			ttlSeconds: 3600
		});
	});

	test('createLink(): un 2xx sin URL rechaza en vez de inventar un enlace', async () => {
		const { client } = clientWith(() => new Response(JSON.stringify(LINK), { status: 201 }));

		await expect(client.createLink('posts', 'abc123', { ttlSeconds: 3600 })).rejects.toThrow(
			/forma válida/
		);
	});

	test('listLinks(): GET {apiUrl}/share con colección e id codificados en la query', async () => {
		const { client, seen } = clientWith(
			() => new Response(JSON.stringify({ items: [LINK] }), { status: 200 })
		);

		await expect(client.listLinks('posts', 'a b&c=d')).resolves.toEqual([LINK]);
		expect(seen[0].init.method).toBe('GET');
		expect(seen[0].init.cache).toBe('no-store');
		expect(headersOf(seen[0]).Authorization).toBe('tok-1');
		expect(seen[0].init.body).toBeUndefined();
		const url = new URL(seen[0].url);
		expect(url.origin + url.pathname).toBe('https://pb.test/api/vega-preview/share');
		expect(url.searchParams.get('collection')).toBe('posts');
		expect(url.searchParams.get('id')).toBe('a b&c=d');
		expect([...url.searchParams.keys()]).toEqual(['collection', 'id']);
	});

	test('listLinks(): un 2xx con forma inesperada rechaza en vez de dar una lista vacía', async () => {
		const { client } = clientWith(
			() => new Response(JSON.stringify({ ok: true }), { status: 200 })
		);

		await expect(client.listLinks('posts', 'abc123')).rejects.toThrow(/forma válida/);
	});

	test('revokeLink(): POST {apiUrl}/share/revoke con registro y enlace; un 204 sin cuerpo resuelve', async () => {
		const { client, seen } = clientWith(() => new Response(null, { status: 204 }));

		await expect(client.revokeLink('posts', 'abc123', LINK.id)).resolves.toBeUndefined();
		expect(seen[0].url).toBe('https://pb.test/api/vega-preview/share/revoke');
		expect(seen[0].init.method).toBe('POST');
		expect(headersOf(seen[0]).Authorization).toBe('tok-1');
		expect(JSON.parse(String(seen[0].init.body))).toEqual({
			collection: 'posts',
			id: 'abc123',
			linkId: LINK.id
		});
	});

	test.each([400, 401, 403, 404, 413, 500])(
		'un %i en cualquiera de las tres rutas rechaza con PreviewShareRequestError y su status',
		async (status) => {
			const { client } = clientWith(() => new Response('no', { status }));

			const errors = await Promise.all([
				client.createLink('posts', 'abc123', { ttlSeconds: 3600 }).catch((e: unknown) => e),
				client.listLinks('posts', 'abc123').catch((e: unknown) => e),
				client.revokeLink('posts', 'abc123', LINK.id).catch((e: unknown) => e)
			]);
			for (const error of errors) {
				expect(error).toBeInstanceOf(PreviewShareRequestError);
				expect(error).toBeInstanceOf(Error);
				expect((error as PreviewShareRequestError).status).toBe(status);
				expect((error as Error).message).toContain(String(status));
			}
		}
	);

	test('el mensaje de error nombra método y ruta, nunca la query ni el token de sesión', async () => {
		const { client } = clientWith(() => new Response('no', { status: 403 }));

		const error = (await client.listLinks('posts', 'abc123').catch((e: unknown) => e)) as Error;
		expect(error.message).toContain('GET https://pb.test/api/vega-preview/share');
		expect(error.message).not.toContain('abc123');
		expect(error.message).not.toContain('tok-1');
	});

	test('un fallo de red se propaga tal cual (no es un PreviewShareRequestError)', async () => {
		const fetcher = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		const client = createPreviewShareClient({
			apiUrl: 'https://pb.test/api/vega-preview',
			token: 'tok-1',
			fetcher
		});

		const error = await client.listLinks('posts', 'abc123').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TypeError);
		expect(error).not.toBeInstanceOf(PreviewShareRequestError);
	});

	test('un 2xx que no es JSON rechaza con el error plano del cliente, sin citar el cuerpo', async () => {
		// Una respuesta de crear cortada a medias: el `SyntaxError` del motor cita un trozo del
		// cuerpo, y ese trozo es la URL con el secreto.
		const secret = 's1.abc123def456ghi.SECRETO-QUE-NO-DEBE-SALIR';
		const truncated = `{"url":"https://example.test/preview-share/${secret}","id":`;
		const { client } = clientWith(() => new Response(truncated, { status: 201 }));

		const created = await client
			.createLink('posts', 'abc123', { ttlSeconds: 3600 })
			.catch((e: unknown) => e);
		const listed = await client.listLinks('posts', 'abc123').catch((e: unknown) => e);
		for (const error of [created, listed]) {
			expect(error).toBeInstanceOf(Error);
			expect(error).not.toBeInstanceOf(SyntaxError);
			expect((error as Error).message).toMatch(/forma válida/);
			expect((error as Error).cause).toBeUndefined();
			expect(String((error as Error).stack)).not.toContain('SECRETO');
			expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain('SECRETO');
		}
	});

	test('un cuerpo cuya lectura falla también acaba en el error plano del cliente', async () => {
		const response = new Response('{}', { status: 201 });
		vi.spyOn(response, 'json').mockRejectedValue(
			new SyntaxError('Unexpected token: "https://example.test/preview-share/s1.x.SECRETO"')
		);
		const { client } = clientWith(() => response);

		const error = await client
			.createLink('posts', 'abc123', { ttlSeconds: 3600 })
			.catch((e: unknown) => e);
		expect(error).not.toBeInstanceOf(SyntaxError);
		expect((error as Error).message).toMatch(/forma válida/);
		expect((error as Error).message).not.toContain('SECRETO');
	});
});
