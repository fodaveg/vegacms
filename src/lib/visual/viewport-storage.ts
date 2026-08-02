/**
 * Persistencia en `localStorage` del tamaño de pantalla + zoom del lienzo (`viewport.ts`, el
 * módulo PURO): mismo patrón IMPURO que `column-widths-storage.ts` — `typeof localStorage ===
 * 'undefined'` → default (nunca lanza), cada operación real en `try/catch` (modo privado agresivo
 * o cuota llena no deben tumbar nada, P3-L3). Clave PROPIA (`vega.visual.viewport.v1`), distinta
 * de `vega.visual.columns.v1` (§encargo: "clave nueva, no reutilices la de las columnas") — son
 * dos preferencias independientes del mismo lienzo, guardarlas bajo la misma clave acoplaría su
 * ciclo de vida sin necesidad (borrar una limpiaría la otra).
 */

import {
	DEFAULT_VIEWPORT_PREFERENCE,
	sanitizeViewportPreference,
	type VisualViewportPreference
} from './viewport';

const STORAGE_KEY = 'vega.visual.viewport.v1';

/** Preferencia guardada, o la de partida si no hay nada, `localStorage` no está disponible, o el
 *  contenido guardado no tiene la forma esperada (`sanitizeViewportPreference` hace el saneado). */
export function readViewportPreference(): VisualViewportPreference {
	if (typeof localStorage === 'undefined') return DEFAULT_VIEWPORT_PREFERENCE;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_VIEWPORT_PREFERENCE;
		return sanitizeViewportPreference(JSON.parse(raw));
	} catch {
		return DEFAULT_VIEWPORT_PREFERENCE;
	}
}

/** Persiste `preference` tal cual. No-op silencioso si `localStorage` no está disponible o el
 *  guardado falla — la preferencia simplemente no sobrevive a esta sesión de navegador (mismo
 *  criterio que `writeColumnWidths`). */
export function writeViewportPreference(preference: VisualViewportPreference): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
	} catch {
		// Ver `readViewportPreference`.
	}
}
