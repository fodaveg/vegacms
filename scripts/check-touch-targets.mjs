#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ver el porqué justo debajo
// @ts-nocheck (mismo motivo que `scripts/check-theme-coverage.mjs`): `tests/visual/
// check-touch-targets.test.ts` importa este fichero directamente para testear sus funciones
// puras, lo que lo arrastra al programa de `svelte-check` pese a que `scripts/` no está en el
// `include` de `.svelte-kit/tsconfig.json`.

/**
 * Guardarraíl del objetivo táctil de 44×44 px (checklist de accesibilidad del editor visual).
 *
 * Revisa los componentes de `src/lib/visual/` que se le pasan (lista fija abajo, `COMPONENT_FILES`)
 * y, para cada control interactivo del marcado (`<button>`, `<a href>`, `<input>`, `<select>`,
 * `<textarea>`), calcula la caja que le declara su propio `<style>` cuando el puntero es basto
 * (`@media (pointer: coarse)`, que gana sobre lo declarado fuera de cualquier `@media`). Falla si
 * esa caja mide menos de 44 px en anchura o en altura.
 *
 * ## Qué es esto y qué NO es
 *
 * Es un lector del CSS DECLARADO por clase, no un navegador: no resuelve la cascada entera, no
 * mira el padding ni el `flex` ni nada heredado de una hoja global, y solo entiende declaraciones
 * en `px`/`rem` (raíz de 16 px, la que usa este repo). Solo cuentan las declaraciones que vengan
 * de dos sitios: fuera de cualquier `@media` (la caja "base") y dentro de `@media (pointer:
 * coarse)` (que sustituye a la base cuando declara algo). Cualquier OTRO `@media` (puntos de corte
 * de anchura, por ejemplo) queda fuera de alcance a propósito: mezclarlo con la caja de puntero
 * basto exigiría saber si esa otra condición está activa, y este script no simula el navegador.
 *
 * Un control cuyo tamaño de verdad depende de eso (padding + tipografía, un selector de etiqueta
 * en vez de clase, o una regla dentro de un `@media` que no sea `pointer: coarse`) no sale
 * "aprobado" en silencio: cuando ninguna de las dos dimensiones falla por lo que SÍ se puede leer
 * pero alguna sigue sin caja conocida, el control se reporta aparte como "no medible" (aviso, no
 * error). Si una dimensión SÍ se puede leer y mide menos de 44 px, se reporta como fallo aunque la
 * otra dimensión sea de las que no se pueden leer: mejor un fallo real que una etiqueta de "no
 * medible" tapando un botón que de verdad es pequeño.
 *
 * ## Selector: solo clase pura
 *
 * Una regla solo se atribuye a un control si su selector (tras partir por comas) es EXACTAMENTE
 * `.nombre-de-clase`, sin pseudo-clases, sin atributos, sin combinadores ni descendientes. Es la
 * misma limitación de fuente que el resto del script: `.foo:hover`, `.foo[disabled]` o `.bar .foo`
 * no aportan caja aquí aunque en el navegador sí la fijen. Un control sin ninguna clase (el tamaño
 * le llega por un selector de etiqueta como `.padre button`) tampoco tiene ninguna regla que
 * pueda casar, así que sale siempre "no medible".
 *
 * Las funciones de abajo son PURAS `(fuente) => resultado`, mismo criterio que
 * `scripts/check-theme-coverage.mjs`, para poder testearlas con fixtures sintéticos sin tocar
 * disco (ver `tests/visual/check-touch-targets.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Componentes revisados, en el orden en que se listan en el informe. */
export const COMPONENT_FILES = [
	'src/lib/visual/VisualEditorScreen.svelte',
	'src/lib/visual/VisualBlockTree.svelte',
	'src/lib/visual/VisualOverlay.svelte',
	'src/lib/visual/VisualColumnResizer.svelte',
	// Encargo "paleta de bloques arrastrable": botones de verdad nuevos, mismo criterio de medición
	// que el resto de esta lista — sin sumarla aquí, el guardarraíl no la habría visto nunca.
	'src/lib/visual/VisualPalette.svelte'
];

