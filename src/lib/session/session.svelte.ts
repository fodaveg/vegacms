/**
 * Estado reactivo de sesión (Fase 2, §3.1 del contrato P3): envuelve `restoreSession`/`login`/
 * `logout`/`onAuthChange` del `BackendPort` en runas Svelte 5. Publicado en un contexto propio
 * (`setSessionContext`/`getSessionContext`, distinto de `VegaAppContext`) porque `/login` lo
 * necesita ANTES de que exista sesión — y `VegaAppContext.session` (§2.1) es, por contrato,
 * `Session` no-nulo (garantizado solo dentro de rutas protegidas).
 *
 * Recibe `getPort: () => Promise<BackendPort>` (típicamente `getBackend` de `backend.ts`), NUNCA
 * un `BackendPort` ya resuelto: así `createSessionStore()` se puede llamar de forma SÍNCRONA en
 * la inicialización de `+layout.svelte` (`setContext` exige eso) sin esperar a que se resuelva
 * la URL del backend (§3.7, fetch de `vega.config.json`). El puerto se resuelve perezosamente,
 * la primera vez que se llama a `restore()`/`login()`.
 */

import { getContext, setContext } from 'svelte';
import type { BackendPort, SecondFactorMethod, Session } from '$lib/backend';
import { VegaError } from '$lib/backend';

export type SessionStatus = 'loading' | 'ready' | 'network-error' | 'error';

export interface MfaChallenge {
	pending: string;
	methods: SecondFactorMethod[];
}

export interface SessionStore {
	/** Sesión activa, o `null` si no la hay (aún cargando, sin token, caducada o tras logout). */
	readonly session: Session | null;
	/** Estado de arranque/transporte (§3.1.1): `network-error`/`error` ⇒ pantalla honesta + Reintentar. */
	readonly status: SessionStatus;
	/**
	 * `VegaError` de transporte NO-`network` que abortó `restore()` (típicamente `backend` 5xx con
	 * token quizá válido, §3.4/§6.7). Acompaña a `status === 'error'` para que el layout pinte un
	 * mensaje honesto (P3-L3) en vez de un login silencioso. `null` mientras no haya ese fallo.
	 */
	readonly restoreError: VegaError | null;
	/**
	 * `true` tras `onAuthChange('expired')` (§3.1.3): el punto de extensión para el overlay de
	 * re-login no destructivo que monta Fase 2b. Esta fase NO pinta el overlay; solo mantiene la
	 * bandera y `clearExpired()` para que Fase 2b la conecte sin reabrir este módulo.
	 */
	readonly expired: boolean;
	/** Último error de `login()`, para que el formulario lo pinte. `null` tras un intento exitoso. */
	readonly loginError: VegaError | null;
	/** La instancia configurada ofrece TOTP/recuperación/passkeys además de password. */
	readonly strongAuthAvailable: boolean;
	/** Reto abierto tras validar password, o `null` fuera del segundo paso. */
	readonly mfaChallenge: MfaChallenge | null;
	/** El `BackendPort` YA resuelto. Solo válido de leer tras un `restore()`/`login()` con sesión
	 *  (que es justo cuando `VegaAppContext.port`, §2.1, puede necesitarlo — sesión garantizada,
	 *  P3-L2). Lanza si se lee antes: bug de orquestación del layout, no un estado válido de UI. */
	readonly port: BackendPort;
	/** Arranque (§3.1.1): restaura desde token persistido. Nunca lanza; refleja el resultado en
	 *  `status`/`session`. */
	restore(): Promise<void>;
	/** Alias semántico de `restore()` para el botón "Reintentar" de la pantalla `network-error`. */
	retryRestore(): Promise<void>;
	/** Login (§3.1.2). Nunca lanza: el resultado se refleja en `session`/`loginError`. */
	login(credentials: { email: string; password: string }): Promise<void>;
	loginWithTotp(code: string): Promise<void>;
	loginWithRecovery(code: string): Promise<void>;
	loginWithPasskey(): Promise<void>;
	cancelMfa(): void;
	/** Logout (§3.1.5): `logout()` de P1 nunca falla. Limpia sesión vía `onAuthChange('logout')`. */
	logout(): Promise<void>;
	/** Descarta la bandera `expired` (la llamará el overlay de Fase 2b tras reautenticar). */
	clearExpired(): void;
}

/**
 * Construye el `SessionStore` reactivo. Se llama UNA vez, en `+layout.svelte`, y se publica con
 * `setSessionContext` para que `/login` y `AppShell` lo consuman sin volver a instanciarlo.
 */
