/* GENERADO por scripts/build-themes.mjs — NO EDITAR */
// Fuente: src/lib/themes/*.theme.json + index.json. Regenerar con `pnpm themes:build`.
// Consumido por src/lib/themes/theme.svelte.ts (§6.1: theme.swatches) y
// src/lib/themes/resolve-default.ts (§6.4: knownIds = ids + aliases).

/** Unión literal de los ids de tema v1 (§5.1, "tipado estricto"). */
export type ThemeId =
	| 'brasa'
	| 'faro'
	| 'rescoldo'
	| 'miel'
	| 'halloween'
	| 'aquelarre'
	| 'cereza'
	| 'tinta'
	| 'niebla'
	| 'marea'
	| 'sea-wingnow'
	| 'bosque'
	| 'menta'
	| 'salvia'
	| 'lavanda'
	| 'ciruela'
	| 'carbon'
	| 'colibri'
	| 'tornasol'
	| 'pizarra'
	| 'terracota';

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
	/** Pintura final del selector: acento sólido o gradiente enrutado por `effects.slots.fill`. */
	fill: string;
}

/** Swatches para el selector de tema de P3 (§6.1 `theme.swatches`), en el orden de
 * `index.json`. */
export const THEMES: ThemeSwatch[] = [
	{
		id: 'brasa',
		name: 'Brasa',
		group: 'calidos',
		tint: '#e8763a',
		accent: '#e8763a',
		fill: '#e8763a'
	},
	{
		id: 'faro',
		name: 'Faro',
		group: 'calidos',
		tint: '#d1642f',
		accent: '#d1642f',
		fill: '#d1642f'
	},
	{
		id: 'rescoldo',
		name: 'Rescoldo',
		group: 'calidos',
		tint: '#4a4a52',
		accent: '#f0842f',
		fill: '#f0842f'
	},
	{
		id: 'miel',
		name: 'Miel',
		group: 'calidos',
		tint: '#d59a2e',
		accent: '#d59a2e',
		fill: '#d59a2e'
	},
	{
		id: 'halloween',
		name: 'Halloween',
		group: 'calidos',
		tint: '#7a3fa0',
		accent: '#ef7a26',
		fill: 'linear-gradient(115deg, #f7b13a 0%, #ef7a26 42%, #e2542f 75%, #dd4f52 100%)'
	},
	{
		id: 'aquelarre',
		name: 'Aquelarre',
		group: 'calidos',
		tint: '#6e3fb5',
		accent: '#f0842f',
		fill: 'linear-gradient(115deg, #f6a63b 0%, #f0842f 42%, #e4583c 75%, #dd4f52 100%)'
	},
	{
		id: 'cereza',
		name: 'Cereza',
		group: 'calidos',
		tint: '#c0466b',
		accent: '#c0466b',
		fill: '#c0466b'
	},
	{
		id: 'tinta',
		name: 'Tinta',
		group: 'frios',
		tint: '#6ea3f0',
		accent: '#6ea3f0',
		fill: '#6ea3f0'
	},
	{
		id: 'niebla',
		name: 'Niebla',
		group: 'frios',
		tint: '#4f6bd6',
		accent: '#4f6bd6',
		fill: '#4f6bd6'
	},
	{
		id: 'marea',
		name: 'Marea',
		group: 'frios',
		tint: '#147885',
		accent: '#147885',
		fill: '#147885'
	},
	{
		id: 'sea-wingnow',
		name: 'Sea Wingnow',
		group: 'frios',
		tint: '#58a6d8',
		accent: '#58a6d8',
		fill: '#58a6d8'
	},
	{
		id: 'bosque',
		name: 'Bosque',
		group: 'verdes',
		tint: '#8bbf5a',
		accent: '#8bbf5a',
		fill: '#8bbf5a'
	},
	{
		id: 'menta',
		name: 'Menta',
		group: 'verdes',
		tint: '#2f9e73',
		accent: '#2f9e73',
		fill: '#2f9e73'
	},
	{
		id: 'salvia',
		name: 'Salvia',
		group: 'verdes',
		tint: '#7a9b78',
		accent: '#7a9b78',
		fill: '#7a9b78'
	},
	{
		id: 'lavanda',
		name: 'Lavanda',
		group: 'pastel-firma-mono',
		tint: '#8f84cf',
		accent: '#8f84cf',
		fill: '#8f84cf'
	},
	{
		id: 'ciruela',
		name: 'Ciruela',
		group: 'pastel-firma-mono',
		tint: '#7d4a9c',
		accent: '#7d4a9c',
		fill: '#7d4a9c'
	},
	{
		id: 'carbon',
		name: 'Carbón',
		group: 'pastel-firma-mono',
		tint: '#4a4a52',
		accent: '#4a4a52',
		fill: '#4a4a52'
	},
	{
		id: 'colibri',
		name: 'Colibrí',
		group: 'iridiscentes',
		tint: '#527d8f',
		accent: '#2f8f96',
		fill: '#2f8f96'
	},
	{
		id: 'tornasol',
		name: 'Tornasol',
		group: 'iridiscentes',
		tint: '#5b5f8f',
		accent: '#2f9a94',
		fill: 'linear-gradient(115deg, #2fb7a8 0%, #8d7bf0 42%, #d16bb2 72%, #dda63f 100%)'
	},
	{
		id: 'pizarra',
		name: 'Pizarra',
		group: 'neutros',
		tint: '#5d6d83',
		accent: '#5d6d83',
		fill: '#5d6d83'
	},
	{
		id: 'terracota',
		name: 'Terracota',
		group: 'calidos',
		tint: '#bd430f',
		accent: '#bd430f',
		fill: '#bd430f'
	}
];

/** `FALLBACK_THEME` (§10): el tema por defecto/de fallback (frío neutro). */
export const FALLBACK_THEME: ThemeId = 'niebla';

/** Alias → id canónico (§6.4: "ids antiguos que migran a este, nunca se borran"). */
export const THEME_ALIASES: Record<string, ThemeId> = {
	lumbre: 'brasa',
	grafito: 'niebla',
	'sea wingnow': 'sea-wingnow'
};
