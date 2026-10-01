/**
 * `ReloginModal.svelte`: cuándo se da por resuelta la reentrada tras caducar la sesión (audit del
 * 30 sep 2026). El overlay decidía el éxito con `session && !loginError`, y con la sesión
 * caducada `session` sigue siendo la antigua: una contraseña correcta con el segundo factor
 * pendiente cerraba el overlay sin sesión nueva, y una cuenta solo con passkey no podía reentrar.
 *
 * Se monta sobre un `SessionStore` REAL (`createSessionStore`) con un `BackendPort` de mentira,
 * no sobre un store falso: lo que se prueba es justo el acuerdo entre los dos. La caducidad se
 * provoca como en producción, por el `onAuthChange('expired')` del puerto. El recorrido en
 * navegador del caso de solo contraseña está en `e2e/relogin.spec.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
	AuthChangeReason,
	BackendPort,
	SecondFactorMethod,
	Session,
	StrongAuthPort
} from '$lib/backend';
import { VegaError } from '$lib/backend';
import {
	createSessionStore,
	SESSION_CONTEXT_KEY,
	type SessionStore
} from '$lib/session/session.svelte';
import ReloginModal from './ReloginModal.svelte';

const STALE: Session = {
	token: 'token-caducado',
	user: { id: 'editor-1', email: 'editor@example.com' },
	expiresAt: null
};
const FRESH: Session = { ...STALE, token: 'token-nuevo' };

function mfaRequired(methods: SecondFactorMethod[] = ['totp', 'recovery']) {
	return vi.fn(async () => ({ kind: 'mfa-required' as const, pending: 'pending-1', methods }));
}

function strongAuthPort(overrides: Partial<StrongAuthPort> = {}): StrongAuthPort {
	return {
		loginWithPassword: vi.fn(async () => ({ kind: 'authenticated' as const, session: FRESH })),
		loginWithTotp: vi.fn(async () => FRESH),
		loginWithRecovery: vi.fn(async () => FRESH),
		loginWithPasskey: vi.fn(async () => FRESH),
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

interface Harness {
	store: SessionStore;
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	/** `port.login`, el camino SIN extensión `vegaauth`. */
	login: ReturnType<typeof vi.fn>;
	/** Campo de un formulario sin guardar, dentro de la carcasa que el overlay tapa. */
	draft: HTMLInputElement;
	shell: HTMLElement;
}

/**
 * Arranca con sesión restaurada, la caduca por `onAuthChange('expired')` y monta el overlay.
 * `strongAuth: null` = instancia sin la extensión `vegaauth` (hoy, todas las desplegadas).
 */
async function mountExpired(
	strongAuth: StrongAuthPort | null,
	login: ReturnType<typeof vi.fn> = vi.fn(async () => FRESH)
): Promise<Harness> {
	let notify: ((s: Session | null, reason: AuthChangeReason) => void) | null = null;
	const port = {
		capabilities: {
			realtime: true,
			thumbs: true,
			schemaDiscovery: false,
			filePerRecord: true,
			protectedFiles: false,
			schemaBootstrap: false,
			strongAuth: strongAuth !== null
		},
		...(strongAuth ? { strongAuth } : {}),
		restoreSession: vi.fn(async () => STALE),
		login,
		logout: vi.fn(async () => undefined),
		currentSession: vi.fn(() => null),
		onAuthChange: (cb: (s: Session | null, reason: AuthChangeReason) => void) => {
			notify = cb;
			return () => undefined;
		}
	} as unknown as BackendPort;

	const store = createSessionStore(async () => port);
	await store.restore();
	notify!(null, 'expired');

	const shell = document.createElement('div');
	shell.id = 'vega-app-shell';
	const draft = document.createElement('input');
	draft.value = 'borrador sin guardar';
	shell.appendChild(draft);
	document.body.appendChild(shell);

	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(ReloginModal, {
		target,
		context: new Map([[SESSION_CONTEXT_KEY, store]])
	});
	await settle();
	return { store, target, instance, login, draft, shell };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 6; i++) await Promise.resolve();
	await tick();
}

