/**
 * Persistencia en `localStorage` de la comprobación de actualizaciones (P8): tres claves
 * independientes, mismo criterio de nombrado que `theme/preferences.ts#STORAGE_KEYS`/
 * `session/backend-override.ts` (`vega.<algo>.v1`).
 *
 * - `vega.updateCheck.v1`: último `UpdateStatus` resuelto por `checkForUpdate` + cuándo
 *   (`checkedAt`). Es la ÚNICA fuente que lee `UpdateBanner` — nunca dispara red por su cuenta.
 * - `vega.updateAutoCheck.v1`: preferencia "comprobar automáticamente al iniciar" del toggle de
 *   `/settings`. Default `false` (opt-in real: sin preferencia guardada, el layout NO llama a
 *   `checkForUpdate`).
 * - `vega.updateDismissedVersion.v1`: última versión (`latest`, sin `v`) que el usuario descartó
 *   en el banner. Solo esa versión concreta deja de mostrarse — una release posterior vuelve a
 *   activar el banner (lo compara `update/preferences.ts#shouldShowUpdateBanner`).
 *
 * Módulo IMPURO a propósito (hermano puro: `preferences.ts`), mismo patrón SSR-safe que
 * `backend-override.ts`: `typeof localStorage === 'undefined'` → no-op/`null` (nunca lanza), y
 * cada operación real va en `try/catch` (modo privado agresivo o cuota llena no deben tumbar
 * nada, P3-L3).
 */

import type { UpdateStatus } from './check-update';

const CACHE_KEY = 'vega.updateCheck.v1';
const AUTO_CHECK_KEY = 'vega.updateAutoCheck.v1';
const DISMISSED_VERSION_KEY = 'vega.updateDismissedVersion.v1';

/** Envoltorio persistido: el `UpdateStatus` tal cual devuelve `checkForUpdate`, con el instante
 *  (`Date.now()`) en que se resolvió. */
export interface CachedUpdateCheck {
	readonly checkedAt: number;
	readonly status: UpdateStatus;
}

/** Valida la forma mínima de un `CachedUpdateCheck` leído de `localStorage` (JSON arbitrario:
 *  puede venir de una versión anterior del esquema, o corrupto). */
function isCachedUpdateCheck(value: unknown): value is CachedUpdateCheck {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.checkedAt === 'number' &&
		typeof record.status === 'object' &&
		record.status !== null &&
		typeof (record.status as { kind?: unknown }).kind === 'string'
	);
}

/** Última comprobación cacheada, o `null` si no hay ninguna, `localStorage` no está disponible, o
 *  el contenido guardado no tiene la forma esperada. */
export function readCachedUpdateCheck(): CachedUpdateCheck | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		return isCachedUpdateCheck(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Persiste `status` con el timestamp actual. Llamado por `checkForUpdate` tras CADA resolución
 *  (incluidos los `'error'`): así `/settings` puede mostrar "última comprobación" aunque falle.
 *  No-op silencioso si `localStorage` no está disponible o el guardado falla. */
export function writeCachedUpdateCheck(status: UpdateStatus): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const entry: CachedUpdateCheck = { checkedAt: Date.now(), status };
		localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
	} catch {
		// Almacenamiento no disponible (modo privado agresivo, cuota…): el resultado simplemente
		// no sobrevive a esta sesión de navegador. Igual que `writeBackendOverride`.
	}
}

/** Preferencia "comprobar automáticamente al iniciar" (toggle de `/settings`, default `false` —
 *  sin valor guardado, NUNCA se asume opt-in). `localStorage` no disponible ⇒ `false`. */
export function readAutoCheckPreference(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(AUTO_CHECK_KEY) === 'true';
	} catch {
		return false;
	}
}

/** Persiste la preferencia de auto-check. No-op silencioso si `localStorage` no está disponible o
 *  el guardado falla. */
export function writeAutoCheckPreference(enabled: boolean): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(AUTO_CHECK_KEY, enabled ? 'true' : 'false');
	} catch {
		// ver `writeCachedUpdateCheck`.
	}
}

/** Versión (`latest`, sin `v`) que el usuario descartó en `UpdateBanner`, o `null` si no ha
 *  descartado ninguna, o si `localStorage` no está disponible. */
export function readDismissedVersion(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(DISMISSED_VERSION_KEY);
	} catch {
		return null;
	}
}

/** Marca `version` como descartada ("Descartar" en `UpdateBanner`). No-op silencioso si
 *  `localStorage` no está disponible o el guardado falla. */
export function writeDismissedVersion(version: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(DISMISSED_VERSION_KEY, version);
	} catch {
		// ver `writeCachedUpdateCheck`.
	}
}
