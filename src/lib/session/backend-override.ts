/**
 * Override RUNTIME de la URL de backend (lote L5, distribución/onboarding genérico) — y, desde
 * L6a, de la colección de auth — un valor que el usuario introduce a mano en
 * `BackendUrlForm.svelte` (montado en `/login`, antes de tener sesión, y en `/settings`, ya
 * autenticado) para apuntar Vega a CUALQUIER PocketBase / colección de auth sin editar ficheros
 * ni recompilar. Persiste en `localStorage` bajo `vega.backendUrl.v1`/`vega.authCollection.v1` —
 * claves deliberadamente DISTINTAS de `vega.session.v1` (adaptador `pocketbase`, P1 §4.1) y de
 * `vega.demoSession.v1` (marcador de la demo, `backend.ts`): conviven todas sin colisión.
 *
 * Módulo IMPURO a propósito, hermano de `backend-config.ts` (que sigue sin tocar `window`): la
 * capa impura de `backend.ts` lee los overrides con `readBackendOverride()`/
 * `readAuthCollectionOverride()` y se los pasa a `resolveBackendUrl()`/`resolveAuthCollection()`,
 * que deciden la precedencia de 3 niveles cada uno.
 *
 * SSR-safe (mismo criterio que el resto del repo, landmine de P1): `typeof localStorage ===
 * 'undefined'` → no-op/`null`, nunca lanza (con `ssr=false` esto no debería ejecutarse en
 * servidor, pero un guard barato no cuesta nada). `try/catch` alrededor de cada operación: modo
 * privado agresivo o cuota llena no deben tumbar el arranque ni el guardado (P3-L3).
 */

const BACKEND_OVERRIDE_KEY = 'vega.backendUrl.v1';
const AUTH_COLLECTION_OVERRIDE_KEY = 'vega.authCollection.v1';

/** Lee el override crudo (sin validar: eso lo hace `resolveBackendUrl`/`isAbsoluteUrl`). `null`
 *  si no hay ninguno guardado, si `localStorage` no está disponible, o si el acceso falla. */
export function readBackendOverride(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(BACKEND_OVERRIDE_KEY);
	} catch {
		return null;
	}
}

/** Guarda `url` como override runtime. Quien llama es responsable de validarla antes (p.ej.
 *  `isAbsoluteUrl`) — este módulo no valida, solo persiste. No-op silencioso si `localStorage`
 *  no está disponible o el guardado falla (degradación honesta, ver cabecera). */
export function writeBackendOverride(url: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(BACKEND_OVERRIDE_KEY, url);
	} catch {
		// Almacenamiento no disponible (modo privado agresivo, cuota…): el override simplemente
		// no sobrevive a esta sesión de navegador. Igual que el marcador de demo en `backend.ts`.
	}
}

/** Borra el override runtime ("Restablecer a same-origin" de `BackendUrlForm.svelte`). No-op
 *  silencioso si `localStorage` no está disponible o el borrado falla. */
export function clearBackendOverride(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(BACKEND_OVERRIDE_KEY);
	} catch {
		// ver `writeBackendOverride`.
	}
}

// ————— Override de la colección de auth (lote L6a) — mismo trío de funciones, misma semántica,
// clave de `localStorage` distinta. Ver cabecera del módulo. —————

/** Lee el override crudo de colección de auth (sin validar: eso lo hace `resolveAuthCollection`).
 *  `null` si no hay ninguno guardado, si `localStorage` no está disponible, o si el acceso falla. */
export function readAuthCollectionOverride(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(AUTH_COLLECTION_OVERRIDE_KEY);
	} catch {
		return null;
	}
}

/** Guarda `authCollection` como override runtime. No-op silencioso si `localStorage` no está
 *  disponible o el guardado falla (degradación honesta, ver cabecera). */
export function writeAuthCollectionOverride(authCollection: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(AUTH_COLLECTION_OVERRIDE_KEY, authCollection);
	} catch {
		// ver `writeBackendOverride`.
	}
}

/** Borra el override runtime de colección de auth ("Restablecer a _superusers" de un futuro
 *  `BackendUrlForm.svelte`, L6c). No-op silencioso si `localStorage` no está disponible o el
 *  borrado falla. */
export function clearAuthCollectionOverride(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(AUTH_COLLECTION_OVERRIDE_KEY);
	} catch {
		// ver `writeBackendOverride`.
	}
}
