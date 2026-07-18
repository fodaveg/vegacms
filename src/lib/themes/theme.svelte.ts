/**
 * Store runtime del motor de temas (§6.1 del contrato P7): estado reactivo (runas Svelte 5) de
 * los TRES ejes ortogonales `tema × modo × densidad` (L5) + persistencia en `localStorage` +
 * `applyTheme` (los `data-*` sobre la raíz) + el snippet anti-FOUC (§6.2).
 *
 * P7 NO pinta UI (§1): este módulo es datos + comportamiento, el chrome (selector de tema,
 * toggle de densidad, topbar) lo monta P3 consumiendo `theme.swatches`/`theme.setTheme(…)`/etc.
 * (hand-off §13).
 *
 * A diferencia de `resolve-default.ts` (puro), este módulo SÍ toca `localStorage`/`matchMedia`
 * — con el MISMO patrón defensivo que `src/lib/theme/apply.ts` de P3 (try/catch en
 * `localStorage`, `typeof matchMedia === 'function'` en vez de acceder directo): así el módulo
 * es seguro de importar tanto en el navegador como bajo Vitest (entorno Node, sin DOM real) sin
 * que un test tenga que mockear globals para que la sola importación no lance.
 */

import {
	FALLBACK_THEME,
	THEMES,
	THEME_ALIASES,
	type ThemeId,
	type ThemeSwatch
} from './themes.generated';

/** Modo claro/oscuro/"sigue al sistema" — persistido como `data-mode` en la raíz (§6.1). */
export type Mode = 'light' | 'dark' | 'system';

/** Densidad-MODO de C2 (§7, no identidad) — persistido como `data-density` en la raíz. */
export type Density = 'comfortable' | 'compact';

/** Claves de `localStorage` (§6.3, "preferencia de UI del dispositivo"). Vega NO persiste el
 * tema en PocketBase — el `defaultTheme` del manifiesto es solo la semilla (§6.4). */
export const STORAGE_KEYS = {
	theme: 'vega.theme',
	mode: 'vega.mode',
	density: 'vega.density'
} as const;

export interface ThemeStore {
	readonly themeId: ThemeId;
	readonly mode: Mode;
	readonly density: Density;
	/** Ignora + no persiste si `id` no es un tema (canónico o alias) conocido (§6.1). */
	setTheme(id: string): void;
	setMode(m: Mode): void;
	setDensity(d: Density): void;
	/** `'system'` resuelto vía `matchMedia` (§6.1); `'light'`/`'dark'` pasan tal cual. */
	readonly resolvedMode: 'light' | 'dark';
	/** Datos para el selector de tema de P3 (§6.1), en el orden de `index.json`. */
	readonly swatches: ThemeSwatch[];
}

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
		// entre sesiones", nunca rompe la app — mismo criterio que theme/apply.ts de P3.
	}
}

function isThemeId(id: string): id is ThemeId {
	return THEMES.some((t) => t.id === id);
}

/** `id` canónico si `id` es un `ThemeId` real o un alias conocido; `null` si no es ninguno de
 * los dos (§6.1 "ignora si el id no existe"). */
function canonicalThemeId(id: string): ThemeId | null {
	if (isThemeId(id)) return id;
	const alias = THEME_ALIASES[id];
	return alias ?? null;
}

function isMode(value: string | null): value is Mode {
	return value === 'light' || value === 'dark' || value === 'system';
}

function isDensity(value: string | null): value is Density {
	return value === 'comfortable' || value === 'compact';
}

function hasMatchMedia(): boolean {
	return typeof matchMedia === 'function';
}

