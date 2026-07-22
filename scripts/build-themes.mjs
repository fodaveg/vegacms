#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ver el porqué justo debajo
// @ts-nocheck — script de build en JS plano, sin JSDoc types (igual que
// `scripts/download-pocketbase.mjs`). `checkJs` es `true` en el tsconfig del repo; aunque
// `scripts/` no está en el `include` de `.svelte-kit/tsconfig.json`, `tests/themes/*.test.ts`
// SÍ importa este fichero directamente (para testear sus funciones puras), y eso arrastra el
// módulo al programa de `svelte-check` transitivamente — sin este pragma serían ~50 errores de
// "implicit any" en un fichero que nunca tuvo tipado (mismo landmine que Lumbre documentó en su
// propio `build-themes.mjs`).
//
// Generador del motor de temas de Vega (§5 del contrato P7: "temas como datos").
//
// Fuente única: src/lib/themes/<id>.theme.json (+ index.json para el orden).
// Salida (committeada, cabecera "GENERADO — NO EDITAR"):
//   - src/lib/themes/themes.generated.css — bloques [data-theme='<id>'] (+ variantes de modo)
//     con los tokens de rol §3 resueltos, más los bloques globales de forma/densidad/semánticos.
//   - src/lib/themes/themes.generated.ts  — THEMES (swatches para el selector de P3), ThemeId
//     (unión literal, tipado estricto) y THEME_ALIASES.
//
// Porta `~/code/lumbre/scripts/build-themes.mjs` (copiar y adaptar, NO librería compartida)
// con los roles/superficies PROPIOS de Vega (§2-§4), sin el vocabulario de tareas de Lumbre
// (`date/deadline/done`). L10 incorpora el catálogo completo y sus pinturas de marca mediante
// un subconjunto cerrado de `effects`: gradientes, halo, paradas de marca y slot de relleno.
//
// `themeToCss`/`themeToSwatch`/todos los `validate*` son funciones PURAS (JSON de tema → texto/
// objeto/errores) — la I/O (leer `*.theme.json`, escribir los `.generated.*`) solo ocurre en
// `main()`, que es lo único que corre si el script se invoca directamente.
//
// Uso: `pnpm themes:build` (encadenado a `predev`/`prebuild`, §5.1).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import prettier from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES_DIR = join(ROOT, 'src/lib/themes');
const CSS_OUT = join(THEMES_DIR, 'themes.generated.css');
const TS_OUT = join(THEMES_DIR, 'themes.generated.ts');
const HEADER = '/* GENERADO por scripts/build-themes.mjs — NO EDITAR */';

// ── Color / contraste (WCAG) ──────────────────────────────────────────────

