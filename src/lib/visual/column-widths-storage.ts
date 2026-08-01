/**
 * Persistencia en `localStorage` de `VisualColumnWidths` (ver `column-widths.ts`, el módulo
 * PURO): mismo patrón IMPURO que `update/storage.ts` — `typeof localStorage === 'undefined'` →
 * default (nunca lanza), cada operación real en `try/catch` (modo privado agresivo o cuota
 * llena no deben tumbar nada, P3-L3).
 */

import {
	DEFAULT_COLUMN_WIDTHS,
	sanitizeColumnWidths,
	type VisualColumnWidths
} from './column-widths';

const STORAGE_KEY = 'vega.visual.columns.v1';

/** Anchos guardados, o los de partida si no hay nada, `localStorage` no está disponible, o el
 *  contenido guardado no tiene la forma esperada (`sanitizeColumnWidths` hace el saneado). */
export function readColumnWidths(): VisualColumnWidths {
	if (typeof localStorage === 'undefined') return DEFAULT_COLUMN_WIDTHS;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_COLUMN_WIDTHS;
		return sanitizeColumnWidths(JSON.parse(raw));
	} catch {
		return DEFAULT_COLUMN_WIDTHS;
	}
}

/** Persiste `widths` tal cual (ya vienen recortados: `VisualColumnResizer.svelte` nunca llama a
 *  `onResize` fuera de `[min, max]`). No-op silencioso si `localStorage` no está disponible o el
 *  guardado falla — el ancho elegido simplemente no sobrevive a esta sesión de navegador. */
export function writeColumnWidths(widths: VisualColumnWidths): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
	} catch {
		// Ver `readColumnWidths`.
	}
}