/** El número que firma la checklist de accesibilidad del editor visual. */
const TOUCH_TARGET_PX = 44;

const REM_PX = 16;

const CONTROL_TAGS = ['button', 'a', 'input', 'select', 'textarea'];

const TRACKED_PROPS = ['width', 'height', 'min-width', 'min-height'];

// ── 1 · enumerar los controles del marcado ─────────────────────────────────

const TAG_OPEN_RE = new RegExp(`<(${CONTROL_TAGS.join('|')})(?=[\\s/>])`, 'g');

/**
 * Busca, a partir de `start` (el índice de la `<` de apertura), el índice del `>` que cierra la
 * etiqueta. Cuenta llaves para no confundir un `>` de dentro de una expresión Svelte (`{...}`,
 * frecuente en atajos como `() => ...`) con el cierre real de la etiqueta; no entiende comillas
 * DENTRO de una expresión, así que una cadena JS con `{`/`}` literales despistaría el conteo, caso
 * que no aparece en este repo hoy. Devuelve `-1` si no encuentra cierre (etiqueta mal formada).
 */
export function findTagEnd(source, start) {
	let i = start;
	let depth = 0;
	let quote = null;
	while (i < source.length) {
		const c = source[i];
		if (quote) {
			if (c === quote) quote = null;
			i++;
			continue;
		}
		if (depth === 0 && (c === '"' || c === "'")) {
			quote = c;
			i++;
			continue;
		}
		if (c === '{') {
			depth++;
			i++;
			continue;
		}
		if (c === '}') {
			depth--;
			i++;
			continue;
		}
		if (depth === 0 && c === '>') return i;
		i++;
	}
	return -1;
}

/**
 * Clases de una etiqueta ya extraída, separando las FIJAS (`class="a b"`) de las CONDICIONALES
 * (`class:nombre={...}`), que solo están puestas parte del tiempo.
 *
 * La distinción no es cosmética, es la diferencia entre medir y mentir. Este script no puede
 * evaluar la condición, así que si una clase condicional fuera la que fija la caja de un control
 * —por ejemplo una variante "seleccionada" con un `min-height` MAYOR que el de su clase base—,
 * dar por buena esa medida sería reportar el tamaño del caso MEJOR como si fuera el de siempre:
 * un PASE falso silencioso, que es justo lo que este guardarraíl no puede permitirse (un "no
 * medible" declarado es aceptable; un pase falso no). Por eso `evaluateControl` degrada a "no
 * medible" cualquier dimensión cuya declaración ganadora venga de una clase condicional.
 *
 * Hoy, en los cuatro componentes de la lista, ninguna clase condicional declara tamaño, así que
 * esto no cambia ni un veredicto: fija la invariante para que deje de ser cierta POR CASUALIDAD.
 */
