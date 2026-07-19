/**
 * `mediaPickerState` (Fase P6·6e, L-P6.11): estado de MÓDULO, singleton — mismo patrón que
 * `toastStore`/`transportFeedback` (Fase 2c) — que implementa el lado "promesa" de
 * `ctx.mediaPicker.open(...)` (`VegaAppContext`, `$lib/app-context.ts`).
 *
 * Un ÚNICO `<MediaPicker>` se monta en `src/routes/+layout.svelte` (fuera del árbol de rutas,
 * junto a `ToastHost`/`GlobalBanner`/`ReloginModal`, L-P6.11): lee `mediaPickerState.request` para
 * decidir si se pinta, y llama a `settle(resultado)` al "Insertar" (con los `MediaPickResult[]`) o
 * al "Cancelar"/Esc (con `null`) — la promesa que `open()` devolvió a quien lo llamó (hoy solo
 * `FileInput.svelte`, F5-f) se resuelve entonces. Ninguna de las dos partes conoce a la otra
 * directamente: el widget nunca importa `MediaPicker.svelte`, y viceversa — el mismo desacoplo que
 * ya usa el resto del chrome global (`+layout.svelte` nunca importa `FileInput.svelte` tampoco).
 */
import type { MediaPickerOpenOptions, MediaPickResult } from './media-picker';

interface MediaPickRequest {
	opts: MediaPickerOpenOptions;
	resolve: (result: MediaPickResult[] | null) => void;
}

let request = $state<MediaPickRequest | null>(null);

/**
 * Abre el picker con `opts` y devuelve una promesa que se resuelve cuando `<MediaPicker>` llama a
 * `settle(...)`. Una petición YA en vuelo (no debería pasar: L-P6.11 es un montaje ÚNICO, sin UI
 * para dos pickers a la vez) se cancela primero (`resolve(null)`) en vez de dejarla colgada para
 * siempre — defensivo, cubre una llamada a `open()` mientras otra sigue sin resolver.
 */
function open(opts: MediaPickerOpenOptions): Promise<MediaPickResult[] | null> {
	request?.resolve(null);
	return new Promise((resolve) => {
		request = { opts, resolve };
	});
}

/** Resuelve la petición ABIERTA (si la hay) con `result` y limpia el estado — llamado por
 *  `<MediaPicker>` al "Insertar" (`MediaPickResult[]`) o al "Cancelar"/Esc (`null`). */
function settle(result: MediaPickResult[] | null): void {
	request?.resolve(result);
	request = null;
}

/** Superficie que consumen `+layout.svelte` (escribe, vía `open`, publicado en `ctx.mediaPicker`) y
 *  `MediaPicker.svelte` (lee `request`, escribe vía `settle`). */
export const mediaPickerState = {
	get request(): MediaPickRequest | null {
		return request;
	},
	open,
	settle
};
