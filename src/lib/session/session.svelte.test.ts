import { describe, expect, test, vi } from 'vitest';
import type { BackendPort, SecondFactorMethod, Session, StrongAuthPort } from '$lib/backend';
import { VegaError } from '$lib/backend';
import { createSessionStore } from './session.svelte';

const SESSION: Session = {
	token: 'token',
	user: { id: 'editor-1', email: 'editor@example.com' },
	expiresAt: null
};

function strongAuthPort(overrides: Partial<StrongAuthPort> = {}): StrongAuthPort {
	return {
		loginWithPassword: vi.fn(async () => ({
			kind: 'mfa-required' as const,
			pending: 'pending-1',
			methods: ['totp', 'recovery'] as SecondFactorMethod[]
		})),
		loginWithTotp: vi.fn(async () => SESSION),
		loginWithRecovery: vi.fn(async () => SESSION),
		loginWithPasskey: vi.fn(async () => SESSION),
		getStatus: vi.fn(),
		enrollTotp: vi.fn(),
		verifyTotp: vi.fn(),
		disableTotp: vi.fn(),
		generateRecoveryCodes: vi.fn(),
		registerPasskey: vi.fn(),
		deletePasskey: vi.fn(),
		...overrides
	};
}

function portWithStrongAuth(strongAuth: StrongAuthPort): BackendPort {
	return {
		capabilities: {
			realtime: true,
			thumbs: true,
			schemaDiscovery: false,
			filePerRecord: true,
			protectedFiles: false,
			schemaBootstrap: false,
			strongAuth: true
		},
		strongAuth,
		restoreSession: vi.fn(async () => null),
		login: vi.fn(async () => SESSION),
		logout: vi.fn(async () => undefined),
		currentSession: vi.fn(() => null),
		onAuthChange: vi.fn(() => () => undefined)
	} as unknown as BackendPort;
}

describe('SessionStore strong auth', () => {
	test('mantiene el reto tras password y solo crea sesión al validar TOTP', async () => {
		const auth = strongAuthPort();
		const store = createSessionStore(async () => portWithStrongAuth(auth));

		await store.login({ email: 'editor@example.com', password: 'secret' });
		expect(store.session).toBeNull();
		expect(store.mfaChallenge).toEqual({
			pending: 'pending-1',
			methods: ['totp', 'recovery']
		});

		await store.loginWithTotp('123456');
		expect(auth.loginWithTotp).toHaveBeenCalledWith('pending-1', '123456');
		expect(store.session).toEqual(SESSION);
		expect(store.mfaChallenge).toBeNull();
	});

	test('un código incorrecto conserva el reto para reintentar o usar recuperación', async () => {
		const auth = strongAuthPort({
			loginWithTotp: vi.fn(async () => {
				throw VegaError.forbidden('invalid code');
			})
		});
		const store = createSessionStore(async () => portWithStrongAuth(auth));

		await store.login({ email: 'editor@example.com', password: 'secret' });
		await store.loginWithTotp('000000');

		expect(store.loginError?.kind).toBe('forbidden');
		expect(store.mfaChallenge?.pending).toBe('pending-1');
		expect(store.session).toBeNull();
	});

	test('la passkey autentica sin pedir email ni password', async () => {
		const auth = strongAuthPort();
		const store = createSessionStore(async () => portWithStrongAuth(auth));

		await store.loginWithPasskey();

		expect(auth.loginWithPasskey).toHaveBeenCalledOnce();
		expect(store.session).toEqual(SESSION);
	});

	// Los pasos de entrada dicen si ESA llamada obtuvo sesión: `ReloginModal` se apoya en ello
	// porque con la sesión caducada `session` sigue siendo la antigua y no distingue nada.
	test('cada paso resuelve a `true` solo cuando obtiene sesión: ni reto abierto ni fallo', async () => {
		const loginWithTotp = vi
			.fn<StrongAuthPort['loginWithTotp']>()
			.mockRejectedValueOnce(VegaError.forbidden('invalid code'))
			.mockResolvedValueOnce(SESSION);
		const loginWithPasskey = vi
			.fn<StrongAuthPort['loginWithPasskey']>()
			.mockRejectedValueOnce(VegaError.backend('No se obtuvo ninguna passkey.'))
			.mockResolvedValueOnce(SESSION);
		const store = createSessionStore(async () =>
			portWithStrongAuth(strongAuthPort({ loginWithTotp, loginWithPasskey }))
		);

		expect(await store.login({ email: 'editor@example.com', password: 'secret' })).toBe(false);
		expect(store.loginError).toBeNull();
		expect(await store.loginWithTotp('000000')).toBe(false);
		expect(await store.loginWithTotp('123456')).toBe(true);
		expect(await store.loginWithTotp('123456')).toBe(false); // el reto ya se consumió
		expect(await store.loginWithPasskey()).toBe(false);
		expect(await store.loginWithPasskey()).toBe(true);
	});

	test('sin extensión de auth fuerte, `login()` va por `port.login` y resuelve a `true`', async () => {
		const port = portWithStrongAuth(strongAuthPort());
		const vanilla = {
			...port,
			capabilities: { ...port.capabilities, strongAuth: false },
			strongAuth: undefined
		} as unknown as BackendPort;
		const store = createSessionStore(async () => vanilla);

		expect(await store.login({ email: 'editor@example.com', password: 'secret' })).toBe(true);
		expect(vanilla.login).toHaveBeenCalledOnce();
		expect(store.strongAuthAvailable).toBe(false);
		expect(store.mfaChallenge).toBeNull();
	});
});
