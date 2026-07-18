/**
 * Aplicación RUNTIME de la costura de tema/densidad (§2.6 del contrato P3, Fase 2). A diferencia
 * de `theme/preferences.ts` (puro), este módulo SÍ toca `window`/`document`/`localStorage`: lee/
 * escribe las `STORAGE_KEYS` y refleja el resultado en los atributos `data-*` de la raíz del
 * documento que consume `theme/base.css`.
 */

import {
	DEFAULT_THEME_ID,
	resolveDefaultTheme,
	resolveInitialDensity,
	resolveInitialMode,
	STORAGE_KEYS,
	type Density,
	type ThemeMode
} from './preferences';

function readStorage(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Almacenamiento no disponible (modo privado agresivo, cuota…): degrada a "no persiste
		// entre sesiones", nunca rompe la app (P3-L3).
	}
}

function isThemeMode(value: string | null): value is ThemeMode {
	return value === 'light' || value === 'dark';
}

function isDensity(value: string | null): value is Density {
	return value === 'comfortable' || value === 'compact';
}

function applyModeToDocument(mode: ThemeMode): void {
	document.documentElement.dataset.mode = mode;
	// `color-scheme` acompaña al modo (§4.3 del checklist: scrollbars/controles nativos coherentes).
	document.documentElement.style.colorScheme = mode;
}

function applyDensityToDocument(density: Density): void {
	document.documentElement.dataset.density = density;
}

function applyThemeToDocument(themeId: string): void {
	document.documentElement.dataset.theme = themeId;
}

/**
 * Aplica el tema/modo/densidad iniciales a la raíz del documento (se llama al montar el layout,
 * y de nuevo cuando el modelo carga y se conoce `site.defaultTheme` — ver §2.6, re-aplicar es
 * seguro: una preferencia YA guardada siempre gana sobre el default de proyecto).
 *
 * Lee preferencias guardadas + `prefers-color-scheme`, resuelve con las funciones puras de
 * `preferences.ts`, y escribe los tres atributos `data-*` de una vez.
 */
export function applyInitialTheme(opts?: { siteDefaultTheme?: string | null }): {
	mode: ThemeMode;
	density: Density;
	theme: string;
} {
	const storedMode = readStorage(STORAGE_KEYS.mode);
	const prefersDark =
		typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
	const mode = resolveInitialMode(isThemeMode(storedMode) ? storedMode : null, prefersDark);

	const storedDensity = readStorage(STORAGE_KEYS.density);
	const density = resolveInitialDensity(isDensity(storedDensity) ? storedDensity : null);

	const storedTheme = readStorage(STORAGE_KEYS.theme);
	const theme =
		storedTheme ?? resolveDefaultTheme(opts?.siteDefaultTheme ?? null) ?? DEFAULT_THEME_ID;

	applyModeToDocument(mode);
	applyDensityToDocument(density);
	applyThemeToDocument(theme);

	return { mode, density, theme };
}

/** Cambia el modo, lo persiste y lo refleja en la raíz. Setter para el (futuro) toggle de topbar. */
export function setMode(mode: ThemeMode): void {
	writeStorage(STORAGE_KEYS.mode, mode);
	applyModeToDocument(mode);
}

/** Cambia la densidad, la persiste y la refleja en la raíz (toggle Cómoda⇄Compacta, §3.6). */
export function setDensity(density: Density): void {
	writeStorage(STORAGE_KEYS.density, density);
	applyDensityToDocument(density);
}
