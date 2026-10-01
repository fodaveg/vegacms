/**
 * `createLoginFlow`: los pasos de entrada que comparten `/login` y `ReloginModal.svelte`. Se
 * prueba contra un `SessionStore` de mentira (lo que interesa aquí es el flujo: qué manda al
 * store, qué devuelve y cómo traduce el error). El acuerdo con el store real y con el overlay
 * está en `session.svelte.test.ts` y en `shell/ReloginModal.svelte.test.ts`.
 */
import { describe, expect, test, vi } from 'vitest';
import { VegaError } from '$lib/backend';
import { createLoginFlow } from './login-flow.svelte';
import type { MfaChallenge, SessionStore } from './session.svelte';

const t = (key: string): string => key;

interface FakeStore {
	loginError: VegaError | null;
	mfaChallenge: MfaChallenge | null;
	login: ReturnType<typeof vi.fn>;
	loginWithTotp: ReturnType<typeof vi.fn>;
	loginWithRecovery: ReturnType<typeof vi.fn>;
	loginWithPasskey: ReturnType<typeof vi.fn>;
	cancelMfa: ReturnType<typeof vi.fn>;
}

function fakeStore(overrides: Partial<FakeStore> = {}): FakeStore {
	return {
		loginError: null,
		mfaChallenge: null,
		login: vi.fn(async () => true),
		loginWithTotp: vi.fn(async () => true),
		loginWithRecovery: vi.fn(async () => true),
		loginWithPasskey: vi.fn(async () => true),
		cancelMfa: vi.fn(),
		...overrides
	};
}

function flowOver(store: FakeStore) {
	return createLoginFlow(store as unknown as SessionStore, t);
}

describe('createLoginFlow', () => {
	test('cada envío manda sus campos al store y devuelve lo que el store diga', async () => {
		const store = fakeStore({ login: vi.fn(async () => false) });
		const flow = flowOver(store);
		flow.email = 'editor@example.com';
		flow.password = 'secret';
		flow.totpCode = '123456';
		flow.recoveryCode = 'ABCDE-12345';

		// `false` = reto abierto o fallo: los campos se conservan para el paso siguiente.
		expect(await flow.submitPassword()).toBe(false);
		expect(store.login).toHaveBeenCalledWith({ email: 'editor@example.com', password: 'secret' });
		expect(flow.password).toBe('secret');

		expect(await flow.submitRecovery()).toBe(true);
		expect(store.loginWithRecovery).toHaveBeenCalledWith('ABCDE-12345');
	});

	test('con sesión nueva vacía los campos: ni contraseña ni códigos se quedan en memoria', async () => {
		const store = fakeStore();
		const flow = flowOver(store);
		flow.email = 'editor@example.com';
		flow.password = 'secret';
		flow.totpCode = '123456';

		expect(await flow.submitTotp()).toBe(true);

		expect(store.loginWithTotp).toHaveBeenCalledWith('123456');
		expect([flow.email, flow.password, flow.totpCode, flow.recoveryCode]).toEqual(['', '', '', '']);
		expect(flow.submitting).toBe(false);
	});

	test('un segundo envío con otro en vuelo se ignora', async () => {
		let release: (value: boolean) => void = () => undefined;
		const store = fakeStore({
			loginWithPasskey: vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
		});
		const flow = flowOver(store);

		const first = flow.submitPasskey();
		expect(flow.submitting).toBe(true);
		expect(await flow.submitPassword()).toBe(false);
		expect(store.login).not.toHaveBeenCalled();

		release(true);
		expect(await first).toBe(true);
		expect(flow.submitting).toBe(false);
	});

	test('mapea el error por `kind`, y `forbidden` según haya o no reto abierto', () => {
		const store = fakeStore();
		const flow = flowOver(store);
		expect(flow.errorMessage).toBeNull();

		store.loginError = VegaError.network('sin red');
		expect(flow.errorMessage).toBe('login.networkError');

		store.loginError = VegaError.forbidden('no');
		expect(flow.errorMessage).toBe('login.invalidCredentials');
		store.mfaChallenge = { pending: 'pending-1', methods: ['totp'] };
		expect(flow.errorMessage).toBe('login.mfa.invalidCode');

		// Cualquier otro fallo, con su mensaje real: un 500 no se disfraza de credenciales.
		store.loginError = VegaError.backend('El servidor respondió 500.');
		expect(flow.errorMessage).toBe('El servidor respondió 500.');
	});

	test('`cancelMfa` cierra el reto en el store y descarta los códigos, no la contraseña', () => {
		const store = fakeStore();
		const flow = flowOver(store);
		flow.password = 'secret';
		flow.totpCode = '123456';
		flow.recoveryCode = 'ABCDE-12345';

		flow.cancelMfa();

		expect(store.cancelMfa).toHaveBeenCalledOnce();
		expect([flow.password, flow.totpCode, flow.recoveryCode]).toEqual(['secret', '', '']);
	});
});