function dialog(h: Harness): HTMLElement | null {
	return h.target.querySelector<HTMLElement>('[role="dialog"]');
}

function type(h: Harness, selector: string, value: string): void {
	const el = h.target.querySelector<HTMLInputElement>(selector);
	if (!el) throw new Error(`No hay ${selector} en el overlay`);
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function submit(h: Harness, fieldSelector: string): Promise<void> {
	await tick();
	h.target.querySelector<HTMLInputElement>(fieldSelector)!.form!.requestSubmit();
	await settle();
}

async function submitPassword(h: Harness, password = 'secret'): Promise<void> {
	type(h, '#relogin-email', 'editor@example.com');
	type(h, '#relogin-password', password);
	await submit(h, '#relogin-password');
}

function buttonByText(h: Harness, text: string): HTMLButtonElement | null {
	return (
		Array.from(h.target.querySelectorAll<HTMLButtonElement>('button')).find(
			(b) => b.textContent?.trim() === text
		) ?? null
	);
}

/** El overlay sigue abierto, obligatorio, y la vista de debajo intacta (sesión antigua no-nula:
 *  es lo que impide que el guard de rutas la desmonte). */
function expectStillOpen(h: Harness): void {
	expect(dialog(h)).not.toBeNull();
	expect(h.store.expired).toBe(true);
	expect(h.store.session).toEqual(STALE);
	expect(h.shell.inert).toBe(true);
	expect(h.draft.value).toBe('borrador sin guardar');
}

/** Resuelto de verdad: sin overlay, con la sesión NUEVA y el borrador de debajo donde estaba. */
function expectResolved(h: Harness): void {
	expect(dialog(h)).toBeNull();
	expect(h.store.expired).toBe(false);
	expect(h.store.session).toEqual(FRESH);
	expect(h.store.mfaChallenge).toBeNull();
	expect(h.shell.inert).toBe(false);
	expect(h.draft.value).toBe('borrador sin guardar');
}

describe('ReloginModal', () => {
	let h: Harness | null = null;

	beforeEach(() => {
		// El overlay resuelve su idioma de `navigator.language`; jsdom dice `en-US` y `en` se carga
		// perezoso. Se fija `es` para comprobar textos reales en vez de claves.
		vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
	});

	afterEach(async () => {
		if (h) {
			await unmount(h.instance);
			h.target.remove();
			h.shell.remove();
			h = null;
		}
		vi.restoreAllMocks();
	});

	test('sin vegaauth, contraseña sola: resuelto, y no ofrece passkey', async () => {
		h = await mountExpired(null);
		expectStillOpen(h);
		expect(dialog(h)!.getAttribute('data-relogin-state')).toBe('password');
		expect(buttonByText(h, 'Entrar con passkey')).toBeNull();

		await submitPassword(h);

		expect(h.login).toHaveBeenCalledWith({ email: 'editor@example.com', password: 'secret' });
		expectResolved(h);
	});

	test('sin vegaauth, contraseña incorrecta: sigue abierto con el mensaje neutro', async () => {
		h = await mountExpired(
			null,
			vi.fn(async () => {
				throw VegaError.forbidden('bad credentials');
			})
		);

		await submitPassword(h, 'incorrecta');

		expectStillOpen(h);
		expect(h.target.querySelector('[role="alert"]')?.textContent).toBe('Credenciales no válidas.');
	});

	test('con vegaauth y cuenta sin segundo factor: la contraseña sola resuelve', async () => {
		const auth = strongAuthPort();
		h = await mountExpired(auth);

		await submitPassword(h);

		expect(auth.loginWithPassword).toHaveBeenCalledOnce();
		expect(h.login).not.toHaveBeenCalled();
		expectResolved(h);
	});

	test('contraseña con mfaChallenge: NO resuelto hasta completar el TOTP', async () => {
		const auth = strongAuthPort({ loginWithPassword: mfaRequired() });
		h = await mountExpired(auth);

		await submitPassword(h);

		// La regresión: aquí el overlay se cerraba con la sesión antigua todavía puesta.
		expectStillOpen(h);
		expect(h.store.mfaChallenge?.pending).toBe('pending-1');
		expect(dialog(h)!.getAttribute('data-relogin-state')).toBe('mfa');
		expect(h.target.querySelector('#relogin-password')).toBeNull();
		expect(document.activeElement).toBe(h.target.querySelector('#relogin-totp'));
		expect(auth.loginWithTotp).not.toHaveBeenCalled();

		type(h, '#relogin-totp', '123456');
		await submit(h, '#relogin-totp');

		expect(auth.loginWithTotp).toHaveBeenCalledWith('pending-1', '123456');
		expectResolved(h);
	});

	test('error en el segundo factor: sigue abierto con mensaje y deja reintentar', async () => {
		const loginWithTotp = vi
			.fn<StrongAuthPort['loginWithTotp']>()
			.mockRejectedValueOnce(VegaError.forbidden('invalid code'))
			.mockResolvedValueOnce(FRESH);
		const auth = strongAuthPort({ loginWithPassword: mfaRequired(), loginWithTotp });
		h = await mountExpired(auth);
		await submitPassword(h);

		type(h, '#relogin-totp', '000000');
		await submit(h, '#relogin-totp');

		expectStillOpen(h);
		expect(dialog(h)!.getAttribute('data-relogin-state')).toBe('mfa');
		expect(h.store.mfaChallenge?.pending).toBe('pending-1');
		expect(h.target.querySelector('[role="alert"]')?.textContent).toBe('El código no es válido.');

		type(h, '#relogin-totp', '123456');
		await submit(h, '#relogin-totp');

		expect(loginWithTotp).toHaveBeenLastCalledWith('pending-1', '123456');
		expectResolved(h);
	});

	test('segundo factor con código de recuperación como único método: resuelve', async () => {
		const auth = strongAuthPort({ loginWithPassword: mfaRequired(['recovery']) });
		h = await mountExpired(auth);
		await submitPassword(h);

		expectStillOpen(h);
		expect(h.target.querySelector('#relogin-totp')).toBeNull();
		expect(h.target.querySelector<HTMLDetailsElement>('details')!.open).toBe(true);

		type(h, '#relogin-recovery', 'ABCDE-12345');
		await submit(h, '#relogin-recovery');

		expect(auth.loginWithRecovery).toHaveBeenCalledWith('pending-1', 'ABCDE-12345');
		expectResolved(h);
	});

	test('«Volver a la contraseña» abandona el reto sin cerrar el overlay', async () => {
		const auth = strongAuthPort({ loginWithPassword: mfaRequired() });
		h = await mountExpired(auth);
		await submitPassword(h);

		buttonByText(h, 'Volver a la contraseña')!.click();
		await settle();

		expectStillOpen(h);
		expect(h.store.mfaChallenge).toBeNull();
		expect(dialog(h)!.getAttribute('data-relogin-state')).toBe('password');
		expect(document.activeElement).toBe(h.target.querySelector('#relogin-email'));
	});

	test('cuenta solo passkey: reentra sin teclear contraseña', async () => {
		const auth = strongAuthPort();
		h = await mountExpired(auth);

		buttonByText(h, 'Entrar con passkey')!.click();
		await settle();

		expect(auth.loginWithPasskey).toHaveBeenCalledOnce();
		expect(auth.loginWithPassword).not.toHaveBeenCalled();
		expect(h.login).not.toHaveBeenCalled();
		expectResolved(h);
	});

	test('passkey cancelada o rechazada: sigue abierto con el mensaje del fallo', async () => {
		const auth = strongAuthPort({
			loginWithPasskey: vi.fn(async () => {
				throw VegaError.backend('No se obtuvo ninguna passkey.');
			})
		});
		h = await mountExpired(auth);

		buttonByText(h, 'Entrar con passkey')!.click();
		await settle();

		expectStillOpen(h);
		expect(h.target.querySelector('[role="alert"]')?.textContent).toBe(
			'No se obtuvo ninguna passkey.'
		);
	});
});
