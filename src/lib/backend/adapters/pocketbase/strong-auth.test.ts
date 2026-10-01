import { afterEach, describe, expect, test, vi } from 'vitest';
import { isStrongAuthError, VegaStrongAuthError } from '../../errors';
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

describe('PocketBase strong auth: prueba de posesión para cambiar factores', () => {
	const LOGIN_ROUTES = {
		'/api/vega-auth/login/password': () =>
			jsonResponse({ token: fakeJwt(), record: { id: 'ed1', email: 'editor@example.com' } }),
		'/api/collections/vega_editors/auth-refresh': () =>
			jsonResponse({ token: fakeJwt(), record: { id: 'ed1', email: 'editor@example.com' } })
	};

	/** Puerto con sesión abierta y un registro de los motivos de cambio de sesión. */
	async function signedIn(routes: Record<string, (request: Request) => Response>) {
		const requests = stubFetch({ ...LOGIN_ROUTES, ...routes });
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth'
		});
		const reasons: string[] = [];
		port.onAuthChange((_session, reason) => reasons.push(reason));
		await port.strongAuth?.loginWithPassword({ email: 'editor@example.com', password: 'secret' });
		const auth = port.strongAuth;
		if (!auth) throw new Error('el puerto no expone strongAuth');
		return { port, auth, requests, reasons };
	}

	/** Cuerpos JSON enviados a `pathname`, en orden (`null` = petición sin cuerpo). */
	async function bodiesTo(requests: Request[], pathname: string): Promise<unknown[]> {
		const matching = requests.filter((request) => new URL(request.url).pathname === pathname);
		return Promise.all(
			matching.map(async (request) => {
				const text = await request.clone().text();
				return text ? JSON.parse(text) : null;
			})
		);
	}

	const stepUpRequired = (methods: string[]) =>
		jsonResponse(
			{
				error: 'step_up_required',
				methods,
				message: 'Confirm with your current authenticator code or a passkey to change this.'
			},
			428
		);

	test('un 428 llega como error tipado con sus methods, sin caducar la sesión ni enseñar el texto del servidor', async () => {
		const { port, auth, reasons } = await signedIn({
			'/api/vega-auth/totp/disable': () => stepUpRequired(['totp', 'passkey', 'sms'])
		});

		const error = await auth.disableTotp().catch((err: unknown) => err);

		expect(error).toBeInstanceOf(VegaStrongAuthError);
		expect(isStrongAuthError(error, 'step-up-required')).toBe(true);
		expect(error).toMatchObject({ kind: 'forbidden', methods: ['totp', 'passkey'] });
		expect((error as Error).message).not.toContain('Confirm with');
		expect(port.currentSession()?.user.id).toBe('ed1');
		expect(reasons).toEqual(['login']);
	});

	test('el reintento manda el código en el cuerpo de la misma ruta', async () => {
		const { auth, requests } = await signedIn({
			'/api/vega-auth/totp/disable': () => jsonResponse({ ok: true }),
			'/api/vega-auth/totp/enroll': () =>
				jsonResponse({ otpauth_url: 'otpauth://totp/Vega:ed?secret=NEW', secret: 'NEW' }),
			'/api/vega-auth/recovery/generate': () => jsonResponse({ codes: ['AAAAA-BBBBB'] }),
			'/api/vega-auth/passkey/delete': () => jsonResponse({ ok: true })
		});

		await auth.disableTotp({ code: '123456' });
		await auth.enrollTotp({ code: ' 234567 ' });
		await auth.generateRecoveryCodes({ code: '345678' });
		await auth.deletePasskey('pk1', { code: '456789' });
		await auth.deletePasskey('pk2');

		expect(await bodiesTo(requests, '/api/vega-auth/totp/disable')).toEqual([{ code: '123456' }]);
		expect(await bodiesTo(requests, '/api/vega-auth/totp/enroll')).toEqual([{ code: '234567' }]);
		expect(await bodiesTo(requests, '/api/vega-auth/recovery/generate')).toEqual([
			{ code: '345678' }
		]);
		expect(await bodiesTo(requests, '/api/vega-auth/passkey/delete')).toEqual([
			{ id: 'pk1', code: '456789' },
			{ id: 'pk2' }
		]);
	});

	test('sin prueba no se manda cuerpo, como antes de que existiera', async () => {
		const { auth, requests } = await signedIn({
			'/api/vega-auth/totp/disable': () => jsonResponse({ ok: true })
		});

		await auth.disableTotp();

		expect(await bodiesTo(requests, '/api/vega-auth/totp/disable')).toEqual([null]);
	});

	test('añadir una passkey sin prueba se rechaza en begin, antes de llamar al navegador', async () => {
		const create = vi.fn();
		vi.stubGlobal('navigator', { credentials: { create, get: vi.fn() } });
		const { auth } = await signedIn({
			'/api/vega-auth/passkey/register/begin': () => stepUpRequired(['passkey'])
		});

		await expect(auth.registerPasskey('MacBook')).rejects.toMatchObject({
			code: 'step-up-required',
			methods: ['passkey']
		});
		expect(create).not.toHaveBeenCalled();
	});

	test('un código de prueba incorrecto es invalid-code y el bloqueo trae la espera', async () => {
		let attempts = 0;
		const { port, auth, reasons } = await signedIn({
			'/api/vega-auth/recovery/generate': () => {
				attempts += 1;
				return attempts === 1
					? jsonResponse({ error: 'invalid_code' }, 401)
					: jsonResponse({ error: 'locked', wait: 240 }, 429);
			}
		});

		await expect(auth.generateRecoveryCodes({ code: '000000' })).rejects.toMatchObject({
			kind: 'forbidden',
			code: 'invalid-code'
		});
		await expect(auth.generateRecoveryCodes({ code: '000000' })).rejects.toMatchObject({
			kind: 'backend',
			code: 'locked',
			waitSeconds: 240
		});
		expect(port.currentSession()?.user.id).toBe('ed1');
		expect(reasons).toEqual(['login']);
	});

	test('la verificación con passkey hace begin, la ceremonia WebAuthn y finish con la aserción', async () => {
		const bytes = (...values: number[]) => new Uint8Array(values).buffer;
		const get = vi.fn(async (_options: CredentialRequestOptions) => ({
			id: 'cred-1',
			rawId: bytes(1, 2, 3),
			type: 'public-key',
			response: {
				clientDataJSON: bytes(4, 5),
				authenticatorData: bytes(6, 7),
				signature: bytes(8, 9),
				userHandle: null
			}
		}));
		vi.stubGlobal('navigator', { credentials: { get } });
		const { auth, requests } = await signedIn({
			'/api/vega-auth/passkey/verify/begin': () =>
				jsonResponse({
					publicKey: {
						challenge: 'AQID',
						rpId: 'admin.example.test',
						userVerification: 'required',
						allowCredentials: [{ type: 'public-key', id: 'BAUG' }]
					}
				}),
			'/api/vega-auth/passkey/verify/finish': () => jsonResponse({ ok: true })
		});

		await expect(auth.verifyWithPasskey?.()).resolves.toBeUndefined();

		const publicKey = get.mock.calls[0][0].publicKey;
		expect(new Uint8Array(publicKey?.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
		expect(publicKey?.userVerification).toBe('required');
		expect(new Uint8Array(publicKey?.allowCredentials?.[0].id as ArrayBuffer)).toEqual(
			new Uint8Array([4, 5, 6])
		);
		expect(await bodiesTo(requests, '/api/vega-auth/passkey/verify/finish')).toEqual([
			{
				id: 'cred-1',
				rawId: 'AQID',
				type: 'public-key',
				response: {
					clientDataJSON: 'BAU',
					authenticatorData: 'Bgc',
					signature: 'CAk',
					userHandle: null
				}
			}
		]);
	});

	test('una passkey que no verifica, una cuenta sin passkeys y una ceremonia cancelada no caducan la sesión', async () => {
		const get = vi.fn(async () => {
			throw new DOMException('cancelado', 'NotAllowedError');
		});
		vi.stubGlobal('navigator', { credentials: { get } });
		let begin: () => Response = () => jsonResponse({ error: 'no_passkeys' }, 400);
		const { port, auth, reasons } = await signedIn({
			'/api/vega-auth/passkey/verify/begin': () => begin(),
			'/api/vega-auth/passkey/verify/finish': () => jsonResponse({ error: 'verify_failed' }, 400)
		});

		await expect(auth.verifyWithPasskey?.()).rejects.toMatchObject({ code: 'no-passkeys' });

		begin = () => jsonResponse({ publicKey: { challenge: 'AQID' } });
		await expect(auth.verifyWithPasskey?.()).rejects.toMatchObject({ kind: 'backend' });

		get.mockImplementationOnce(
			async () =>
				({
					id: 'cred-1',
					rawId: new ArrayBuffer(1),
					type: 'public-key',
					response: {
						clientDataJSON: new ArrayBuffer(1),
						authenticatorData: new ArrayBuffer(1),
						signature: new ArrayBuffer(1),
						userHandle: null
					}
				}) as never
		);
		await expect(auth.verifyWithPasskey?.()).rejects.toMatchObject({
			kind: 'forbidden',
			code: 'passkey-verify-failed'
		});
		expect(port.currentSession()?.user.id).toBe('ed1');
		expect(reasons).toEqual(['login']);
	});

	test('413 y 503 attempt_failed tienen código propio y el 429 de /totp/verify no caduca la sesión', async () => {
		const { port, auth, reasons } = await signedIn({
			'/api/vega-auth/passkey/verify/begin': () =>
				jsonResponse({ error: 'payload_too_large' }, 413),
			'/api/vega-auth/totp/verify': () => jsonResponse({ error: 'locked', wait: 30 }, 429)
		});
		vi.stubGlobal('navigator', { credentials: { get: vi.fn() } });

		await expect(auth.verifyWithPasskey?.()).rejects.toMatchObject({
			kind: 'backend',
			code: 'payload-too-large'
		});
		await expect(auth.verifyTotp('123456')).rejects.toMatchObject({
			code: 'locked',
			waitSeconds: 30
		});
		expect(port.currentSession()?.user.id).toBe('ed1');
		expect(reasons).toEqual(['login']);
	});

	test('un login que el servidor no pudo contar da attempt-failed, no credenciales incorrectas', async () => {
		stubFetch({
			'/api/vega-auth/login/password': () => jsonResponse({ error: 'attempt_failed' }, 503)
		});
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth'
		});

		await expect(
			port.strongAuth?.loginWithPassword({ email: 'editor@example.com', password: 'secret' })
		).rejects.toMatchObject({ kind: 'backend', code: 'attempt-failed' });
	});

	test('verifyTotp manda la prueba en proof, aparte del código del secreto nuevo, y solo si la hay', async () => {
		let answer: () => Response = () => stepUpRequired(['totp']);
		const { auth, requests } = await signedIn({
			'/api/vega-auth/totp/verify': () => answer()
		});

		await expect(auth.verifyTotp('654321')).rejects.toMatchObject({
			code: 'step-up-required',
			methods: ['totp']
		});
		answer = () => jsonResponse({ ok: true });
		await auth.verifyTotp('654321', { code: '111222' });

		expect(await bodiesTo(requests, '/api/vega-auth/totp/verify')).toEqual([
			{ code: '654321' },
			{ code: '654321', proof: '111222' }
		]);
	});

	test('un alta caducada o ya descartada tiene código propio y no caduca la sesión', async () => {
		let error = 'enrollment_expired';
		const { port, auth, reasons } = await signedIn({
			'/api/vega-auth/totp/verify': () => jsonResponse({ error }, 400)
		});

		await expect(auth.verifyTotp('654321')).rejects.toMatchObject({
			kind: 'forbidden',
			code: 'enrollment-expired'
		});
		error = 'not_enrolled';
		await expect(auth.verifyTotp('654321')).rejects.toMatchObject({
			kind: 'forbidden',
			code: 'not-enrolled'
		});
		expect(port.currentSession()?.user.id).toBe('ed1');
		expect(reasons).toEqual(['login']);
	});

	test('getStatus conserva el aviso de passkey posiblemente copiada', async () => {
		const { auth } = await signedIn({
			'/api/vega-auth/passkey/list': () =>
				jsonResponse({
					passkeys: [
						{ id: 'pk1', name: 'Llave', created: '2026-09-30', cloneWarning: true },
						{ id: 'pk2', name: 'Touch ID', created: '2026-09-30', cloneWarning: false }
					]
				}),
			'/api/vega-auth/recovery/count': () => jsonResponse({ remaining: 8 })
		});

		const status = await auth.getStatus();

		expect(status.passkeys.map((passkey) => passkey.cloneWarning)).toEqual([true, false]);
	});
});