export function createSessionStore(getPort: () => Promise<BackendPort>): SessionStore {
	let session = $state<Session | null>(null);
	let status = $state<SessionStatus>('loading');
	let expired = $state(false);
	let loginError = $state<VegaError | null>(null);
	let restoreError = $state<VegaError | null>(null);
	let strongAuthAvailable = $state(false);
	let mfaChallenge = $state<MfaChallenge | null>(null);

	// No reactivos a propósito: cachés internas de orquestación, no estado que la UI deba pintar.
	let resolvedPort: BackendPort | null = null;
	let authSubscribed = false;

	async function ensurePort(): Promise<BackendPort> {
		const port = await getPort();
		if (!authSubscribed) {
			authSubscribed = true;
			// Suscripción ÚNICA (§3.1.3): 'expired' marca la bandera para el overlay de Fase 2b sin
			// tocar `session` (el trabajo en memoria de P5 no se pierde); 'logout'/'login'/'restored'
			// reflejan la sesión tal cual.
			port.onAuthChange((next, reason) => {
				if (reason === 'expired') {
					expired = true;
					return;
				}
				session = next;
				if (reason === 'logout') expired = false;
			});
		}
		resolvedPort = port;
		strongAuthAvailable = port.capabilities.strongAuth && Boolean(port.strongAuth);
		return port;
	}

	async function restore(): Promise<void> {
		status = 'loading';
		restoreError = null;
		try {
			const port = await ensurePort();
			// `restoreSession()` devuelve `null` (no lanza) cuando NO hay token o está caducado
			// (§3.1.1): eso es "sin sesión", no un error — el guard manda a /login. Solo un fallo
			// de TRANSPORTE lanza aquí.
			session = await port.restoreSession();
			status = 'ready';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError
					? err
					: VegaError.backend('Error inesperado al restaurar la sesión', err);
			session = null;
			if (vegaErr.kind === 'network') {
				// Sin red: el token se conserva (P1 §4.1); pantalla "sin conexión" + Reintentar.
				status = 'network-error';
			} else {
				// Fallo de transporte NO-red (p.ej. `backend` 5xx con token quizá válido): pantalla
				// honesta (P3-L3/§3.4), NO login silencioso — enmascararlo como "sin sesión" mandaría
				// al usuario a /login sin explicación pese a que el token no se ha descartado.
				restoreError = vegaErr;
				status = 'error';
			}
		}
	}

	async function login(credentials: { email: string; password: string }): Promise<void> {
		loginError = null;
		try {
			const port = await ensurePort();
			if (port.capabilities.strongAuth && port.strongAuth) {
				const outcome = await port.strongAuth.loginWithPassword(credentials);
				if (outcome.kind === 'mfa-required') {
					mfaChallenge = { pending: outcome.pending, methods: outcome.methods };
					return;
				}
				session = outcome.session;
			} else {
				session = await port.login(credentials);
			}
			mfaChallenge = null;
		} catch (err) {
			loginError =
				err instanceof VegaError ? err : VegaError.backend('Error inesperado al entrar', err);
		}
	}

	async function completeMfa(method: 'totp' | 'recovery', code: string): Promise<void> {
		loginError = null;
		try {
			const port = await ensurePort();
			const challenge = mfaChallenge;
			if (!challenge || !port.strongAuth) {
				throw VegaError.backend('El reto de verificación ya no está disponible.');
			}
			session =
				method === 'totp'
					? await port.strongAuth.loginWithTotp(challenge.pending, code)
					: await port.strongAuth.loginWithRecovery(challenge.pending, code);
			mfaChallenge = null;
		} catch (err) {
			loginError =
				err instanceof VegaError ? err : VegaError.backend('Error inesperado al verificar', err);
		}
	}

	async function loginWithPasskey(): Promise<void> {
		loginError = null;
		try {
			const port = await ensurePort();
			if (!port.strongAuth) throw VegaError.backend('Las passkeys no están disponibles.');
			session = await port.strongAuth.loginWithPasskey();
			mfaChallenge = null;
		} catch (err) {
			loginError =
				err instanceof VegaError
					? err
					: VegaError.backend('Error inesperado al entrar con passkey', err);
		}
	}

	async function logout(): Promise<void> {
		if (!resolvedPort) return; // nunca llegó a autenticar: no hay sesión que cerrar
		await resolvedPort.logout();
		mfaChallenge = null;
	}

	return {
		get session() {
			return session;
		},
		get status() {
			return status;
		},
		get expired() {
			return expired;
		},
		get loginError() {
			return loginError;
		},
		get restoreError() {
			return restoreError;
		},
		get strongAuthAvailable() {
			return strongAuthAvailable;
		},
		get mfaChallenge() {
			return mfaChallenge;
		},
		get port(): BackendPort {
			if (!resolvedPort) {
				throw new Error(
					'SessionStore.port leído antes de resolver el BackendPort (bug de orquestación de +layout.svelte).'
				);
			}
			return resolvedPort;
		},
		restore,
		retryRestore: restore,
		login,
		loginWithTotp(code) {
			return completeMfa('totp', code);
		},
		loginWithRecovery(code) {
			return completeMfa('recovery', code);
		},
		loginWithPasskey,
		cancelMfa() {
			mfaChallenge = null;
			loginError = null;
		},
		logout,
		clearExpired() {
			expired = false;
		}
	};
}

const SESSION_CONTEXT_KEY = Symbol('vega-session-store');

/** Publica el `SessionStore` para que `/login` y `AppShell` lo lean con `getSessionContext()`. */
export function setSessionContext(store: SessionStore): void {
	setContext(SESSION_CONTEXT_KEY, store);
}

/** Lee el `SessionStore` publicado por `+layout.svelte`. Lanza fuera de ese árbol (bug de montaje). */
export function getSessionContext(): SessionStore {
	const store = getContext<SessionStore | undefined>(SESSION_CONTEXT_KEY);
	if (!store) {
		throw new Error(
			'getSessionContext() llamado fuera de un árbol con setSessionContext() (falta el layout de Vega).'
		);
	}
	return store;
}