function extractClasses(tagSource) {
	const classes = new Set();
	const conditional = new Set();
	const staticMatch = /\bclass\s*=\s*(['"])([^'"]*)\1/.exec(tagSource);
	if (staticMatch) {
		for (const c of staticMatch[2].split(/\s+/)) if (c) classes.add(c);
	}
	for (const m of tagSource.matchAll(/\bclass:([A-Za-z_][A-Za-z0-9_-]*)/g)) {
		classes.add(m[1]);
		conditional.add(m[1]);
	}
	return { classes: [...classes], conditional: [...conditional] };
}

/**
 * Aísla el marcado de un componente Svelte: quita el `<script>`, el `<style>` y cualquier
 * comentario HTML (`<!-- ... -->`), sustituyendo cada carácter (salvo saltos de línea) por un
 * espacio para no desplazar el resto de posiciones. Sin este paso, un comentario que MENCIONE una
 * etiqueta a modo de prosa (algo tan habitual en este repo como "el propio `<button>`
 * (`aria-label`)…", visto en varias cabeceras) se leería como un control de verdad, con cero
 * clases: `checkComponent` llama a esto ANTES de `extractControls` para evitar justo ese fantasma.
 */
/**
 * Quita los comentarios HTML (`<!-- ... -->`), sustituyendo cada carácter (salvo saltos de línea)
 * por un espacio. Va SIEMPRE antes de buscar `<script>`/`<style>` o cualquier etiqueta de control:
 * un comentario de prosa puede mencionar una etiqueta como texto (visto de verdad en
 * `VisualOverlay.svelte`, justo debajo de su `</script>` real: "no solo en el `<style>` de
 * abajo…") y, sin quitarlo antes, cualquier corte por nombre de etiqueta la tomaría por el
 * delimitador de apertura y se comería todo hasta el cierre real siguiente.
 */
export function stripHtmlComments(content) {
	return content.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Quita el `<script>` y el `<style>` de un componente ya sin comentarios HTML (ver
 *  `stripHtmlComments`): lo que queda es el marcado de verdad, sobre el que `extractControls`
 *  puede buscar controles sin que un comentario de JS/CSS mencionando una etiqueta a modo de
 *  prosa (`// el propio <button>…`) cuente como uno. */
export function extractMarkup(content) {
	const withoutComments = stripHtmlComments(content);
	const stripBlock = (text, tag) =>
		text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), (m) =>
			m.replace(/[^\n]/g, ' ')
		);
	return stripBlock(stripBlock(withoutComments, 'script'), 'style');
}

/**
 * Enumera los controles del marcado (ver cabecera del fichero para la lista de etiquetas y por
 * qué solo `<a href>` cuenta). Devuelve `{ tag, classes, conditional }[]`, uno por cada etiqueta
 * encontrada, en el orden en que aparecen. Espera recibir ya solo marcado (ver `extractMarkup`):
 * sobre el contenido ENTERO de un componente contaría también lo que mencionen a modo de prosa los
 * comentarios del `<script>`/`<style>`.
 */
export function extractControls(content) {
	const controls = [];
	TAG_OPEN_RE.lastIndex = 0;
	let match;
	while ((match = TAG_OPEN_RE.exec(content))) {
		const tag = match[1];
		const start = match.index;
		const end = findTagEnd(content, start);
		if (end === -1) continue;
		const tagSource = content.slice(start, end + 1);
		if (tag === 'a' && !/\bhref\s*=/.test(tagSource)) {
			TAG_OPEN_RE.lastIndex = end + 1;
			continue;
		}
		controls.push({ tag, ...extractClasses(tagSource) });
		TAG_OPEN_RE.lastIndex = end + 1;
	}
	return controls;
}

// ── 2 · leer las cajas que declara el <style> ──────────────────────────────

function stripCssComments(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Parte `css` en bloques de nivel superior, contando llaves para encontrar el cierre de cada uno
 * (así una regla anidada dentro de un `@media` no se confunde con una regla del nivel de arriba).
 * Devuelve `{ type: 'rule', selector, body }` o `{ type: 'media', condition, body }`; cualquier
 * otra at-rule (`@supports`, `@keyframes`…) se descarta, no aporta clases de control.
 */
function parseTopLevelBlocks(css) {
	const nodes = [];
	const n = css.length;
	let i = 0;
	while (i < n) {
		while (i < n && /\s/.test(css[i])) i++;
		if (i >= n) break;
		const headerStart = i;
		while (i < n && css[i] !== '{') i++;
		if (i >= n) break; // regla sin llave de cierre: fuente mal formada, se ignora el resto
		const header = css.slice(headerStart, i).trim();
		let depth = 1;
		i++;
		const bodyStart = i;
		while (i < n && depth > 0) {
			if (css[i] === '{') depth++;
			else if (css[i] === '}') depth--;
			i++;
		}
		const body = css.slice(bodyStart, i - 1);
		if (header.startsWith('@media')) {
			nodes.push({ type: 'media', condition: header.slice('@media'.length).trim(), body });
		} else if (!header.startsWith('@')) {
			nodes.push({ type: 'rule', selector: header, body });
		}
	}
	return nodes;
}

/** `true` si la condición del `@media`, sin espacios, es literalmente `(pointer:coarse)`. Otras
 *  formas (combinada con `and`, con `screen`) no aparecen hoy en este repo y se tratan como un
 *  `@media` cualquiera (fuera de alcance, ver cabecera del fichero). */
function isPointerCoarse(condition) {
	return condition.replace(/\s+/g, '') === '(pointer:coarse)';
}

function parseDeclarations(body) {
	const decls = {};
	for (const statement of body.split(';')) {
		const idx = statement.indexOf(':');
		if (idx === -1) continue;
		const prop = statement.slice(0, idx).trim().toLowerCase();
		if (!TRACKED_PROPS.includes(prop)) continue;
		decls[prop] = statement.slice(idx + 1).trim();
	}
	return decls;
}

/** `.nombre` si el selector es una clase pura (sin pseudo-clases, atributos ni combinadores), o
 *  `null` en cualquier otro caso (ver cabecera del fichero, "Selector: solo clase pura"). */
function plainClassName(selector) {
	const match = /^\.([A-Za-z_][A-Za-z0-9_-]*)$/.exec(selector);
	return match ? match[1] : null;
}

function collectDecls(selectorList, body, out) {
	const decls = parseDeclarations(body);
	if (Object.keys(decls).length === 0) return;
	for (const rawSelector of selectorList.split(',')) {
		const className = plainClassName(rawSelector.trim());
		if (className === null) continue;
		for (const prop of TRACKED_PROPS) {
			if (decls[prop] !== undefined) out.push({ className, prop, value: decls[prop] });
		}
	}
}

/**
 * Lee el `<style>` de un componente y separa sus declaraciones de tamaño en dos listas, cada una
 * en el orden en que aparecen en el fichero (para que, si dos reglas de la MISMA clase declaran
 * la misma propiedad, gane la última, igual que en una cascada real de igual especificidad):
 * - `base`: fuera de cualquier `@media`.
 * - `coarse`: dentro de `@media (pointer: coarse)`.
 *
 * Cualquier otro `@media` se descarta entero (ver cabecera del fichero).
 */
export function parseStyleScopes(styleContent) {
	const stripped = stripCssComments(styleContent);
	const base = [];
	const coarse = [];
	for (const node of parseTopLevelBlocks(stripped)) {
		if (node.type === 'rule') {
			collectDecls(node.selector, node.body, base);
		} else if (node.type === 'media' && isPointerCoarse(node.condition)) {
			for (const inner of parseTopLevelBlocks(node.body)) {
				if (inner.type === 'rule') collectDecls(inner.selector, inner.body, coarse);
			}
		}
	}
	return { base, coarse };
}

// ── 3 · resolver la caja de un control y decidir el veredicto ──────────────

/** `px`/`rem` únicamente (raíz de 16px, ver cabecera del fichero). Cualquier otra unidad
 *  (`%`, `em`, `calc()`, `var()`…) no se sabe convertir: `null`, tratado como "no declarado" por
 *  quien llama. */
export function toPx(value) {
	const match = /^(-?\d+(?:\.\d+)?)(px|rem)$/.exec(value.trim());
	if (!match) return null;
	const num = Number(match[1]);
	return match[2] === 'rem' ? num * REM_PX : num;
}

/** Última declaración de `prop` entre las de `decls` cuya clase esté en `classes` (mismo criterio
 *  de cascada que `collectDecls`: la que aparece más tarde en el fichero gana). `null` si ninguna
 *  clase del control declara esa propiedad. */
function lastMatch(classes, decls, prop) {
	let winner = null;
	for (const decl of decls) {
		if (decl.prop === prop && classes.includes(decl.className)) winner = decl;
	}
	return winner;
}

/** Resuelve una dimensión (anchura o altura) dentro de UN solo ámbito (`base` o `coarse`),
 *  combinando la propiedad directa (`width`/`height`) con su `min-*`: si las dos declaran un
 *  número, manda la mayor (igual que en CSS de verdad, `min-*` nunca deja que el valor use menos
 *  de lo que fija). `null` si ninguna de las dos se puede leer. */
function resolveDimension(classes, decls, prop, minProp) {
	const valueDecl = lastMatch(classes, decls, prop);
	const minDecl = lastMatch(classes, decls, minProp);
	const valuePx = valueDecl ? toPx(valueDecl.value) : null;
	const minPx = minDecl ? toPx(minDecl.value) : null;
	if (valuePx === null && minPx === null) return null;
	if (valuePx === null) return { px: minPx, raw: minDecl.value, className: minDecl.className };
	if (minPx === null) return { px: valuePx, raw: valueDecl.value, className: valueDecl.className };
	return minPx > valuePx
		? { px: minPx, raw: minDecl.value, className: minDecl.className }
		: { px: valuePx, raw: valueDecl.value, className: valueDecl.className };
}

/** Caja de una dimensión bajo los dos punteros: `fine` es solo `base` (lo que ve un ratón/
 *  trackpad); `coarse` es `base` sustituido por lo que declare `@media (pointer: coarse)` si
 *  declara algo (si no declara nada, cae a `fine`: sin bloque de puntero basto para esa clase, la
 *  caja de siempre es la única que hay). */
function dimensionBox(classes, base, coarse, prop, minProp) {
	const fine = resolveDimension(classes, base, prop, minProp);
	const coarseOverride = resolveDimension(classes, coarse, prop, minProp);
	return { fine, coarse: coarseOverride ?? fine };
}

/** Propiedades de caja que este script sabe leer (ver `resolveDimension`). */
const SIZE_PROPS = ['width', 'height', 'min-width', 'min-height'];

/**
 * Clases CONDICIONALES de un control que declaran alguna propiedad de caja (ver `extractClasses`).
 * El control se MIDE en reposo, o sea ignorando estas clases; que alguna declare tamaño se avisa
 * aparte, porque significa que hay un estado del control cuya caja este script no juzga.
 */
function conditionalSizedClasses(conditional, ...declLists) {
	const found = new Set();
	for (const decls of declLists) {
		for (const decl of decls) {
			if (conditional.includes(decl.className) && SIZE_PROPS.includes(decl.prop)) {
				found.add(decl.className);
			}
		}
	}
	return [...found];
}

/**
 * Evalúa un control ya extraído contra las dos listas de declaraciones de su componente. Devuelve
 * `width`/`height` (cada uno `{ fine, coarse }`, ver `dimensionBox`), la lista de fallos
 * (dimensiones que SÍ se pueden leer y miden menos de `TOUCH_TARGET_PX`) y el veredicto:
 * `'fail'` si hay al menos un fallo, `'no-medible'` si ninguna dimensión falla pero alguna sigue
 * sin caja conocida, `'pass'` en cualquier otro caso (ver cabecera del fichero para el porqué del
 * orden de prioridad).
 */
export function evaluateControl(control, base, coarse) {
	const conditional = control.conditional ?? [];
	// Se mide el estado de REPOSO: solo las clases fijas. Tomar la caja de una variante
	// (`class:x={...}`) como si fuera la de siempre reportaría el tamaño del caso MEJOR y taparía
	// el de la clase base, que es el que el control tiene la mayor parte del tiempo — un pase
	// falso silencioso, el único error que un guardarraíl de accesibilidad no se puede permitir.
	const classes = control.classes.filter((c) => !conditional.includes(c));
	const width = dimensionBox(classes, base, coarse, 'width', 'min-width');
	const height = dimensionBox(classes, base, coarse, 'height', 'min-height');
	const conditionalSized = conditionalSizedClasses(conditional, base, coarse);
	const fails = [];
	if (width.coarse && width.coarse.px < TOUCH_TARGET_PX) {
		fails.push({ dimension: 'anchura', ...width.coarse });
	}
	if (height.coarse && height.coarse.px < TOUCH_TARGET_PX) {
		fails.push({ dimension: 'altura', ...height.coarse });
	}
	const verdict = fails.length > 0 ? 'fail' : width.coarse && height.coarse ? 'pass' : 'no-medible';
	return { tag: control.tag, classes, conditionalSized, width, height, fails, verdict };
}

/** Revisa un componente entero: extrae sus controles y los evalúa contra las cajas de su propio
 *  `<style>` (si no tiene `<style>`, las dos listas quedan vacías y todo sale "no medible"). */
export function checkComponent(content) {
	// Mismo motivo que `extractMarkup` (ver su cabecera): sin quitar antes los comentarios HTML,
	// una mención de prosa a `<style>` haría que esta búsqueda arrancara AHÍ y se comiera todo el
	// marcado real hasta el `</style>` de verdad, tomando medio componente por CSS.
	const withoutComments = stripHtmlComments(content);
	const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/.exec(withoutComments);
	const { base, coarse } = styleMatch ? parseStyleScopes(styleMatch[1]) : { base: [], coarse: [] };
	return extractControls(extractMarkup(content)).map((control) =>
		evaluateControl(control, base, coarse)
	);
}

// ── orquestación ────────────────────────────────────────────────────────────

function selectorLabel(control) {
	return control.classes.length > 0
		? control.classes.map((c) => `.${c}`).join('')
		: `<${control.tag}> sin clase`;
}

function main() {
	const errors = [];
	const noMedibles = [];
	let totalControls = 0;

	for (const relFile of COMPONENT_FILES) {
		const content = readFileSync(join(ROOT, relFile), 'utf8');
		const results = checkComponent(content);
		totalControls += results.length;
		for (const result of results) {
			const selector = selectorLabel(result);
			if (result.verdict === 'fail') {
				for (const fail of result.fails) {
					errors.push(
						`${relFile}: ${selector} — ${fail.dimension} bajo puntero basto ${fail.raw} ` +
							`(clase ${fail.className}) = ${fail.px.toFixed(1)}px < 44px`
					);
				}
			} else if (result.verdict === 'no-medible') {
				const missing = [];
				if (!result.width.coarse) missing.push('anchura');
				if (!result.height.coarse) missing.push('altura');
				noMedibles.push(
					`${relFile}: ${selector} (<${result.tag}>) — ${missing.join(' y ')} no sale de una ` +
						'clase propia bajo puntero basto, no se puede juzgar desde el CSS'
				);
			}
			// Independiente del veredicto (ver `evaluateControl`): el control se ha medido en
			// REPOSO, así que una variante de estado que declare caja propia es un tamaño que aquí
			// nadie juzga. Se avisa en vez de callarlo, porque callarlo es como se cuela un pase
			// falso.
			if (result.conditionalSized.length > 0) {
				noMedibles.push(
					`${relFile}: ${selector} (<${result.tag}>) — la clase condicional ` +
						`${result.conditionalSized.map((c) => `.${c}`).join(', ')} declara caja propia: ` +
						'ese ESTADO no se mide (solo se mide el reposo)'
				);
			}
		}
	}

	for (const warning of noMedibles) console.warn(`⚠ no medible: ${warning}`);

	if (errors.length > 0) {
		console.error(
			`\n❌ check-touch-targets: ${errors.length} objetivo(s) táctil(es) por debajo de 44px\n`
		);
		for (const error of errors) console.error(`  - ${error}`);
		console.error(
			'\nExtiende (o crea) el bloque `@media (pointer: coarse)` del componente con ' +
				'`min-height`/`min-width: 44px` para la(s) clase(s) señalada(s). Con puntero fino no se ' +
				'toca nada: un objetivo más alto ahí solo desperdicia densidad.\n'
		);
		process.exit(1);
	}

	console.log(
		`✓ objetivos táctiles: ${totalControls} control(es) revisado(s) en ${COMPONENT_FILES.length} ` +
			`componente(s), ${noMedibles.length} no medible(s).`
	);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	main();
}
