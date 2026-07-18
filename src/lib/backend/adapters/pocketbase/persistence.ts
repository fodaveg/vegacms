/**
 * Persistencia de sesión (§4.1): clave `localStorage` `vega.session.v1`, con el host del
 * backend en el valor para no restaurar por error la sesión de otro PocketBase.
 *
 * En navegador usa `localStorage` de verdad. Sin `localStorage` (SSR, o Node en tests: la
 * suite de contrato corre bajo Vitest con `environment: 'node'`), cae a un fallback en memoria
 * a nivel de módulo — que es justo lo que hace falta para simular un "reload" real en los
 * tests de `restoreSession` (dos instancias de `createPocketBaseBackend` apuntando al mismo
 * host comparten el token persistido, igual que compartirían el `localStorage` del navegador).
 */

const STORAGE_KEY = 'vega.session.v1';

interface PersistedSession {
	host: string;
	token: string;
}

let memoryFallback: string | null = null;

function getStorage(): Storage | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

/** Token persistido para `host`, o `null` si no hay ninguno o pertenece a otro host. */
export function loadPersistedToken(host: string): string | null {
	const raw = getStorage()?.getItem(STORAGE_KEY) ?? memoryFallback;
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as PersistedSession;
		return parsed.host === host ? parsed.token : null;
	} catch {
		return null;
	}
}

export function savePersistedToken(host: string, token: string): void {
	const raw = JSON.stringify({ host, token } satisfies PersistedSession);
	const storage = getStorage();
	if (storage) storage.setItem(STORAGE_KEY, raw);
	else memoryFallback = raw;
}

export function clearPersistedToken(): void {
	const storage = getStorage();
	if (storage) storage.removeItem(STORAGE_KEY);
	memoryFallback = null;
}
