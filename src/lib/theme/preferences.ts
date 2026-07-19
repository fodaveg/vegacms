/**
 * Costura de tema/densidad (§2.6 del contrato P3): claves de `localStorage`, tipos, y la
 * LÓGICA pura de decisión. Las lecturas/escrituras reales de `localStorage` y del DOM
 * (`document.documentElement.dataset`, `matchMedia`) llegan con la Fase 2; este módulo no toca
 * `window` — recibe sus entradas ya leídas como argumentos.
 */

import { FALLBACK_THEME } from '$lib/themes/themes.generated';

/** Modo claro/oscuro, escrito como `data-mode` en la raíz del documento. */
export type ThemeMode = 'light' | 'dark';

/** Densidad-MODO de C2 (no identidad): `data-density` en la raíz. */
export type Density = 'comfortable' | 'compact';

/**
 * Claves de `localStorage` (maestra L8, único estado propio persistido): tema, modo, densidad y
 * locale (D-P3.4). El token de sesión NO vive aquí: lo gestiona P1 (`vega.session.v1`).
 */
export const STORAGE_KEYS = {
	theme: 'vega.theme.v1',
	mode: 'vega.mode.v1',
	density: 'vega.density.v1',
	locale: 'vega.locale.v1'
} as const;

/**
 * Id del tema por defecto (§2.6). Hasta la Fase F7w-a valía `'base'` (placeholder neutro de P3,
 * "hasta que P7 exista" — ver §2.6 e historial de este fichero); P7 ya existe, así que ahora es
 * el `FALLBACK_THEME` real del motor (`themes.generated.ts`, hoy `'niebla'`): P7 wiring supera el
 * placeholder de P3. Reexportado tal cual (no un literal duplicado) para que si `FALLBACK_THEME`
 * cambia algún día, este módulo lo siga sin tocarlo a mano.
 */
export const DEFAULT_THEME_ID = FALLBACK_THEME;

/** Densidad por defecto (C2: "Cómoda" es el default, §3.6). */
export const DEFAULT_DENSITY: Density = 'comfortable';

/**
 * Modo inicial (§2.6, "sin preferencia → `prefers-color-scheme`"): la preferencia GUARDADA
 * (leída de `localStorage.vega.mode.v1` por la Fase 2) gana siempre que exista; si no hay
 * ninguna, se usa `prefersDark` (el resultado de `matchMedia('(prefers-color-scheme: dark)')`,
 * también leído por la Fase 2 — este módulo solo decide con el booleano ya resuelto).
 */
export function resolveInitialMode(storedMode: ThemeMode | null, prefersDark: boolean): ThemeMode {
	if (storedMode) return storedMode;
	return prefersDark ? 'dark' : 'light';
}

/**
 * Densidad inicial: preferencia guardada si existe, si no el default de C2. Sin equivalente de
 * `prefers-*` para densidad (no hay señal del SO), así que el segundo escalón es directo.
 */
export function resolveInitialDensity(storedDensity: Density | null): Density {
	return storedDensity ?? DEFAULT_DENSITY;
}

/**
 * Tema por defecto (§2.6): `site.defaultTheme` (P2, string opaco) si el proyecto lo fija; si no,
 * `DEFAULT_THEME_ID` (`FALLBACK_THEME` del motor P7). La preferencia LOCAL guardada (§2.6,
 * `localStorage.vega.theme.v1`, ya elegible desde el selector de `/settings` que enciende F7w-a)
 * antepone a este resultado con la misma forma que `resolveInitialMode` — es `theme/apply.ts`
 * (`applyInitialTheme`) quien la lee y decide, este módulo solo resuelve el ESCALÓN de proyecto.
 * P3 no valida que `site.defaultTheme` sea un id de tema conocido (P7 hace ese fallback con
 * aviso, §2.6; aquí simplemente se pasa el id opaco, válido o no, a `themes.generated.css`, que
 * ya degrada con seguridad a `FALLBACK_THEME` si no matchea ningún bloque `[data-theme=]`).
 */
export function resolveDefaultTheme(siteDefaultTheme: string | null): string {
	return siteDefaultTheme ?? DEFAULT_THEME_ID;
}
