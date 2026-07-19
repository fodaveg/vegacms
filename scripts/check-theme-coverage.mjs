#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ver el porqué justo debajo
// @ts-nocheck — mismo motivo que `scripts/build-themes.mjs`: `tests/themes/check-theme-
// coverage.test.ts` importa este fichero directamente para testear sus funciones puras, lo que
// lo arrastra al programa de `svelte-check` pese a que `scripts/` no está en el `include` de
// `.svelte-kit/tsconfig.json` — sin el pragma serían ~30 errores de "implicit any".
//
// Barrera anti-parches del motor de temas de Vega (§5.4 del contrato P7, L1 "la UI solo
// consume tokens de rol"). Versión SIMPLIFICADA del `check-theme-coverage.mjs` de Lumbre: Vega
// no tiene efectos/slots (D4, sin efectos en v1, §8) — el scaffolding de los puntos 4-5 de
// Lumbre (pintura L2a directa, hooks huérfanos slot↔registro) NO se porta, no hay nada que
// vigilar ahí (queda anotado como hueco §8, se reabre si v2 trae efectos).
//
// Comprueba (acumulando TODOS los errores antes de salir):
//   1. Artefactos generados al día (`themes.generated.css`/`themes.generated.ts` == lo que
//      produce `scripts/build-themes.mjs` desde los `*.theme.json`).
//   2. Ningún color crudo (hex/`rgb()`/`hsl()`/`oklch()`/`color-mix()` de marca) en un
//      `.svelte`/`.ts` FUERA de `src/lib/themes/` — la UI solo consume `var(--token)` del
//      vocabulario cerrado §3 (`ALLOWLIST_RAW_COLOR` para el caso legítimo que aparezca).
//   3. Ningún `[data-theme=` a mano en `src/**` fuera del CSS generado (selector por-tema
//      prohibido: nace de ahí la superficie sin clasificar, mismo motivo que Lumbre §6.2-7).
//
// **Encadenado a `pnpm lint`/CI desde F7w-c** (ver `package.json`): F7w-a/b purificaron los 40
// consumidores al vocabulario §3 y F7w-c cerró los 3 focos de color crudo que quedaban
// (`ManifestEditor.svelte`, sombras de modal/sidebar/toast → `--shadow-card`, scrims sin token
// allowlisted abajo) — ya no hay ningún `.svelte`/`.ts` de la app pintando fuera de §3, así que
// `pnpm lint` (y por tanto `pnpm gate`/CI) muerde si aparece color crudo nuevo o
// `[data-theme=` a mano. Sigue pudiendo ejecutarse a mano con
// `node scripts/check-theme-coverage.mjs` (o `pnpm themes:check-coverage`).
//
// Las funciones de detección son PURAS `(ficheros, …) => resultado`, igual que los
// validadores de `build-themes.mjs`, para poder testearlas con fixtures sintéticos sin tocar
// disco — ver `tests/themes/check-theme-coverage.test.ts`.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES_CSS_PATH = join(ROOT, 'src/lib/themes/themes.generated.css');
const THEMES_TS_PATH = join(ROOT, 'src/lib/themes/themes.generated.ts');
const BUILD_THEMES_SCRIPT = join(ROOT, 'scripts/build-themes.mjs');