function readSystemPrefersDark(): boolean {
	return hasMatchMedia() && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Pura (§9.8): dado el modo y el booleano de sistema YA leído, resuelve a `'light'`/`'dark'`.
 * `'system'` sigue a `systemPrefersDark`; el resto pasa tal cual. Extraída para poder testear
 * el caso límite §12.4 ("modo system con prefers-color-scheme cambiando en caliente") sin DOM. */
export function computeResolvedMode(mode: Mode, systemPrefersDark: boolean): 'light' | 'dark' {
	return mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;
}

function createThemeStore(): ThemeStore {
	const storedTheme = readStorage(STORAGE_KEYS.theme);
	const initialTheme =
		(storedTheme != null ? canonicalThemeId(storedTheme) : null) ?? FALLBACK_THEME;

	const storedMode = readStorage(STORAGE_KEYS.mode);
	const initialMode: Mode = isMode(storedMode) ? storedMode : 'system';

	const storedDensity = readStorage(STORAGE_KEYS.density);
	const initialDensity: Density = isDensity(storedDensity) ? storedDensity : 'comfortable';

	let themeId = $state<ThemeId>(initialTheme);
	let mode = $state<Mode>(initialMode);
	let density = $state<Density>(initialDensity);
	let systemPrefersDark = $state(readSystemPrefersDark());

	// Reactividad real de "system" (casos límite §12.4): sin esto, `resolvedMode` solo
	// reflejaría la preferencia del SO leída en el arranque. En Node (sin `matchMedia`) este
	// bloque no se ejecuta — el store sigue siendo seguro de instanciar en tests.
	if (hasMatchMedia()) {
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
			systemPrefersDark = event.matches;
		});
	}

	return {
		get themeId() {
			return themeId;
		},
		get mode() {
			return mode;
		},
		get density() {
			return density;
		},
		setTheme(id: string) {
			const canonical = canonicalThemeId(id);
			if (!canonical) return; // §6.1: ignora + no persiste si el id no existe
			themeId = canonical;
			writeStorage(STORAGE_KEYS.theme, canonical);
		},
		setMode(m: Mode) {
			mode = m;
			writeStorage(STORAGE_KEYS.mode, m);
		},
		setDensity(d: Density) {
			density = d;
			writeStorage(STORAGE_KEYS.density, d);
		},
		get resolvedMode() {
			return computeResolvedMode(mode, systemPrefersDark);
		},
		get swatches() {
			return THEMES;
		}
	};
}

/** Singleton del store (§6.1 `export const theme: {…}`) — se instancia una vez, al importar
 * este módulo (mismo patrón que `iconRegistry` en `$lib/icons/registry.ts`). */
export const theme: ThemeStore = createThemeStore();

/**
 * Aplica los `data-*` sobre un elemento raíz (§6.1/§6.2). La llama P3 en el arranque de la SPA
 * (tras resolver `resolveDefaultTheme`) y cada vez que el usuario cambia tema/modo/densidad.
 * Pura salvo el DOM: escribe EXACTAMENTE `data-theme`/`data-mode`/`data-density`, nada más (L5,
 * test §9.8 de ortogonalidad).
 */
export function applyTheme(
	root: HTMLElement,
	s: { themeId: string; mode: 'light' | 'dark'; density: string }
): void {
	root.dataset.theme = s.themeId;
	root.dataset.mode = s.mode;
	root.dataset.density = s.density;
}

/**
 * Snippet anti-FOUC (§6.2, ≤15 líneas, SIN imports — es el único código de P7 que corre fuera
 * del bundle): P3 lo pega en `app.html` ANTES del `<link>` del CSS, para fijar los `data-*`
 * desde `localStorage`/`prefers-color-scheme` ANTES del primer paint. El id de fallback se
 * interpola desde `FALLBACK_THEME` (no se duplica a mano) — si cambia el tema de fallback, este
 * snippet se regenera solo con `pnpm themes:build`… salvo que P3 lo haya pegado ya como texto
 * estático en `app.html`: en ese caso, resincronizar a mano tras cambiar `FALLBACK_THEME`.
 *
 * Deliberadamente NO valida el id contra la lista completa de temas (eso infla el snippet y
 * duplica `THEME_ALIASES`): un `data-theme` con un id desconocido/obsoleto simplemente no
 * matchea ningún bloque `[data-theme='…']` de `themes.generated.css`, y el bloque `:root` de
 * `FALLBACK_THEME` (que además se emite sin condicionar a `[data-theme]`, ver `themeToCss`) se
 * aplica igualmente — sin flash roto, sin crash (L9, casos límite §12.3).
 */
export const ANTI_FOUC_SNIPPET = `<script>
(function () {
	try {
		var root = document.documentElement;
		var t = localStorage.getItem('${STORAGE_KEYS.theme}');
		var m = localStorage.getItem('${STORAGE_KEYS.mode}');
		var d = localStorage.getItem('${STORAGE_KEYS.density}');
		var sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		root.setAttribute('data-theme', t || '${FALLBACK_THEME}');
		root.setAttribute('data-mode', m === 'light' || m === 'dark' ? m : sys);
		root.setAttribute('data-density', d === 'compact' ? 'compact' : 'comfortable');
	} catch (e) {}
})();
</script>`;