function hexToRgb(hex) {
	const h = hex.replace('#', '');
	const n =
		h.length === 3
			? h
					.split('')
					.map((c) => c + c)
					.join('')
			: h;
	const int = parseInt(n, 16);
	return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function relativeLuminance(hex) {
	return relativeLuminanceSrgb(hexToRgb(hex).map((value) => value / 255));
}

function relativeLuminanceSrgb(rgb) {
	const [r, g, b] = rgb.map(srgbChannelToLinear);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastFromLuminances(a, b) {
	const [lighter, darker] = a > b ? [a, b] : [b, a];
	return (lighter + 0.05) / (darker + 0.05);
}

/** Ratio de contraste WCAG 2 entre dos colores hex (1:1 … 21:1). */
export function contrastRatio(hexA, hexB) {
	const la = relativeLuminance(hexA);
	const lb = relativeLuminance(hexB);
	return contrastFromLuminances(la, lb);
}

// ── Mezcla OKLab (equivalente JS de `color-mix(in oklab, …)`) ─────────────
//
// El gate de contraste de COMPONENTES (`validateComponentContrast`, más abajo) necesita
// resolver en JS los MISMOS valores finales que produce `color-mix(in oklab, …)` en el
// navegador — mezclar en sRGB plano daría un hex (y por tanto un ratio de contraste) distinto
// al que la app realmente pinta. Coeficientes de Björn Ottosson
// (https://bottosson.github.io/posts/oklab/). Byte-idéntico a Chromium para los tintes/pcts de
// este pipeline (3–20%, dentro de gamut) — verificado por el test de equivalencia §9.2.

function srgbChannelToLinear(c) {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(c) {
	// LIMITACIÓN conocida (heredada de Lumbre): clamp por-canal, NO el gamut-mapping de CSS
	// Color 4. Verificado byte-idéntico a Chromium para los 5 temas curados de v1; un tema
	// futuro con tint/accent MUY saturado que empuje la mezcla fuera de gamut podría divergir
	// en el margen — re-verificar a mano en ese caso.
	const clamped = Math.min(1, Math.max(0, c));
	return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function hexToOklab(hex) {
	const [r, g, b] = hexToRgb(hex).map((v) => srgbChannelToLinear(v / 255));
	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
	const l_ = Math.cbrt(l);
	const m_ = Math.cbrt(m);
	const s_ = Math.cbrt(s);
	return [
		0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
		1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
		0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
	];
}

function oklabToHex([L, a, b]) {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;
	const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const bch = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
	const toHexByte = (c) =>
		Math.round(linearChannelToSrgb(c) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(bch)}`;
}

/**
 * Equivalente JS de `color-mix(in oklab, <hexA> <pctA>%, <hexB>)`: `pctA`% de `hexA` + el resto
 * de `hexB`, mezclados linealmente en espacio OKLab (no en sRGB).
 */
export function mixOklab(hexA, pctA, hexB) {
	const t = pctA / 100;
	const labA = hexToOklab(hexA);
	const labB = hexToOklab(hexB);
	return oklabToHex(labA.map((v, i) => v * t + labB[i] * (1 - t)));
}

function interpolateSrgb(hexA, hexB, t) {
	const rgbA = hexToRgb(hexA).map((value) => value / 255);
	const rgbB = hexToRgb(hexB).map((value) => value / 255);
	return rgbA.map((value, index) => value * (1 - t) + rgbB[index] * t);
}

function srgbToHex(rgb) {
	return `#${rgb
		.map((value) =>
			Math.round(Math.min(1, Math.max(0, value)) * 255)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
}

/**
 * Mínimo CONTINUO de contraste de texto sobre un segmento de gradiente sRGB. La luminancia de
 * cada canal sRGB interpolado es convexa (la transferencia sRGB es convexa y se compone con una
 * función afín), por lo que la suma ponderada tiene un único mínimo y su máximo está en uno de
 * los extremos. Localizamos ese mínimo por ternaria y, si la luminancia del texto cae dentro del
 * rango recorrido, la intersección por bisección. Así no quedan huecos entre muestras discretas.
 */
function minimumSrgbGradientContrast(textHex, from, to) {
	const textLuminance = relativeLuminance(textHex);
	const luminanceAt = (t) => relativeLuminanceSrgb(interpolateSrgb(from, to, t));
	let left = 0;
	let right = 1;
	for (let iteration = 0; iteration < 80; iteration += 1) {
		const third = (right - left) / 3;
		const a = left + third;
		const b = right - third;
		if (luminanceAt(a) <= luminanceAt(b)) right = b;
		else left = a;
	}
	const minimumAt = (left + right) / 2;
	const minimumLuminance = luminanceAt(minimumAt);
	const endpointLuminances = [luminanceAt(0), luminanceAt(1)];
	const maximumAt = endpointLuminances[0] >= endpointLuminances[1] ? 0 : 1;
	const maximumLuminance = endpointLuminances[maximumAt];

	let worstAt;
	if (textLuminance < minimumLuminance) {
		worstAt = minimumAt;
	} else if (textLuminance > maximumLuminance) {
		worstAt = maximumAt;
	} else {
		// Hay una intersección exacta con la luminancia del texto en al menos una de las dos
		// ramas monótonas que parten del mínimo.
		let lo;
		let hi;
		if ((endpointLuminances[0] - textLuminance) * (minimumLuminance - textLuminance) <= 0) {
			lo = 0;
			hi = minimumAt;
		} else {
			lo = minimumAt;
			hi = 1;
		}
		for (let iteration = 0; iteration < 80; iteration += 1) {
			const mid = (lo + hi) / 2;
			const loDelta = luminanceAt(lo) - textLuminance;
			const midDelta = luminanceAt(mid) - textLuminance;
			if (loDelta * midDelta <= 0) hi = mid;
			else lo = mid;
		}
		worstAt = (lo + hi) / 2;
	}

	const rgb = interpolateSrgb(from, to, worstAt);
	return {
		contrast: contrastFromLuminances(textLuminance, relativeLuminanceSrgb(rgb)),
		at: worstAt,
		color: srgbToHex(rgb)
	};
}

/**
 * Peor color de 8 bits que el rasterizador puede producir al cuantizar/ditherizar el segmento.
 * Entre dos cruces enteros de cualquiera de los tres canales, el conjunto {floor, ceil} de cada
 * canal es constante. Enumerar esos intervalos y sus 2³ combinaciones cubre por tanto TODOS los
 * RGB alcanzables, con un máximo de 766 intervalos por segmento.
 */
function minimumRasterizedSrgbGradientContrast(textHex, from, to) {
	const fromRgb = hexToRgb(from);
	const toRgb = hexToRgb(to);
	const boundaries = new Set([0, 1]);
	for (let channel = 0; channel < 3; channel += 1) {
		const start = fromRgb[channel];
		const end = toRgb[channel];
		if (start === end) continue;
		for (let value = Math.min(start, end) + 1; value < Math.max(start, end); value += 1) {
			boundaries.add((value - start) / (end - start));
		}
	}
	const ordered = [...boundaries].sort((a, b) => a - b);
	const probes = new Set(ordered);
	for (let index = 0; index < ordered.length - 1; index += 1) {
		probes.add((ordered[index] + ordered[index + 1]) / 2);
	}

	const textLuminance = relativeLuminance(textHex);
	let worst = { contrast: Number.POSITIVE_INFINITY, at: 0, color: from };
	for (const at of probes) {
		const continuous = fromRgb.map((value, channel) => value * (1 - at) + toRgb[channel] * at);
		const options = continuous.map((value) => [
			...new Set(
				[Math.floor(value), Math.ceil(value)].map((byte) => Math.min(255, Math.max(0, byte)))
			)
		]);
		for (const r of options[0]) {
			for (const g of options[1]) {
				for (const b of options[2]) {
					const rgb = [r / 255, g / 255, b / 255];
					const contrast = contrastFromLuminances(textLuminance, relativeLuminanceSrgb(rgb));
					if (contrast < worst.contrast) {
						worst = { contrast, at, color: srgbToHex(rgb) };
					}
				}
			}
		}
	}
	return worst;
}

// ── Base neutra + tinte (§4.2/§4.3 del contrato) ───────────────────────────

/**
 * Base neutra compartida por TODOS los temas (§4.2), réplica exacta de los hexes del mockup C2
 * (`design/mockups/vega-propuesta-C2-cabina-con-aire.html`, bloques `:root`/`:root[data-theme=
 * 'dark']`). **Landmine idéntica a la de Lumbre**: el gate resuelve el color final en JS, no en
 * el navegador, así que esta cascada base+tinte se reimplementa aquí — si el CSS de la app
 * (cuando P3/una fase posterior lo cablee) toca un hex base, tócalo también aquí. Protegido por
 * el test de equivalencia §9.2.
 */
export const BASE_NEUTRALS = {
	light: {
		bg: '#ece9e5',
		sidebar: '#efeeeb',
		paper: '#f7f6f4',
		surface: '#ffffff',
		'surface-2': '#fffffe',
		btn: '#eeece9',
		active: '#eae7e1',
		line: '#e6e4e0',
		'line-soft': '#edece8',
		'line-strong': '#c9c6bf',
		ring: '#c9c6bf',
		'ink-hi': '#26241f',
		ink: '#2c2a24',
		'ink-2': '#6a665e',
		'ink-3': '#a8a49b'
	},
	dark: {
		bg: '#0b0b0d',
		sidebar: '#0f0f11',
		paper: '#141416',
		surface: '#232327',
		'surface-2': '#1c1c1f',
		btn: '#242428',
		active: '#302f37',
		line: '#2a2a30',
		'line-soft': '#28282e',
		'line-strong': '#3c3c44',
		ring: '#49494f',
		'ink-hi': '#f4f4f7',
		ink: '#eaeaef',
		'ink-2': '#a5a5ad',
		'ink-3': '#87878f'
	}
};

/** Porcentaje de tinte por bucket y modo (§4.3: "bg 6/14, surf 3/12, line 8/16, ink 5/8"). */
export const TINT_PERCENT = {
	light: { bg: 6, surf: 3, line: 8, ink: 5 },
	dark: { bg: 14, surf: 12, line: 16, ink: 8 }
};

/** Bucket de tinte de cada neutro final (§4.3), agrupado igual que Lumbre agrupaba `bg0/paper/
 * tray/rail/filter` bajo `bg`, `s2/surf/btn` bajo `surf`, etc. — adaptado a las superficies C2. */
export const NEUTRAL_BUCKET = {
	bg: 'bg',
	sidebar: 'bg',
	paper: 'bg',
	surface: 'surf',
	'surface-2': 'surf',
	btn: 'surf',
	active: 'line',
	line: 'line',
	'line-soft': 'line',
	'line-strong': 'line',
	ring: 'line',
	'ink-hi': 'ink',
	ink: 'ink',
	'ink-2': 'ink',
	'ink-3': 'ink'
};

const FINAL_NEUTRAL_KEYS = Object.keys(NEUTRAL_BUCKET);

function resolveTintPercent(theme, mode, bucket) {
	if (bucket === 'bg') {
		const override = theme.modes?.[mode]?.tintBg;
		if (override != null) return parseFloat(override);
	}
	return TINT_PERCENT[mode][bucket];
}

/**
 * Valor FINAL (hex) de un neutro para un tema+modo: el override del tema si lo trae
 * (`modes.<modo>.neutrals`, §4.4 — gana por especificidad, sin re-tintar) o, si no, la fórmula
 * base+tinte (`color-mix(in oklab, var(--tint) <pct>%, <base>)`).
 */
export function resolveNeutral(theme, mode, key) {
	const override = theme.modes?.[mode]?.neutrals?.[key];
	if (override) return override;
	const bucket = NEUTRAL_BUCKET[key];
	const pct = resolveTintPercent(theme, mode, bucket);
	return mixOklab(theme.roles.tint, pct, BASE_NEUTRALS[mode][key]);
}

/** `--accent-text`: el override del tema si lo declara, o un derivado con suficiente tinta
 * neutra para conservar AA en todo el catálogo, incluidos amarillos, pasteles y monocromos. */
export function resolveAccentText(theme, mode, ink) {
	if (theme.roles.accentText) return theme.roles.accentText;
	const pct = 45;
	return mixOklab(theme.roles.accent, pct, ink);
}

const MIX_WEIGHT_SOURCE = String.raw`(?:100(?:\.0+)?|(?:[0-9]|[1-9][0-9])(?:\.[0-9]+)?)`;
const DERIVED_ACCENT_SOFT_RE = new RegExp(
	String.raw`^color-mix\(in oklab,\s*(#[0-9a-fA-F]{6})\s+(${MIX_WEIGHT_SOURCE})%,\s*var\(--paper\)\)$`
);
const DERIVED_ACCENT_LINE_RE = new RegExp(
	String.raw`^color-mix\(in oklab,\s*#[0-9a-fA-F]{6}\s+${MIX_WEIGHT_SOURCE}%,\s*var\(--line\)\)$`
);

/** `--accent-soft`: respeta el override cerrado del tema o deriva desde accent/paper. */
export function resolveAccentSoft(theme, mode, paper) {
	const override = theme.derived?.accentSoft;
	if (override) {
		const match = DERIVED_ACCENT_SOFT_RE.exec(override);
		if (!match) {
			throw new Error(
				`${theme.id}: derived.accentSoft no tiene el formato color-mix esperado por el gate`
			);
		}
		return mixOklab(match[1], parseFloat(match[2]), paper);
	}
	const pct = mode === 'light' ? 12 : 20;
	return mixOklab(theme.roles.accent, pct, paper);
}

// `--accent-hover` (no forma parte del gate AA, §5.3 no lo lista — es un estado de hover, no un
// par texto/fondo). Fórmula del mockup C2: en claro oscurece hacia `ink`, en oscuro aclara hacia
// blanco (misma asimetría que el mockup). Se emite directamente como expresión CSS en
// `themeToCss` (no hay un valor JS resuelto que documentar aparte, a diferencia de accent-soft/
// accent-text, que sí entran al gate y por eso SÍ tienen su `resolve*` en JS).

// ── Semánticos (§4.3/§10, D-P7.2: del sistema, por modo, compartidos) ─────

/**
 * Hexes de `success/danger/warning/info` por modo, afinados para pasar el gate AA (`danger`
 * incluido, §5.3) sobre `paper`/`surface` Y sobre su propia `-soft` — verificado contra el
 * `paper` YA tintado de los 5 temas curados, no solo contra la base neutra (el tinte de `bg`,
 * hasta 14% en oscuro, desplaza lo justo la luminancia como para que un hex "casi al límite"
 * contra la base falle en el tema más saturado). Partida del mockup C2 y reafinada (§5.3: "si
 * alguno no cumple, se afina el hex del semántico — una vez, para todos").
 */
export const SEMANTICS = {
	light: {
		success: { text: '#045a26', softFrom: '#045a26', softPct: 10 },
		danger: { text: '#a91408', softFrom: '#a91408', softPct: 10 },
		warning: { text: '#684800', softFrom: '#684800', softPct: 10 },
		info: { text: '#07517d', softFrom: '#07517d', softPct: 10 }
	},
	dark: {
		success: { text: '#5cbd8e', softFrom: '#5cbd8e', softPct: 17 },
		danger: { text: '#ef8078', softFrom: '#ef8078', softPct: 15 },
		warning: { text: '#dfae4d', softFrom: '#dfae4d', softPct: 15 },
		info: { text: '#74b6d6', softFrom: '#74b6d6', softPct: 15 }
	}
};

export const SEMANTIC_KEYS = Object.keys(SEMANTICS.light);

function resolveSemanticSoft(mode, key, paper) {
	const def = SEMANTICS[mode][key];
	return mixOklab(def.softFrom, def.softPct, paper);
}

// ── Densidad (§7 — dos bloques de tokens, ortogonales a tema y modo) ───────

/** Cómoda (default, C2 "los números del aire") / Compacta ("la C original"), §7: ~8 tokens,
 * NUNCA color. `--r`/`--shadow-card`/`--sans`/`--mono` NO están aquí a propósito — son
 * "Forma/tipo" global (§3), no conmutan con la densidad. */
export const DENSITY = {
	comfortable: {
		'row-h': '44px',
		'cell-x': '1.1rem',
		'fs-base': '14px',
		'pad-field': '1.1rem',
		'gap-field': '1.75rem',
		'pad-card': '1.5rem',
		'sidebar-item-h': '40px',
		'topbar-h': '54px'
	},
	compact: {
		'row-h': '36px',
		'cell-x': '.8rem',
		'fs-base': '13px',
		'pad-field': '.8rem',
		'gap-field': '1.2rem',
		'pad-card': '1rem',
		'sidebar-item-h': '32px',
		'topbar-h': '44px'
	}
};

/** Sombra de tarjeta por modo (mockup C2: el oscuro necesita más opacidad para leerse). */
const SHADOW_CARD = {
	light: '0 1px 2px rgb(0 0 0 / 0.04), 0 3px 12px rgb(0 0 0 / 0.04)',
	dark: '0 1px 3px rgb(0 0 0 / 0.4), 0 5px 16px rgb(0 0 0 / 0.28)'
};

// ── Contraste de componentes: pares que el gate exige a AA (§5.3) ─────────

/** Resuelve, para un tema+modo, TODOS los tokens finales (hex) que el gate de contraste de
 * componentes necesita — mismos nombres que los custom properties que consumirá la UI. */
export function resolveComponentTokens(theme, mode) {
	const paper = resolveNeutral(theme, mode, 'paper');
	const ink = resolveNeutral(theme, mode, 'ink');
	const tokens = {
		paper,
		surface: resolveNeutral(theme, mode, 'surface'),
		'surface-2': resolveNeutral(theme, mode, 'surface-2'),
		btn: resolveNeutral(theme, mode, 'btn'),
		active: resolveNeutral(theme, mode, 'active'),
		ink,
		'ink-2': resolveNeutral(theme, mode, 'ink-2'),
		'ink-hi': resolveNeutral(theme, mode, 'ink-hi'),
		accent: theme.roles.accent,
		accentInk: theme.roles.accentInk,
		accentText: resolveAccentText(theme, mode, ink),
		'accent-soft': resolveAccentSoft(theme, mode, paper)
	};
	for (const key of SEMANTIC_KEYS) {
		tokens[key] = SEMANTICS[mode][key].text;
		tokens[`${key}-soft`] = resolveSemanticSoft(mode, key, paper);
	}
	return tokens;
}

/**
 * Pares TEXTO/FONDO (nombres de `resolveComponentTokens`) que el gate exige a ≥4.5:1 (§5.3, L2
 * "AA MEDIDO, sin excepciones"). `ink-3` NO aparece a propósito (exento por diseño, muted/
 * placeholder). Los 4 semánticos (`danger` incluido desde el día 1) se añaden programáticamente:
 * cada uno sobre su propia `-soft` y sobre `paper`/`surface`.
 */
export const COMPONENT_CONTRAST_PAIRS = [
	['accentInk', 'accent'],
	['accentText', 'paper'],
	['accentText', 'surface'],
	['accentText', 'surface-2'],
	['ink', 'paper'],
	['ink', 'surface'],
	['ink', 'surface-2'],
	['ink', 'btn'],
	['ink', 'active'],
	['ink', 'accent-soft'],
	['ink-2', 'paper'],
	['ink-2', 'surface'],
	['ink-2', 'surface-2'],
	['ink-hi', 'paper'],
	['ink-hi', 'surface'],
	...SEMANTIC_KEYS.flatMap((key) => [
		[key, 'paper'],
		[key, 'surface'],
		[key, `${key}-soft`]
	])
];

/**
 * Nombres de custom property (sin `--`) que el generador DECLARA en algún bloque de
 * `themes.generated.css` (globales o por-tema) — no los que solo USA dentro de un `var(…)`.
 * Fuente de verdad independiente de la salida de texto, para el test de vocabulario cerrado
 * (§9.9, L1): debe ser exactamente `THEME_TOKEN_NAMES` de `theme-tokens.ts`, ni más ni menos.
 */
export function emittedTokenNames() {
	return new Set([
		'sans',
		'mono',
		'r',
		'shadow-card',
		...Object.keys(DENSITY.comfortable),
		'tint',
		'accent',
		'accent-ink',
		'accent-text',
		'accent-soft',
		'accent-hover',
		'accent-line',
		'accent-grad',
		'sheen',
		'accent-fill',
		'halo',
		'brand-a',
		'brand-b',
		'brand-c',
		'brand-edge-opacity',
		...FINAL_NEUTRAL_KEYS,
		...SEMANTIC_KEYS,
		...SEMANTIC_KEYS.map((key) => `${key}-soft`)
	]);
}

// ── themeToCss / themeToSwatch (funciones puras) ───────────────────────────

function gradientCss(gradient) {
	const stops = gradient.stops.map((stop) => `${stop.color} ${stop.at}`).join(', ');
	return `linear-gradient(${gradient.angle}deg, ${stops})`;
}

function radialCss(radial) {
	if (radial.css) return radial.css;
	return `radial-gradient(${radial.size} at ${radial.at}, color-mix(in oklab, ${radial.color} ${radial.alpha}, transparent), transparent ${radial.extent})`;
}

function haloCss(halo) {
	return halo.map(radialCss).join(',\n\t\t');
}

function paintVar(key) {
	return key === 'strokeGrad' ? '--sheen' : '--accent-grad';
}

/**
 * JSON de tema → texto CSS de sus bloques `[data-theme='<id>']` (+ variantes de modo). Función
 * PURA: mismo input → mismo output, sin tocar disco. `niebla` (FALLBACK_THEME, §10) se emite
 * TAMBIÉN sobre `:where(:root)` desnudo, como defensa pre-JS (mismo patrón que el mockup C2:
 * `:root, [data-pal='niebla']`, pero con `:where()` en vez de `:root` a secas).
 *
 * **`:where()`, no `:root` a secas** (fix de code-review, bug latente real): en un selector
 * agrupado por comas cada rama pesa su PROPIA especificidad — `:root` es (0,1,0), IGUAL que
 * `[data-theme='miel']`. Con un empate, gana quien va MÁS TARDE en el CSS; hoy eso es "quien sea
 * el último tema de `index.json`" salvo niebla porque niebla es SIEMPRE el primero — pero si
 * alguien reordena `index.json`, el bloque `:root` de niebla pasaría a ir DESPUÉS de otro tema y
 * lo pisaría en silencio (verde en CI, roto en navegador). `:where(:root)` tiene especificidad
 * 0 SIEMPRE: nunca empata ni gana contra `[data-theme='X']`, así que el fallback deja de
 * depender del orden de `index.json` — la garantía es estructural, no un accidente de orden.
 */
export function themeToCss(theme) {
	const { id, roles, derived, effects } = theme;
	const baseSelector =
		id === FALLBACK_THEME_ID ? `:where(:root),\n[data-theme='${id}']` : `[data-theme='${id}']`;

	const baseDecls = [
		`--tint: ${roles.tint};`,
		`--accent: ${roles.accent};`,
		`--accent-ink: ${roles.accentInk};`
	];
	if (effects?.fillGrad) baseDecls.push(`--accent-grad: ${gradientCss(effects.fillGrad)};`);
	if (effects?.strokeGrad) baseDecls.push(`--sheen: ${gradientCss(effects.strokeGrad)};`);
	if (effects?.slots?.fill) {
		baseDecls.push(`--accent-fill: var(${paintVar(effects.slots.fill)});`);
	}
	if (effects?.halo) baseDecls.push(`--halo:\n\t\t${haloCss(effects.halo)};`);
	if (effects?.brandStops) {
		baseDecls.push(`--brand-a: ${effects.brandStops[0]};`);
		baseDecls.push(`--brand-b: ${effects.brandStops[1]};`);
		baseDecls.push(`--brand-c: ${effects.brandStops[2]};`);
	}
	if (effects?.edgeOpacity != null) {
		baseDecls.push(`--brand-edge-opacity: ${effects.edgeOpacity};`);
	}
	let css = `${baseSelector} {\n\t${baseDecls.join('\n\t')}\n}\n`;

	for (const mode of ['light', 'dark']) {
		const ink = resolveNeutral(theme, mode, 'ink');
		const paper = resolveNeutral(theme, mode, 'paper');
		const accentTextDecl = roles.accentText
			? roles.accentText
			: 'color-mix(in oklab, var(--accent) 45%, var(--ink))';
		const accentSoftPct = mode === 'light' ? 12 : 20;
		const accentHoverDecl =
			mode === 'light'
				? 'color-mix(in oklab, var(--accent) 88%, var(--ink))'
				: 'color-mix(in oklab, var(--accent) 85%, #ffffff)';

		const decls = [
			`--accent-text: ${accentTextDecl};`,
			`--accent-soft: ${derived?.accentSoft ?? `color-mix(in oklab, var(--accent) ${accentSoftPct}%, var(--paper))`};`,
			`--accent-hover: ${accentHoverDecl};`,
			`--accent-line: ${derived?.accentLine ?? 'color-mix(in oklab, var(--accent) 42%, var(--line))'};`
		];
		for (const key of FINAL_NEUTRAL_KEYS) {
			const override = theme.modes?.[mode]?.neutrals?.[key];
			const bucket = NEUTRAL_BUCKET[key];
			const pct = resolveTintPercent(theme, mode, bucket);
			const value =
				override ?? `color-mix(in oklab, var(--tint) ${pct}%, ${BASE_NEUTRALS[mode][key]})`;
			decls.push(`--${key}: ${value};`);
		}

		const modeSelector =
			id === FALLBACK_THEME_ID
				? `:where(:root)[data-mode='${mode}'],\n[data-theme='${id}'][data-mode='${mode}']`
				: `[data-theme='${id}'][data-mode='${mode}']`;
		css += `${modeSelector} {\n\t${decls.join('\n\t')}\n}\n`;

		// Referenciados en el bloque para que prettier no se queje de variables sin uso — no
		// aplica a CSS, pero mantenemos ink/paper calculados por si un futuro override los usa.
		void ink;
		void paper;
	}

	return css;
}

/** Bloques GLOBALES (no dependen de `[data-theme]`): forma/tipo, densidad, y los semánticos
 * compartidos por modo (D-P7.2) — puros color-mix contra `var(--paper)`, que cada tema ya fija
 * en su propio bloque `[data-theme][data-mode]`. */
export function globalCss() {
	let css = `:root {\n\t--sans: -apple-system, 'Segoe UI', system-ui, sans-serif;\n\t--mono: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;\n\t--r: 8px;\n\t--accent-grad: linear-gradient(115deg, var(--accent), var(--accent-hover));\n\t--sheen: linear-gradient(100deg, var(--accent), var(--accent-text));\n\t--accent-fill: var(--accent);\n\t--halo: none;\n\t--brand-a: var(--accent);\n\t--brand-b: var(--accent);\n\t--brand-c: var(--accent);\n\t--brand-edge-opacity: 0.35;\n}\n`;

	const comfDecls = Object.entries(DENSITY.comfortable).map(([k, v]) => `--${k}: ${v};`);
	css += `:root {\n\t${comfDecls.join('\n\t')}\n}\n`;
	const compDecls = Object.entries(DENSITY.compact).map(([k, v]) => `--${k}: ${v};`);
	css += `[data-density='compact'] {\n\t${compDecls.join('\n\t')}\n}\n`;

	for (const mode of ['light', 'dark']) {
		const decls = [`--shadow-card: ${SHADOW_CARD[mode]};`];
		for (const key of SEMANTIC_KEYS) {
			const def = SEMANTICS[mode][key];
			decls.push(`--${key}: ${def.text};`);
			decls.push(
				`--${key}-soft: color-mix(in oklab, ${def.softFrom} ${def.softPct}%, var(--paper));`
			);
		}
		css += `[data-mode='${mode}'] {\n\t${decls.join('\n\t')}\n}\n`;
	}

	return css;
}

/** JSON de tema → entrada de `THEMES` (swatches del selector de P3, §6.1 `theme.swatches`).
 * Función PURA. */
export function themeToSwatch(theme) {
	return {
		id: theme.id,
		name: theme.name,
		group: theme.group,
		tint: theme.roles.tint,
		accent: theme.roles.accent,
		fill:
			theme.effects?.slots?.fill === 'strokeGrad' && theme.effects?.strokeGrad
				? gradientCss(theme.effects.strokeGrad)
				: theme.effects?.slots?.fill === 'fillGrad' && theme.effects?.fillGrad
					? gradientCss(theme.effects.fillGrad)
					: theme.roles.accent
	};
}

// ── Validaciones (§5.2/§5.3/§5.4) — rompen el build con mensajes accionables ─

function fail(errors) {
	console.error(`\n❌ scripts/build-themes.mjs: ${errors.length} error(es) de validación\n`);
	for (const e of errors) console.error(`  - ${e}`);
	console.error('');
	process.exit(1);
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const PERCENT_RE = /^-?[0-9]+(\.[0-9]+)?%$/;
const MIX_PERCENT_RE = new RegExp(`^${MIX_WEIGHT_SOURCE}%$`);
const KNOWN_NEUTRAL_KEYS = new Set(FINAL_NEUTRAL_KEYS);
const KNOWN_GROUPS = new Set([
	'frios',
	'calidos',
	'neutros',
	'verdes',
	'pastel-firma-mono',
	'iridiscentes'
]);

/** `FALLBACK_THEME` (§10): el tema al que cae `resolveDefaultTheme` y el que ve un PB virgen. */
export const FALLBACK_THEME_ID = 'niebla';

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateGradient(gradient, where, errors) {
	if (!gradient || typeof gradient !== 'object' || Array.isArray(gradient)) {
		errors.push(`${where} debe ser un objeto`);
		return;
	}
	for (const key of Object.keys(gradient)) {
		if (!['angle', 'stops'].includes(key)) errors.push(`${where}.${key} no permitido`);
	}
	if (typeof gradient.angle !== 'number' || !Number.isFinite(gradient.angle)) {
		errors.push(`${where}.angle debe ser un número finito`);
	}
	if (!Array.isArray(gradient.stops) || gradient.stops.length < 2) {
		errors.push(`${where}.stops necesita al menos 2 paradas`);
		return;
	}
	for (const [index, stop] of gradient.stops.entries()) {
		const stopWhere = `${where}.stops[${index}]`;
		if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
			errors.push(`${stopWhere} debe ser un objeto`);
			continue;
		}
		for (const key of Object.keys(stop)) {
			if (!['color', 'at'].includes(key)) errors.push(`${stopWhere}.${key} no permitido`);
		}
		if (!HEX_RE.test(stop.color ?? '')) errors.push(`${stopWhere}.color inválido (${stop.color})`);
		if (!PERCENT_RE.test(stop.at ?? '')) errors.push(`${stopWhere}.at inválido (${stop.at})`);
	}
}

/** Validación estructural mínima equivalente al JSON Schema, sin ajv en el pipeline. */
export function validateSchema(theme, errors) {
	if (theme === null || typeof theme !== 'object' || Array.isArray(theme)) {
		errors.push(`(sin id): el tema debe ser un objeto JSON (recibido: ${JSON.stringify(theme)})`);
		return;
	}
	const where = theme?.id ?? '(sin id)';
	const ALLOWED_ROOT = new Set([
		'$schema',
		'themeSchemaVersion',
		'id',
		'name',
		'group',
		'aliases',
		'roles',
		'derived',
		'modes',
		'effects',
		'__file'
	]);
	for (const key of Object.keys(theme)) {
		if (!ALLOWED_ROOT.has(key)) {
			errors.push(`${where}: clave "${key}" no permitida en la raíz`);
		}
	}
	if (theme.themeSchemaVersion !== 1) {
		errors.push(
			`${where}: themeSchemaVersion debe ser exactamente 1 (${theme.themeSchemaVersion})`
		);
	}
	if (!theme.id) errors.push(`${where}: falta "id"`);
	if (!theme.name) errors.push(`${where}: falta "name"`);
	if (!KNOWN_GROUPS.has(theme.group)) {
		errors.push(
			`${where}: "group" inválido (${theme.group}) — debe ser uno de ${[...KNOWN_GROUPS].join(', ')}`
		);
	}
	if (theme.aliases != null && !Array.isArray(theme.aliases)) {
		errors.push(`${where}: aliases debe ser un array`);
	} else if (theme.aliases) {
		for (const alias of theme.aliases) {
			if (typeof alias !== 'string' || alias.length < 1) {
				errors.push(`${where}: alias inválido (${alias})`);
			}
		}
	}

	const roles = theme.roles;
	if (!roles) {
		errors.push(`${where}: falta "roles"`);
		return;
	}
	const ALLOWED_ROLES = new Set(['tint', 'accent', 'accentInk', 'accentText']);
	for (const key of Object.keys(roles)) {
		if (!ALLOWED_ROLES.has(key)) errors.push(`${where}: roles.${key} no permitido`);
	}
	for (const key of ['tint', 'accent', 'accentInk']) {
		if (!HEX_RE.test(roles[key] ?? '')) {
			errors.push(`${where}: roles.${key} no es un color hex válido (${roles[key]})`);
		}
	}
	if (roles.accentText != null && !HEX_RE.test(roles.accentText)) {
		errors.push(`${where}: roles.accentText no es un color hex válido (${roles.accentText})`);
	}

	if (theme.derived != null && !isPlainObject(theme.derived)) {
		errors.push(`${where}: derived debe ser un objeto`);
	} else if (theme.derived) {
		for (const [key, value] of Object.entries(theme.derived)) {
			if (!['accentSoft', 'accentLine'].includes(key)) {
				errors.push(`${where}: derived.${key} no permitido`);
			} else {
				const valid =
					key === 'accentSoft'
						? typeof value === 'string' && DERIVED_ACCENT_SOFT_RE.test(value)
						: typeof value === 'string' && DERIVED_ACCENT_LINE_RE.test(value);
				if (!valid) {
					errors.push(
						`${where}: derived.${key} debe ser un color-mix(in oklab, #RRGGBB <porcentaje>, var(--${key === 'accentSoft' ? 'paper' : 'line'})) válido`
					);
				}
			}
		}
	}

	if (theme.modes != null && !isPlainObject(theme.modes)) {
		errors.push(`${where}: modes debe ser un objeto`);
	} else if (theme.modes) {
		// Claves de PRIMER nivel de "modes" (fix de code-review): sin esto, `modes: { auto: {} }`
		// o un typo (`ligth`) pasaba en silencio — el bucle de abajo solo LEE `modes.light`/
		// `modes.dark` por nombre fijo, nunca enumera qué claves hay REALMENTE declaradas, así
		// que una clave desconocida nunca se visitaba. El schema ajv (`modes.additionalProperties:
		// false`) SÍ lo cazaba → divergencia validador-propio vs oráculo, cerrada aquí.
		const ALLOWED_MODE_NAMES = new Set(['light', 'dark']);
		for (const key of Object.keys(theme.modes)) {
			if (!ALLOWED_MODE_NAMES.has(key))
				errors.push(`${where}: modes.${key} no es un modo conocido (light/dark)`);
		}
	}
	for (const modeName of ['light', 'dark']) {
		const mode = theme.modes?.[modeName];
		if (!mode) continue;
		if (!isPlainObject(mode)) {
			errors.push(`${where}: modes.${modeName} debe ser un objeto`);
			continue;
		}
		const ALLOWED_MODE = new Set(['tintBg', 'neutrals']);
		for (const key of Object.keys(mode)) {
			if (!ALLOWED_MODE.has(key)) errors.push(`${where}: modes.${modeName}.${key} no permitido`);
		}
		if (mode.tintBg != null && !MIX_PERCENT_RE.test(mode.tintBg)) {
			errors.push(`${where}: modes.${modeName}.tintBg no es un porcentaje válido (${mode.tintBg})`);
		}
		if (mode.neutrals != null && !isPlainObject(mode.neutrals)) {
			errors.push(`${where}: modes.${modeName}.neutrals debe ser un objeto`);
		} else if (mode.neutrals) {
			for (const [key, value] of Object.entries(mode.neutrals)) {
				if (!KNOWN_NEUTRAL_KEYS.has(key)) {
					errors.push(
						`${where}: modes.${modeName}.neutrals.${key} no es una clave de neutro conocida`
					);
				} else if (!HEX_RE.test(value)) {
					errors.push(
						`${where}: modes.${modeName}.neutrals.${key} no es un color hex válido (${value})`
					);
				}
			}
		}
	}

	const effects = theme.effects;
	if (effects != null && !isPlainObject(effects)) {
		errors.push(`${where}: effects debe ser un objeto`);
	} else if (effects) {
		const ALLOWED_EFFECTS = new Set([
			'fillGrad',
			'strokeGrad',
			'halo',
			'brandStops',
			'edgeOpacity',
			'slots'
		]);
		for (const key of Object.keys(effects)) {
			if (!ALLOWED_EFFECTS.has(key)) errors.push(`${where}: effects.${key} no permitido`);
		}
		if (effects.fillGrad) validateGradient(effects.fillGrad, `${where}: effects.fillGrad`, errors);
		if (effects.strokeGrad) {
			validateGradient(effects.strokeGrad, `${where}: effects.strokeGrad`, errors);
		}
		if (effects.halo) {
			if (!Array.isArray(effects.halo) || effects.halo.length < 1 || effects.halo.length > 3) {
				errors.push(`${where}: effects.halo necesita entre 1 y 3 capas`);
			} else {
				for (const [index, radial] of effects.halo.entries()) {
					const radialWhere = `${where}: effects.halo[${index}]`;
					if (!radial || typeof radial !== 'object' || Array.isArray(radial)) {
						errors.push(`${radialWhere} debe ser un objeto`);
						continue;
					}
					if ('css' in radial) {
						if (
							Object.keys(radial).length !== 1 ||
							typeof radial.css !== 'string' ||
							radial.css.length < 1
						) {
							errors.push(`${radialWhere}.css debe ser la única clave y no estar vacío`);
						}
						continue;
					}
					for (const key of Object.keys(radial)) {
						if (!['size', 'at', 'color', 'alpha', 'extent'].includes(key)) {
							errors.push(`${radialWhere}.${key} no permitido`);
						}
					}
					for (const key of ['size', 'at']) {
						if (typeof radial[key] !== 'string' || radial[key].length < 1) {
							errors.push(`${radialWhere}.${key} debe ser un string no vacío`);
						}
					}
					if (!HEX_RE.test(radial.color ?? '')) {
						errors.push(`${radialWhere}.color inválido (${radial.color})`);
					}
					if (!MIX_PERCENT_RE.test(radial.alpha ?? '')) {
						errors.push(`${radialWhere}.alpha inválido (${radial.alpha})`);
					}
					if (!PERCENT_RE.test(radial.extent ?? '')) {
						errors.push(`${radialWhere}.extent inválido (${radial.extent})`);
					}
				}
			}
		}
		if (effects.brandStops) {
			if (
				!Array.isArray(effects.brandStops) ||
				effects.brandStops.length !== 3 ||
				!effects.brandStops.every((stop) => HEX_RE.test(stop))
			) {
				errors.push(`${where}: effects.brandStops necesita exactamente 3 colores hex`);
			}
		}
		if (
			effects.edgeOpacity != null &&
			(typeof effects.edgeOpacity !== 'number' ||
				effects.edgeOpacity < 0 ||
				effects.edgeOpacity > 1)
		) {
			errors.push(`${where}: effects.edgeOpacity debe estar entre 0 y 1`);
		}
		if (effects.slots != null && !isPlainObject(effects.slots)) {
			errors.push(`${where}: effects.slots debe ser un objeto`);
		} else if (effects.slots) {
			for (const [key, value] of Object.entries(effects.slots)) {
				if (key !== 'fill') errors.push(`${where}: effects.slots.${key} no permitido`);
				if (!['fillGrad', 'strokeGrad'].includes(value)) {
					errors.push(`${where}: effects.slots.${key} referencia una pintura desconocida`);
				} else if (!effects[value]) {
					errors.push(`${where}: effects.slots.${key} referencia effects.${value} ausente`);
				}
			}
		}
	}
}

/** Contraste AA (§5.3, primera mitad): `accentInk` ≥4.5:1 sobre `accent`. Independiente del
 * modo (tint/accent/accentInk no varían por modo, §6.1 "los tres ejes son independientes" — el
 * PAR accentInk/accent lo es también). */
export function validateContrast(theme, errors) {
	const { id, roles, effects } = theme;
	const c = contrastRatio(roles.accentInk, roles.accent);
	if (c < 4.5) {
		errors.push(
			`${id}: accentInk (${roles.accentInk}) sobre accent (${roles.accent}) = ${c.toFixed(2)}:1 — necesita ≥4.5:1 (AA)`
		);
	}
	const fillKey = effects?.slots?.fill;
	const fill = fillKey ? effects?.[fillKey] : null;
	if (fill) {
		for (let segment = 0; segment < fill.stops.length - 1; segment += 1) {
			const from = fill.stops[segment].color;
			const to = fill.stops[segment + 1].color;
			const continuousMinimum = minimumSrgbGradientContrast(roles.accentInk, from, to);
			const rasterMinimum = minimumRasterizedSrgbGradientContrast(roles.accentInk, from, to);
			const minimum =
				continuousMinimum.contrast <= rasterMinimum.contrast ? continuousMinimum : rasterMinimum;
			if (minimum.contrast < 4.5) {
				errors.push(
					`${id}: accentInk (${roles.accentInk}) sobre ${fillKey}, segmento ${segment + 1} al ${(minimum.at * 100).toFixed(3)}% (sRGB, ${minimum.color}) = ${minimum.contrast.toFixed(4)}:1 — necesita ≥4.5:1 (AA)`
				);
				return;
			}
		}
	}
}

/**
 * El gate de contraste AA MEDIDO central (§5.3, L2): por cada tema × {claro, oscuro}, TODOS los
 * pares de `COMPONENT_CONTRAST_PAIRS` (incluidos `accentText` y los 4 semánticos con `danger`)
 * deben cumplir ≥4.5:1. Resuelve en JS la MISMA cascada base+tinte (`mixOklab`) que
 * `themeToCss` emite como `color-mix(in oklab, …)`, así que compara contra el color que
 * realmente pintará el navegador (§4.2, landmine de equivalencia — test §9.2).
 *
 * Sin lista de excepciones (ley 6 del maestro): si un tema/semántico no cumple, el mensaje es
 * accionable y el build rompe — no hay bypass.
 */
export function validateComponentContrast(theme, errors) {
	const { id } = theme;
	for (const mode of ['light', 'dark']) {
		const tokens = resolveComponentTokens(theme, mode);
		for (const [textKey, bgKey] of COMPONENT_CONTRAST_PAIRS) {
			const textHex = tokens[textKey];
			const bgHex = tokens[bgKey];
			const c = contrastRatio(textHex, bgHex);
			if (c < 4.5) {
				errors.push(
					`${id} (${mode}): ${textKey} (${textHex}) sobre ${bgKey} (${bgHex}) = ${c.toFixed(2)}:1 — necesita ≥4.5:1 (AA)`
				);
			}
		}
	}
}

/** Orden canónico de superficies para el guardarraíl de luminancia (§4.4). */
const NEUTRAL_LUMINANCE_ORDER = ['bg', 'sidebar', 'paper', 'surface-2', 'surface', 'btn', 'active'];

/**
 * Operador EXACTO (§4.4: "bg < sidebar ≤ paper ≤ surface-2 ≤ surface < btn < active") entre
 * cada par consecutivo de `NEUTRAL_LUMINANCE_ORDER`: `NEUTRAL_LUMINANCE_STRICT[i]` es el
 * operador entre `NEUTRAL_LUMINANCE_ORDER[i]` y `NEUTRAL_LUMINANCE_ORDER[i+1]` — `true` = `<`
 * (empate = error), `false` = `≤` (empate permitido). Fix de code-review (fidelidad al
 * contrato): antes se comparaba TODO con `<`-o-empate-siempre-ok, lo que admitía un empate
 * también en los tramos que el contrato exige estrictos (bg=sidebar, surface=btn, btn=active).
 */
const NEUTRAL_LUMINANCE_STRICT = [true, false, false, false, true, true];

/**
 * Override de neutros (§4.4, escape hatch Opción A de Lumbre): escala de luminancia coherente
 * con el modo, con el operador EXACTO por tramo (`NEUTRAL_LUMINANCE_STRICT`) + si se pisa
 * `ink`, AA ≥4.5:1 sobre `paper`. Ninguno de los 5 temas curados de v1 usa este mecanismo (§4.4:
 * "v1 puede no usar ningún override") — validado igualmente, para el primer tema con carácter
 * fuerte que lo necesite (fixtures sintéticos en tests/themes/).
 */
export function validateNeutrals(theme, errors) {
	for (const modeName of ['light', 'dark']) {
		const neutrals = theme.modes?.[modeName]?.neutrals;
		if (!neutrals) continue;
		const where = `${theme.id} (modes.${modeName}.neutrals)`;

		let prevIndex = -1;
		let prevLum = -Infinity;
		let prevKey = null;
		NEUTRAL_LUMINANCE_ORDER.forEach((key, index) => {
			if (!neutrals[key]) return;
			const lum = relativeLuminance(neutrals[key]);
			if (prevKey !== null) {
				// Si se saltan claves intermedias sin override, el tramo es estricto si CUALQUIER
				// eslabón saltado lo es (a≤b, b<c ⇒ a<c: la relación combinada es "<", no "≤").
				const strict = NEUTRAL_LUMINANCE_STRICT.slice(prevIndex, index).some(Boolean);
				const broken = strict ? lum <= prevLum : lum < prevLum;
				if (broken) {
					errors.push(
						`${where}: "${key}" (${neutrals[key]}) ${strict ? 'debe ser estrictamente más claro que' : 'no puede ser más oscuro que'} "${prevKey}" — la escala debe ser ascendente (bg < sidebar ≤ paper ≤ surface-2 ≤ surface < btn < active)`
					);
				}
			}
			prevIndex = index;
			prevLum = lum;
			prevKey = key;
		});

		if (neutrals.ink) {
			const paper = neutrals.paper;
			if (!paper) {
				errors.push(`${where}: define "ink" sin "paper" — no se puede verificar el contraste`);
			} else {
				const c = contrastRatio(neutrals.ink, paper);
				if (c < 4.5) {
					errors.push(
						`${where}: ink (${neutrals.ink}) sobre paper (${paper}) = ${c.toFixed(2)}:1 — necesita ≥4.5:1 (AA)`
					);
				}
			}
		}
	}
}

/** Unicidad de ALIASES (§4.4): un alias no puede colisionar con un id existente ni repetirse
 * entre temas. La unicidad de los IDS la garantiza `findDuplicateThemeIds`. */
export function validateUniqueness(themes, errors) {
	const ids = new Map(themes.map((t) => [t.id, t.__file]));
	const aliasesSeen = new Map();
	for (const t of themes) {
		for (const alias of t.aliases ?? []) {
			if (ids.has(alias)) {
				errors.push(`alias "${alias}" (de ${t.id}) colisiona con un id existente`);
			}
			if (aliasesSeen.has(alias)) {
				errors.push(`alias "${alias}" duplicado (${aliasesSeen.get(alias)} y ${t.id})`);
			}
			aliasesSeen.set(alias, t.id);
		}
	}
}

/** Detecta ids duplicados entre ficheros `*.theme.json` — sin esto, un id repetido se
 * sobrescribiría EN SILENCIO al colapsar la lista en el Map by-id de `loadThemes`. */
export function findDuplicateThemeIds(themes, errors) {
	const seen = new Map();
	for (const t of themes) {
		if (seen.has(t.id)) {
			errors.push(`id duplicado: "${t.id}" (${seen.get(t.id)} y ${t.__file})`);
		} else {
			seen.set(t.id, t.__file);
		}
	}
}

// ── Orquestación (I/O — solo corre si el script se invoca directamente) ────

/** `index.json` ↔ ficheros coherente (§5.3 guardarraíles adicionales): cada id de `index` debe
 * tener su `<id>.theme.json`, y cada tema parseado debe estar listado en `index`. Extraída de
 * `loadThemes` para poder testearla sin tocar disco (fixtures sintéticos, §9.4). */
export function validateIndexCoherence(parsedThemes, index, errors) {
	const byId = new Map(parsedThemes.map((t) => [t.id, t]));
	for (const id of index) {
		if (!byId.has(id)) errors.push(`index.json referencia "${id}" pero no existe ${id}.theme.json`);
	}
	for (const [id, theme] of byId) {
		if (!index.includes(id)) {
			errors.push(`${theme.__file ?? id}: id "${id}" no está listado en index.json`);
		}
	}
}

function loadThemes() {
	const index = JSON.parse(readFileSync(join(THEMES_DIR, 'index.json'), 'utf8'));
	const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.theme.json'));
	const parsed = files.map((file) => {
		const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), 'utf8'));
		theme.__file = file;
		return theme;
	});

	const errors = [];
	findDuplicateThemeIds(parsed, errors);
	if (errors.length > 0) fail(errors);

	validateIndexCoherence(parsed, index, errors);
	if (errors.length > 0) fail(errors);

	const byId = new Map(parsed.map((t) => [t.id, t]));
	return index.map((id) => byId.get(id));
}

async function main() {
	const themes = loadThemes();

	const errors = [];
	for (const theme of themes) validateSchema(theme, errors);
	if (errors.length > 0) fail(errors);
	for (const theme of themes) {
		validateContrast(theme, errors);
		validateComponentContrast(theme, errors);
		validateNeutrals(theme, errors);
	}
	validateUniqueness(themes, errors);
	if (errors.length > 0) fail(errors);

	// CSS: bloques globales + un bloque por tema, en el orden de index.json.
	const cssBody = globalCss() + '\n' + themes.map((t) => themeToCss(t)).join('\n');
	const cssConfig = await prettier.resolveConfig(CSS_OUT);
	const cssOut = await prettier.format(`${HEADER}\n\n${cssBody}`, {
		...cssConfig,
		parser: 'css',
		filepath: CSS_OUT
	});
	writeFileSync(CSS_OUT, cssOut);

	// themes.generated.ts: THEMES (swatches) + ThemeId (unión literal) + THEME_ALIASES.
	const themeIdUnion = themes.map((t) => JSON.stringify(t.id)).join(' | ');
	const swatches = themes.map((t) => themeToSwatch(t));
	const aliasEntries = [];
	for (const t of themes) {
		for (const alias of t.aliases ?? []) aliasEntries.push([alias, t.id]);
	}

	const ts = `${HEADER}
// Fuente: src/lib/themes/*.theme.json + index.json. Regenerar con \`pnpm themes:build\`.
// Consumido por src/lib/themes/theme.svelte.ts (§6.1: theme.swatches) y
// src/lib/themes/resolve-default.ts (§6.4: knownIds = ids + aliases).

/** Unión literal de los ids de tema v1 (§5.1, "tipado estricto"). */
export type ThemeId = ${themeIdUnion};

/** Id de tema (canónico o alias) reconocido por el motor: unión de \`ThemeId\` con los alias
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
	/** Pintura final del selector: acento sólido o gradiente enrutado por \`effects.slots.fill\`. */
	fill: string;
}

/** Swatches para el selector de tema de P3 (§6.1 \`theme.swatches\`), en el orden de
 * \`index.json\`. */
export const THEMES: ThemeSwatch[] = ${JSON.stringify(swatches, null, '\t')};

/** \`FALLBACK_THEME\` (§10): el tema por defecto/de fallback (frío neutro). */
export const FALLBACK_THEME: ThemeId = ${JSON.stringify(FALLBACK_THEME_ID)};

/** Alias → id canónico (§6.4: "ids antiguos que migran a este, nunca se borran"). */
export const THEME_ALIASES: Record<string, ThemeId> = ${JSON.stringify(Object.fromEntries(aliasEntries), null, '\t')};
`;
	const tsConfig = await prettier.resolveConfig(TS_OUT);
	const tsOut = await prettier.format(ts, { ...tsConfig, parser: 'typescript', filepath: TS_OUT });
	writeFileSync(TS_OUT, tsOut);

	console.log(`✓ ${themes.length} temas → themes.generated.css + themes.generated.ts`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	main();
}