// ── ALLOWLIST de color crudo (§5.4 punto 2) ────────────────────────────────
//
// Ya NO vacía tras F7w-c: dos categorías de caso legítimo, ambas justificadas en su entrada.
//
// 1. Scrims/velos de fondo de modales y del overlay móvil del sidebar (`rgb(15 17 21 / N%)`):
//    §3 es un vocabulario CERRADO (`theme-tokens.ts`) y no tiene token de scrim — un velo
//    semitransparente sobre el resto de la app no es una superficie del tema (no cambia entre
//    modos claro/oscuro ni entre paletas), es una constante de UI. Las SOMBRAS de elevación de
//    esos mismos componentes SÍ son theme-aware y usan `var(--shadow-card)` — solo el velo de
//    fondo queda crudo.
// 2. Fixtures de test de `richtext/*.test.ts`: `java&#115;cript:` (entidad HTML decimal de una
//    `s`, para probar que `safe-uri.ts` decodifica esquemas ofuscados) contiene el substring
//    `#115` que matchea `RAW_COLOR_RE` como si fuera un hex de 3 dígitos — falso positivo del
//    regex, no color de ningún tipo.
export const ALLOWLIST_RAW_COLOR = [
	{
		file: 'src/lib/list/DeleteConfirm.svelte',
		snippet: 'rgb(15 17 21 / 55%)'
	},
	{
		file: 'src/lib/shell/ReloginModal.svelte',
		snippet: 'rgb(15 17 21 / 55%)'
	},
	{
		file: 'src/lib/shell/Sidebar.svelte',
		snippet: 'rgb(15 17 21 / 45%)'
	},
	{
		file: 'src/lib/media/MediaDetail.svelte',
		snippet: 'rgb(15 17 21 / 55%)'
	},
	{
		file: 'src/lib/media/MediaDeleteConfirm.svelte',
		snippet: 'rgb(15 17 21 / 55%)'
	},
	{
		file: 'src/lib/richtext/safe-uri.test.ts',
		snippet: 'java&#115;cript'
	},
	{
		file: 'src/lib/richtext/sanitize.test.ts',
		snippet: 'java&#115;cript'
	},
	{
		file: 'src/lib/richtext/markdown.test.ts',
		snippet: 'java&#115;cript'
	}
];

// Todo `src/lib/themes/**` es infraestructura del propio motor: el generador/store/CSS
// generado legítimamente CONSTRUYEN o CITAN colores crudos / `[data-theme=` como STRING (es
// literalmente lo que produce el pipeline), no código de aplicación que deba pintar con
// `var(--token)`. `main()` solo escanea `src/` (los fixtures sintéticos de
// `tests/themes/check-theme-coverage.test.ts` no pasan por aquí: llaman a las funciones puras
// de abajo directamente, sin tocar disco).
function isThemesInfraFile(file) {
	return file.startsWith('src/lib/themes/');
}

// ── utilidades de fichero (I/O) ────────────────────────────────────────────

function walk(dir, exts, ignoreDirs = new Set(['node_modules', '.svelte-kit', 'build'])) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (ignoreDirs.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full, exts, ignoreDirs));
		} else if (exts.some((ext) => entry.name.endsWith(ext))) {
			out.push(full);
		}
	}
	return out;
}

function toPosixRelative(absPath) {
	return relative(ROOT, absPath).split(sep).join('/');
}

/** Lee una lista de rutas absolutas → `{ file: <ruta relativa POSIX>, content }`. */
function readAsEntries(absPaths) {
	return absPaths.map((abs) => ({
		file: toPosixRelative(abs),
		content: readFileSync(abs, 'utf8')
	}));
}

/**
 * Quita comentarios de bloque (`/* *\/`) y de línea (`//`) sustituyendo cada carácter (salvo
 * saltos de línea) por un espacio, para no reportar un color crudo que solo aparece dentro de
 * un comentario/JSDoc — conserva el nº de línea original.
 */
export function stripComments(content) {
	return content
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));
}

// ── 2 · color crudo fuera de src/lib/themes/ ───────────────────────────────

