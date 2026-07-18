/* GENERADO por scripts/build-themes.mjs — NO EDITAR */
// Fuente: src/lib/themes/*.theme.json + index.json. Regenerar con `pnpm themes:build`.
// Consumido por src/lib/themes/theme.svelte.ts (§6.1: theme.swatches) y
// src/lib/themes/resolve-default.ts (§6.4: knownIds = ids + aliases).

/** Unión literal de los ids de tema v1 (§5.1, "tipado estricto"). */
export type ThemeId = 'niebla' | 'miel' | 'pizarra' | 'salvia' | 'terracota';

/** Id de tema (canónico o alias) reconocido por el motor: unión de `ThemeId` con los alias
 * declarados (§6.4, "un defaultTheme que sea un alias resuelve al id canónico"). */
export type KnownThemeId = ThemeId | keyof typeof THEME_ALIASES;

export interface ThemeSwatch {
	id: ThemeId;
	name: string;
	group: string;
	/** Matiz del papel (§2, independiente del acento). */
	tint: string;
	/** Marca — lo que pinta el swatch del selector. */
	accent: string;
}

/** Swatches para el selector de tema de P3 (§6.1 `theme.swatches`), en el orden de
 * `index.json`. */
export const THEMES: ThemeSwatch[] = [
	{
		id: 'niebla',
		name: 'Niebla',
		group: 'frios',
		tint: '#4f6bd6',
		accent: '#4f6bd6'
	},
	{
		id: 'miel',
		name: 'Miel',
		group: 'calidos',
		tint: '#a5781d',
		accent: '#a5781d'
	},
	{
		id: 'pizarra',
		name: 'Pizarra',
		group: 'neutros',
		tint: '#5d6d83',
		accent: '#5d6d83'
	},
	{
		id: 'salvia',
		name: 'Salvia',
		group: 'verdes',
		tint: '#4e745a',
		accent: '#4e745a'
	},
	{
		id: 'terracota',
		name: 'Terracota',
		group: 'calidos',
		tint: '#bd430f',
		accent: '#bd430f'
	}
];

/** `FALLBACK_THEME` (§10): el tema por defecto/de fallback (frío neutro). */
export const FALLBACK_THEME: ThemeId = 'niebla';

/** Alias → id canónico (§6.4: "ids antiguos que migran a este, nunca se borran"). */
export const THEME_ALIASES: Record<string, ThemeId> = {
	grafito: 'niebla'
};
