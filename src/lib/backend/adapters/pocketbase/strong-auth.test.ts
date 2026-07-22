import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPocketBaseBackend } from './index';

const BASE_URL = 'https://pb.example.test';

function fakeJwt(): string {
	const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
	return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function stubFetch(routes: Record<string, (request: Request) => Response>): Request[] {
	const requests: Request[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = new Request(input, init);
			requests.push(request);
			const handler = routes[new URL(request.url).pathname];
			if (!handler) throw new Error(`fetch no mockeado: ${request.method} ${request.url}`);
			return handler(request);
		})
	);
	return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe('PocketBase strong auth (opt-in)', () => {
	test('password con TOTP devuelve un reto y lo completa adoptando el token PB', async () => {
		const requests = stubFetch({
			'/api/vega-auth/login/password': () =>
				jsonResponse({ mfa_required: true, pending: 'pending-1', methods: ['totp', 'recovery'] }),
			'/api/vega-auth/login/totp': () =>
				jsonResponse({
					token: fakeJwt(),
					record: { id: 'ed1', email: 'editor@example.com' }
				})
		});
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth/'
		});

		await expect(
			port.strongAuth?.loginWithPassword({ email: 'editor@example.com', password: 'secret' })
		).resolves.toEqual({
			kind: 'mfa-required',
			pending: 'pending-1',
			methods: ['totp', 'recovery']
		});

		const session = await port.strongAuth?.loginWithTotp('pending-1', '123456');
		expect(session?.user).toEqual({ id: 'ed1', email: 'editor@example.com' });
		expect(port.currentSession()?.user.id).toBe('ed1');
		expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
			'/api/vega-auth/login/password',
			'/api/vega-auth/login/totp'
		]);
	});

	test('password sin segundo factor devuelve directamente una sesión', async () => {
		stubFetch({
			'/api/fodaveg/login/password': () =>
				jsonResponse({
					token: fakeJwt(),
					record: { id: 'u1', email: 'admin@example.com' }
				})
		});
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'users',
			authApiBasePath: '/api/fodaveg'
		});

		await expect(
			port.strongAuth?.loginWithPassword({ email: 'admin@example.com', password: 'secret' })
		).resolves.toMatchObject({ kind: 'authenticated', session: { user: { id: 'u1' } } });
	});

	test('un endpoint ausente da un error accionable y no cae al login vanilla', async () => {
		stubFetch({
			'/api/vega-auth/login/password': () => jsonResponse({ message: 'Not found.' }, 404)
		});
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authApiBasePath: '/api/vega-auth'
		});

		await expect(
			port.strongAuth?.loginWithPassword({ email: 'admin@example.com', password: 'secret' })
		).rejects.toMatchObject({ kind: 'backend' });
	});

	test('un 401 autenticado limpia el token y emite expired por el latch central', async () => {
		stubFetch({
			'/api/vega-auth/login/password': () =>
				jsonResponse({
					token: fakeJwt(),
					record: { id: 'ed1', email: 'editor@example.com' }
				}),
			'/api/collections/vega_editors/auth-refresh': () =>
				jsonResponse({ message: 'The request requires valid record authorization.' }, 401)
		});
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth'
		});
		const reasons: string[] = [];
		port.onAuthChange((_session, reason) => reasons.push(reason));
		await port.strongAuth?.loginWithPassword({
			email: 'editor@example.com',
			password: 'secret'
		});

		await expect(port.strongAuth?.getStatus()).rejects.toMatchObject({ kind: 'auth-expired' });
		expect(port.currentSession()).toBeNull();
		expect(reasons).toEqual(['login', 'expired']);
	});

	test('un TOTP de alta incorrecto del backend legacy no caduca una sesión válida', async () => {
		stubFetch({
			'/api/fodaveg/login/password': () =>
				jsonResponse({
					token: fakeJwt(),
					record: { id: 'u1', email: 'admin@example.com' }
				}),
			'/api/fodaveg/totp/verify': () => jsonResponse({ error: 'invalid_code' }, 401)
		});
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'users',
			authApiBasePath: '/api/fodaveg'
		});
		const reasons: string[] = [];
		port.onAuthChange((_session, reason) => reasons.push(reason));
		await port.strongAuth?.loginWithPassword({ email: 'admin@example.com', password: 'secret' });

		await expect(port.strongAuth?.verifyTotp('000000')).rejects.toMatchObject({
			kind: 'forbidden'
		});
		expect(port.currentSession()?.user.id).toBe('u1');
		expect(reasons).toEqual(['login']);
	});
});
