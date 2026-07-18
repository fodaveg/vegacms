/**
 * Vocabulario CERRADO de tokens de rol de Vega (§3 del contrato P7, L1 "la UI solo consume
 * tokens"). `THEME_TOKENS` es la fuente de verdad: la lista EXHAUSTIVA de custom properties
 * `--*` que un `.svelte`/`.ts` de la app puede consumir vía `var(--token)`. Ampliarla es tocar
 * el contrato — no es una lista que crezca "sobre la marcha".
 *
 * Sirve tres consumidores:
 * 1. `scripts/build-themes.mjs` — aserción de que TODO lo que emite el generador está aquí, y
 *    viceversa (test §9.9, "vocabulario cerrado").
 * 2. `scripts/check-theme-coverage.mjs` — barrera anti-parches (§5.4): cualquier `var(--x)`
 *    fuera de este set, o un color crudo/`color-mix` de marca fuera de `src/lib/themes/`, es
 *    una violación.
 * 3. Documentación viva para P3/P4/P5 (hand-off §13): "pintas con `var(--token)`, nunca con
 *    color crudo".
 *
 * Módulo PURO (L6): sin red, sin reloj, sin Svelte.
 */

/** Agrupación temática de §3 (columna "Familia" de la tabla del contrato). */
export type TokenFamily =
	'papel' | 'lineas' | 'tinta' | 'marca' | 'semanticos' | 'forma' | 'densidad';

export interface ThemeToken {
	/** Nombre del custom property SIN el prefijo `--` (p.ej. `"ink"` para `var(--ink)`). */
	readonly name: string;
	readonly family: TokenFamily;
	/** Semántica (mapa token→superficie C2), en español, para quien mire el vocabulario. */
	readonly description: string;
	/**
	 * `true` si un `<id>.theme.json` puede declararlo/pisarlo (roles del tema o
	 * `modes.<modo>.neutrals`). `false` = lo fija el sistema (semánticos compartidos, densidad,
	 * forma/tipo) o se deriva de otros tokens (`accent-soft`/`accent-hover`/…) — un tema NUNCA
	 * lo escribe directamente.
	 */
	readonly themeWritable: boolean;
}

/**
 * El vocabulario CERRADO (§3), en el orden de la tabla del contrato. 41 tokens: 7 papel/fondos +
 * 4 líneas + 4 tinta + 6 marca + 8 semánticos (4 pares texto/`-soft`) + 4 forma/tipo + 8 densidad.
 */