const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(|color-mix\(/;

/**
 * `files`: `{file, content}[]` YA filtrados con `isThemesInfraFile` excluidos. `allowlist`:
 * ver `ALLOWLIST_RAW_COLOR`. Devuelve las violaciones y las entradas de la allowlist que ya no
 * encuentran su snippet (allowlist obsoleta — aviso, no error).
 */
export function findRawColorViolations(files, allowlist) {
	const violations = [];
	const matched = new Set();
	for (const { file, content } of files) {
		const clean = stripComments(content);
		clean.split('\n').forEach((line, i) => {
			if (!RAW_COLOR_RE.test(line)) return;
			const allowIndex = allowlist.findIndex((e) => e.file === file && line.includes(e.snippet));
			if (allowIndex === -1) {
				violations.push({ file, line: i + 1, text: line.trim() });
			} else {
				matched.add(allowIndex);
			}
		});
	}
	const staleAllowlist = allowlist.filter((_, idx) => !matched.has(idx));
	return { violations, staleAllowlist };
}

// ── 3 · [data-theme= a mano ─────────────────────────────────────────────────

const DATA_THEME_RE = /\[data-theme=/;

/** `files`: `{file, content}[]` YA filtrados con `isThemesInfraFile` excluidos. */
export function findDataThemeViolations(files) {
	const violations = [];
	for (const { file, content } of files) {
		const clean = stripComments(content);
		clean.split('\n').forEach((line, i) => {
			if (DATA_THEME_RE.test(line)) violations.push({ file, line: i + 1, text: line.trim() });
		});
	}
	return violations;
}

// ── 1 · artefactos generados al día ────────────────────────────────────────

/**
 * Regenera `themes.generated.css`/`themes.generated.ts` invocando el generador de verdad
 * (mismo comando que `pnpm themes:build`) y compara con el contenido que había en disco ANTES
 * de invocarlo. Si difieren, deja el fichero regenerado (es el correcto): el mensaje de error
 * pide commitearlo.
 */
function checkArtifactsInSync(errors) {
	if (!existsSync(THEMES_CSS_PATH) || !existsSync(THEMES_TS_PATH)) {
		errors.push(
			'Faltan los artefactos generados (themes.generated.css / themes.generated.ts) — corre `pnpm themes:build`.'
		);
		return;
	}
	const before = {
		css: readFileSync(THEMES_CSS_PATH, 'utf8'),
		ts: readFileSync(THEMES_TS_PATH, 'utf8')
	};
	try {
		execFileSync(process.execPath, [BUILD_THEMES_SCRIPT], { cwd: ROOT, stdio: 'pipe' });
	} catch (e) {
		errors.push(`El generador de temas (scripts/build-themes.mjs) falló: ${e.message}`);
		return;
	}
	const after = {
		css: readFileSync(THEMES_CSS_PATH, 'utf8'),
		ts: readFileSync(THEMES_TS_PATH, 'utf8')
	};
	if (before.css !== after.css || before.ts !== after.ts) {
		errors.push(
			'themes.generated.css / themes.generated.ts estaban desincronizados de los *.theme.json ' +
				'— ya quedan regenerados en disco (contenido correcto): revisa el diff y commitéalo con ' +
				'`pnpm themes:build`.'
		);
	}
}

// ── orquestación ────────────────────────────────────────────────────────────

function main() {
	const errors = [];
	const warnings = [];

	checkArtifactsInSync(errors);

	const candidates = readAsEntries(
		walk(join(ROOT, 'src'), ['.svelte', '.ts']).filter(
			(abs) => !isThemesInfraFile(toPosixRelative(abs))
		)
	);

	const { violations: rawColorViolations, staleAllowlist } = findRawColorViolations(
		candidates,
		ALLOWLIST_RAW_COLOR
	);
	for (const v of rawColorViolations) {
		errors.push(
			`color crudo fuera de src/lib/themes/: ${v.file}:${v.line}\n      → ${v.text}\n      Pinta con ` +
				`var(--token) del vocabulario cerrado (§3) o añade una entrada justificada a ` +
				`ALLOWLIST_RAW_COLOR en scripts/check-theme-coverage.mjs.`
		);
	}
	for (const s of staleAllowlist) {
		warnings.push(
			`allowlist de color crudo obsoleta: ${s.file} ("${s.snippet}") ya no se encuentra — retírala.`
		);
	}

	for (const v of findDataThemeViolations(candidates)) {
		errors.push(
			`[data-theme= a mano fuera del CSS generado: ${v.file}:${v.line}\n      → ${v.text}\n      Los ` +
				'temas se conmutan vía theme.svelte.ts/applyTheme (§6.1), nunca por selector escrito a mano.'
		);
	}

	for (const w of warnings) console.warn(`⚠ ${w}`);

	if (errors.length > 0) {
		console.error(
			`\n❌ check-theme-coverage: ${errors.length} violación(es) de la barrera anti-parches\n`
		);
		for (const e of errors) console.error(`  - ${e}`);
		console.error('');
		process.exit(1);
	}

	console.log(
		`✓ motor de temas sin regresiones: artefactos al día, ${ALLOWLIST_RAW_COLOR.length} color(es) allowlisted.`
	);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	main();
}
