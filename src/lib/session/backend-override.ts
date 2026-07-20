/**
 * Override RUNTIME de la URL de backend (lote L5, distribución/onboarding genérico): un valor que
 * el usuario introduce a mano en `BackendUrlForm.svelte` (montado en `/login`, antes de tener
 * sesión, y en `/settings`, ya autenticado) para apuntar Vega a CUALQUIER PocketBase sin editar
 * ficheros ni recompilar. Persiste en `localStorage` bajo `vega.backendUrl.v1` — clave
 * deliberadamente DISTINTA de `vega.session.v1` (adaptador `pocketbase`, P1 §4.1) y de
 * `vega.demoSession.v1` (marcador de la demo, `backend.ts`): las tres conviven sin colisión.
 *
 * Módulo IMPURO a propósito, hermano de `backend-config.ts` (que sigue sin tocar `window`): la
 * capa impura de `backend.ts` lee el override con `readBackendOverride()` y se lo pasa a
 * `resolveBackendUrl()`, que decide la precedencia de 3 niveles.
 *
 * SSR-safe (mismo criterio que el resto del repo, landmine de P1): `typeof localStorage ===
 * 'undefined'` → no-op/`null`, nunca lanza (con `ssr=false` esto no debería ejecutarse en
 * servidor, pero un guard barato no cuesta nada). `try/catch` alrededor de cada operación: modo
 * privado agresivo o cuota llena no deben tumbar el arranque ni el guardado (P3-L3).
 */

const BACKEND_OVERRIDE_KEY = 'vega.backendUrl.v1';

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