export const THEME_TOKENS: readonly ThemeToken[] = [
	// ————— Papel/fondos —————
	{ name: 'bg', family: 'papel', description: 'Lienzo de la app.', themeWritable: false },
	{ name: 'sidebar', family: 'papel', description: 'Rail lateral.', themeWritable: false },
	{ name: 'paper', family: 'papel', description: 'Papel de ficha/tabla.', themeWritable: true },
	{ name: 'surface', family: 'papel', description: 'Tarjeta.', themeWritable: true },
	{ name: 'surface-2', family: 'papel', description: 'Tarjeta elevada.', themeWritable: true },
	{ name: 'btn', family: 'papel', description: 'Botón secundario.', themeWritable: false },
	{ name: 'active', family: 'papel', description: 'Fila/elemento activo.', themeWritable: false },

	// ————— Líneas —————
	{ name: 'line', family: 'lineas', description: 'Hairline.', themeWritable: false },
	{ name: 'line-soft', family: 'lineas', description: 'Hairline interna.', themeWritable: false },
	{ name: 'line-strong', family: 'lineas', description: 'Borde marcado.', themeWritable: false },
	{ name: 'ring', family: 'lineas', description: 'Anillo de foco.', themeWritable: false },

	// ————— Tinta —————
	{ name: 'ink-hi', family: 'tinta', description: 'Título.', themeWritable: false },
	{ name: 'ink', family: 'tinta', description: 'Cuerpo.', themeWritable: true },
	{ name: 'ink-2', family: 'tinta', description: 'Secundario/label.', themeWritable: false },
	{
		name: 'ink-3',
		family: 'tinta',
		description: 'Muted/placeholder (sub-AA por diseño, exento del gate §5.3).',
		themeWritable: false
	},

	// ————— Marca —————
	{
		name: 'tint',
		family: 'marca',
		description: 'Matiz del papel (no se pinta directo, solo alimenta color-mix).',
		themeWritable: true
	},
	{ name: 'accent', family: 'marca', description: 'Relleno de marca.', themeWritable: true },
	{
		name: 'accent-ink',
		family: 'marca',
		description: 'Texto sobre relleno de marca (AA sobre accent).',
		themeWritable: true
	},
	{
		name: 'accent-text',
		family: 'marca',
		description: 'Acento como texto sobre papel (AA sobre paper/surface/surface-2).',
		themeWritable: true
	},
	{
		name: 'accent-soft',
		family: 'marca',
		description: 'Fondo tenue de marca (derivado, color-mix accent→paper).',
		themeWritable: false
	},
	{
		name: 'accent-hover',
		family: 'marca',
		description: 'Hover de relleno (derivado).',
		themeWritable: false
	},

	// ————— Semánticos (×modo, compartidos por todos los temas, D-P7.2) —————
	{
		name: 'success',
		family: 'semanticos',
		description: 'Texto/icono de éxito.',
		themeWritable: false
	},
	{
		name: 'success-soft',
		family: 'semanticos',
		description: 'Fondo tenue de éxito.',
		themeWritable: false
	},
	{
		name: 'danger',
		family: 'semanticos',
		description: 'Texto/icono de peligro (AA desde el día 1).',
		themeWritable: false
	},
	{
		name: 'danger-soft',
		family: 'semanticos',
		description: 'Fondo tenue de peligro.',
		themeWritable: false
	},
	{
		name: 'warning',
		family: 'semanticos',
		description: 'Texto/icono de aviso.',
		themeWritable: false
	},
	{
		name: 'warning-soft',
		family: 'semanticos',
		description: 'Fondo tenue de aviso.',
		themeWritable: false
	},
	{
		name: 'info',
		family: 'semanticos',
		description: 'Texto/icono informativo.',
		themeWritable: false
	},
	{
		name: 'info-soft',
		family: 'semanticos',
		description: 'Fondo tenue informativo.',
		themeWritable: false
	},

	// ————— Forma/tipo (globales, no conmutan por tema ni densidad) —————
	{ name: 'r', family: 'forma', description: 'Radio (8px).', themeWritable: false },
	{
		name: 'shadow-card',
		family: 'forma',
		description: 'Sombra de tarjeta (por modo).',
		themeWritable: false
	},
	{ name: 'sans', family: 'forma', description: 'Familia UI.', themeWritable: false },
	{
		name: 'mono',
		family: 'forma',
		description: 'Familia mono (valores canónicos published/draft).',
		themeWritable: false
	},

	// ————— Densidad (§7, conmutables por data-density; el tema NUNCA los escribe) —————
	{ name: 'row-h', family: 'densidad', description: 'Alto de fila.', themeWritable: false },
	{
		name: 'cell-x',
		family: 'densidad',
		description: 'Padding horizontal de celda.',
		themeWritable: false
	},
	{
		name: 'fs-base',
		family: 'densidad',
		description: 'Base tipográfica.',
		themeWritable: false
	},
	{
		name: 'pad-field',
		family: 'densidad',
		description: 'Padding de fila de ficha.',
		themeWritable: false
	},
	{
		name: 'gap-field',
		family: 'densidad',
		description: 'Separación entre fichas.',
		themeWritable: false
	},
	{
		name: 'pad-card',
		family: 'densidad',
		description: 'Padding de tarjeta/ficha.',
		themeWritable: false
	},
	{
		name: 'sidebar-item-h',
		family: 'densidad',
		description: 'Alto de item de sidebar.',
		themeWritable: false
	},
	{ name: 'topbar-h', family: 'densidad', description: 'Alto de la topbar.', themeWritable: false }
];

/** Nombres desnudos (sin `--`), para chequeos rápidos de pertenencia. */
export const THEME_TOKEN_NAMES: readonly string[] = THEME_TOKENS.map((t) => t.name);

/** `true` si `name` (sin `--`) pertenece al vocabulario cerrado §3. */
export function isThemeToken(name: string): boolean {
	return THEME_TOKEN_NAMES.includes(name);
}
