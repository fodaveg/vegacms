/** Autenticación y expiración de sesión de una instancia `memory`. */

import type { AuthChangeReason, Session } from '../../types';
import type { BackendPort } from '../../port';
import { VegaError } from '../../errors';
import type { MemoryState } from './state';

const DEFAULT_USER_EMAIL = 'admin@vega.test';

type MemoryAuthOps = Pick<
	BackendPort,
	'login' | 'logout' | 'currentSession' | 'restoreSession' | 'onAuthChange'
> & {
	checkSessionAlive(): void;
};

/** La sesión y sus subscriptores pertenecen solo a este backend. */
export function createAuthOps(state: MemoryState): MemoryAuthOps {
	const { seed } = state;
	const usingDefaultSeed = seed === undefined;
	const users = seed?.users ?? [];
	const sessionTtlMs = seed?.sessionTtlMs;
	let currentSessionState: { session: Session; expiresAtMs: number | null } | null = null;
	let latchedExpired = false;
	const authSubscribers = new Set<(s: Session | null, reason: AuthChangeReason) => void>();

	function notifyAuthChange(s: Session | null, reason: AuthChangeReason): void {
		for (const cb of authSubscribers) cb(s, reason);
	}

	/** PB también rechaza lecturas y escrituras si aún no se ha iniciado sesión. */
	function checkSessionAlive(): void {
		if (latchedExpired) throw VegaError.authExpired();
		if (currentSessionState === null) throw VegaError.forbidden('No autenticado');
		if (currentSessionState.expiresAtMs !== null && Date.now() >= currentSessionState.expiresAtMs) {
			latchedExpired = true;
			currentSessionState = null;
			notifyAuthChange(null, 'expired');
			throw VegaError.authExpired();
		}
	}

	return {
		checkSessionAlive,
		async login(credentials) {
			const ok = usingDefaultSeed
				? credentials.email === DEFAULT_USER_EMAIL && credentials.password.length > 0
				: users.some((u) => u.email === credentials.email && u.password === credentials.password);

			if (!ok) throw VegaError.forbidden('Credenciales no válidas');

			latchedExpired = false;
			const expiresAtMs = sessionTtlMs !== undefined ? Date.now() + sessionTtlMs : null;
			const session: Session = {
				token: crypto.randomUUID(),
				user: { id: `user_${credentials.email}`, email: credentials.email },
				expiresAt: expiresAtMs !== null ? new Date(expiresAtMs).toISOString() : null
			};
			currentSessionState = { session, expiresAtMs };
			notifyAuthChange(session, 'login');
			return structuredClone(session);
		},

		async logout() {
			currentSessionState = null;
			latchedExpired = false;
			notifyAuthChange(null, 'logout');
		},

		currentSession() {
			return currentSessionState ? structuredClone(currentSessionState.session) : null;
		},

		async restoreSession() {
			if (!currentSessionState) return null;
			if (
				currentSessionState.expiresAtMs !== null &&
				Date.now() >= currentSessionState.expiresAtMs
			) {
				currentSessionState = null;
				return null; // caducado: limpia y devuelve null SIN lanzar y SIN emitir evento (§4.1)
			}
			notifyAuthChange(currentSessionState.session, 'restored');
			return structuredClone(currentSessionState.session);
		},

		onAuthChange(cb) {
			authSubscribers.add(cb);
			return () => authSubscribers.delete(cb);
		}
	};
}
