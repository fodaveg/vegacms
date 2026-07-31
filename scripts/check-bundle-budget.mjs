#!/usr/bin/env node
/**
 * Presupuesto de peso del bundle (P8·F1, D-P8.6 opción A / L-P8.9): tras `pnpm build`, mide el
 * tamaño GZIP del JS+CSS servido bajo `build/` (el output de `adapter-static`, SPA `ssr=false`) y
 * falla (`exit 1`) si supera alguno de los TRES topes de abajo. Sin dependencia npm nueva — sería
 * irónico añadir una dependencia para medir cuánto pesamos; usa `node:zlib` (gzip nivel 9, el peor
 * caso razonable: la mayoría de servidores/CDNs comprimen a ese nivel o brotli, que siempre pesa
 * menos, así que este número es conservador/pesimista).
 *
 * ## Qué mide, desde 2026-07-31: TRES números, no uno
 *
 * Hasta hoy este script tenía UN solo tope y medía la suma de TODO `build/`. Ese número no lo paga
 * nadie: nadie descarga las 11 pantallas de Vega. Su efecto real era penalizar igual una función
 * que se abre tres veces al mes que el arranque, que sufre todo el mundo — y encima dejaba sin
 * salida al code-splitting, porque trocear en chunks no bajaba el total ni un byte. David firmó el
 * cambio de criterio y los tres topes nuevos el 31 jul 2026, al planificar el editor visual.
 *
 * 1. **Carga inicial** (`INITIAL_BUDGET_BYTES`): lo que el navegador descarga ANTES de ver nada,
 *    o sea el cierre transitivo de los módulos que `build/index.html` referencia, más sus CSS.
 *    Es el único número que paga TODO el mundo en CADA visita en frío, así que es el que aprieta.
 *    El tope (200 KB) está en la banda habitual de presupuesto de arranque de una aplicación web.
 * 2. **Pantalla más cara** (`ROUTE_BUDGET_BYTES`): el coste INCREMENTAL de navegar a la ruta más
 *    pesada, es decir su cierre transitivo MENOS lo que la carga inicial ya trajo. Es lo que de
 *    verdad espera alguien al abrir una pantalla por primera vez. Aquí es donde una función grande
 *    (el editor visual, sin ir más lejos) tiene su presupuesto propio.
 * 3. **Total del build** (`TOTAL_BUDGET_BYTES`): red de seguridad, no presupuesto. Solo salta si
 *    algo se ha ido de madre, típicamente una librería enorme entrando por error. Por eso va holgado
 *    y NO es el número que se vigila lote a lote.
 *
 * ## Precisión, y dónde este script se queda corto A PROPÓSITO
 *
 * El grafo de JS se sigue de verdad: se leen los `import`/`from` ESTÁTICOS de cada chunk y se
 * calcula el cierre transitivo. Los `import()` DINÁMICOS se excluyen deliberadamente — son carga
 * bajo demanda, así que no son coste de la ruta que los contiene (si contaran, cada ruta cargaría
 * con el peso de todas las demás y el número perdería su sentido).
 *
 * El CSS se atribuye por NOMBRE: `assets/<n>.<hash>.css` es la hoja del nodo `<n>`. Las hojas con
 * nombre de componente (`MediaGrid.<hash>.css` y similares) NO se atribuyen a ninguna ruta si no
 * aparecen ya en `index.html`: el output de Vite las enumera en un array plano de precarga, sin un
 * mapa nodo→hoja legible sin reimplementar su runtime. El script REPORTA cuánto queda sin atribuir
 * («CSS sin atribuir») justo para que ese hueco sea visible: si algún día crece, se ve en el log en
 * vez de esconderse. El total sí lo cubre entero, que para eso está.
 *
 * Alcance deliberado: SOLO `.js`/`.css` (el "peso de código" de la app). NO cubre imágenes, fuentes
 * ni otros media estáticos bajo `build/`; si algún día se sirven binarios grandes desde la app, eso
 * necesitará su PROPIO presupuesto (otro criterio, otro umbral), no inflar estos.
 *
 * ## Historial de los números (medidos, nunca estimados)
 *
 * - 2026-07-19 (P8·F1, MVP P1–P5 + P7·motor): 267.86 KB totales → tope único 320 KB.
 * - 2026-07-25 (v0.2.0, rediseño «aquelarre»): 326.34 KB → tope único 380 KB. El de 320 llevaba ya
 *   solo un 3.6 % de aire, agotado por P6/media + L6/auth + l10-l12 + el banner de update, ninguno
 *   de los cuales lo re-midió.
 * - 2026-07-26 (v0.5.0): 377.64 KB → tope único 430 KB. Los 41.41 KB desde v0.2.0 se los repartieron
 *   v0.3.0 (preview + editor de esquema), v0.4.0 (historial, papelera, «¿dónde se usa esto?») y
 *   `#lote-shell` (buscador global + permisos en la UI). Ninguno re-midió el techo, que es
 *   exactamente cómo se agota un presupuesto sin que nadie decida nada.
 * - 2026-07-31 (`main`, al planificar el editor visual): total 400.10 KB, y por primera vez medidas
 *   la CARGA INICIAL (138.90 KB) y la pantalla más cara (38.22 KB, el editor de registro). O sea que
 *   el 65 % de lo que el tope único vigilaba no lo descarga nadie al entrar. De ahí el cambio de
 *   criterio y los tres topes de abajo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// Los tres topes que firmó David el 2026-07-31. Medido ese día: inicial 138.90 KB, pantalla más
// cara 38.22 KB, total 400.10 KB. Ver la cabecera para el criterio de cada uno.
const INITIAL_BUDGET_BYTES = 200 * 1024;
const ROUTE_BUDGET_BYTES = 80 * 1024;
const TOTAL_BUDGET_BYTES = 1024 * 1024;

const KB = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

/** Recorre `dir` recursivamente y devuelve la ruta de cada fichero (no directorio). */
function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

/** Tamaño gzip de un fichero, cacheado: el cierre transitivo visita el mismo chunk muchas veces y
 *  comprimir a nivel 9 no es gratis. */
const gzipCache = new Map();
function gzipBytes(absPath) {
	let cached = gzipCache.get(absPath);
	if (cached === undefined) {
		cached = gzipSync(readFileSync(absPath), { level: 9 }).length;
		gzipCache.set(absPath, cached);
	}
	return cached;
}

/**
 * Imports ESTÁTICOS de un módulo del bundle, ya resueltos a ruta absoluta.
 *
 * Casan las tres formas que emite Vite minificado: `import x from"./a.js"`, `import"./a.js"` (solo
 * efecto) y `export{x}from"./a.js"`. NO casa `import("./a.js")`, el dinámico, porque el paréntesis
 * rompe el patrón — y eso es justo lo que se quiere (ver cabecera).
 */
function staticImports(absPath) {
	const source = readFileSync(absPath, 'utf8');
	const dir = path.dirname(absPath);
	const out = new Set();
	for (const match of source.matchAll(/(?:^|[};\s])(?:import|from)\s*["']([^"']+\.js)["']/g)) {
		const specifier = match[1];
		// Solo rutas relativas: el bundle no debería traer nada externo, y si lo trajera (un import
		// a un CDN) no es un fichero de `build/` que este script pueda pesar.
		if (!specifier.startsWith('.')) continue;
		out.add(path.resolve(dir, specifier));
	}
	return out;
}

/** Cierre transitivo por imports estáticos, empezando en `roots`. Devuelve rutas absolutas. */
function transitiveClosure(roots) {
	const seen = new Set();
	const pending = [...roots];
	while (pending.length > 0) {
		const current = pending.pop();
		if (seen.has(current)) continue;
		if (!statSync(current, { throwIfNoEntry: false })?.isFile()) continue;
		seen.add(current);
		for (const next of staticImports(current)) pending.push(next);
	}
	return seen;
}

function sumBytes(files) {
	let total = 0;
	for (const f of files) total += gzipBytes(f);
	return total;
}

function main() {
	if (!statSync(BUILD_DIR, { throwIfNoEntry: false })?.isDirectory()) {
		console.error(
			`[bundle-budget] No existe ${BUILD_DIR}. Corre \`pnpm build\` antes de este script.`
		);
		process.exitCode = 1;
		return;
	}

	const allFiles = walk(BUILD_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
	if (allFiles.length === 0) {
		console.error(`[bundle-budget] No se encontró ningún .js/.css bajo ${BUILD_DIR}.`);
		process.exitCode = 1;
		return;
	}

	// --- 1. Carga inicial: lo que `index.html` pide, y todo lo que eso arrastra ---------------
	// El HTML de arranque es la fuente literal de la verdad aquí: son las URLs que el navegador
	// resuelve antes de pintar nada. Se leen tal cual en vez de reconstruirlas desde la config.
	const htmlPath = path.join(BUILD_DIR, 'index.html');
	if (!statSync(htmlPath, { throwIfNoEntry: false })?.isFile()) {
		console.error(
			`[bundle-budget] No existe ${htmlPath}. Sin el HTML de arranque no se puede medir la carga inicial.`
		);
		process.exitCode = 1;
		return;
	}
	const html = readFileSync(htmlPath, 'utf8');
	const htmlRefs = [
		...new Set([...html.matchAll(/\/_app\/([^"'\s]+?\.(?:js|css))/g)].map((m) => m[1]))
	];
	if (htmlRefs.length === 0) {
		console.error(
			`[bundle-budget] ${htmlPath} no referencia ningún módulo bajo /_app/. El formato del build ha cambiado y este guardarraíl estaría midiendo cero: arréglalo antes de seguir.`
		);
		process.exitCode = 1;
		return;
	}
	const htmlAbs = htmlRefs.map((r) => path.join(BUILD_DIR, '_app', r));
	const initialCss = htmlAbs.filter((f) => f.endsWith('.css'));
	const initialJs = transitiveClosure(htmlAbs.filter((f) => f.endsWith('.js')));
	const initialFiles = new Set([...initialJs, ...initialCss]);
	const initialBytes = sumBytes(initialFiles);

	// --- 2. Coste incremental de cada ruta ----------------------------------------------------
	// Un nodo de SvelteKit (`immutable/nodes/<n>.<hash>.js`) es una pantalla. Lo que cuesta abrirla
	// es su cierre transitivo MENOS lo que la carga inicial ya trajo: los chunks compartidos se
	// descargan una vez, no una por pantalla.
	const nodesDir = path.join(BUILD_DIR, '_app', 'immutable', 'nodes');
	const nodeFiles = statSync(nodesDir, { throwIfNoEntry: false })?.isDirectory()
		? readdirSync(nodesDir)
				.filter((f) => f.endsWith('.js'))
				.map((f) => path.join(nodesDir, f))
		: [];
	const assetsDir = path.join(BUILD_DIR, '_app', 'immutable', 'assets');
	const assetFiles = statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()
		? readdirSync(assetsDir).filter((f) => f.endsWith('.css'))
		: [];

	const attributedCss = new Set(initialCss);
	const routes = nodeFiles
		.map((nodeFile) => {
			const nodeIndex = path.basename(nodeFile).split('.')[0];
			// `assets/<n>.<hash>.css` es la hoja de ese nodo (ver cabecera: atribución por nombre).
			const ownCss = assetFiles
				.filter((f) => f.split('.')[0] === nodeIndex)
				.map((f) => path.join(assetsDir, f));
			for (const css of ownCss) attributedCss.add(css);
			const own = [...transitiveClosure([nodeFile]), ...ownCss].filter((f) => !initialFiles.has(f));
			return { name: path.basename(nodeFile), bytes: sumBytes(own) };
		})
		.sort((a, b) => b.bytes - a.bytes);

	// --- 3. Total del build -------------------------------------------------------------------
	const totalBytes = sumBytes(allFiles);
	const unattributedCss = assetFiles
		.map((f) => path.join(assetsDir, f))
		.filter((f) => !attributedCss.has(f));

	// --- Informe ------------------------------------------------------------------------------
	console.log(`[bundle-budget] ${allFiles.length} ficheros .js/.css bajo build/`);
	console.log(
		`[bundle-budget] CARGA INICIAL : ${KB(initialBytes)} / ${KB(INITIAL_BUDGET_BYTES)}  (${initialFiles.size} ficheros)`
	);
	if (routes.length > 0) {
		console.log(
			`[bundle-budget] PANTALLA MÁS CARA: ${KB(routes[0].bytes)} / ${KB(ROUTE_BUDGET_BYTES)}  (${routes[0].name})`
		);
		console.log('[bundle-budget] coste de abrir cada pantalla, ya descontada la carga inicial:');
		for (const route of routes.slice(0, 5)) console.log(`  ${KB(route.bytes)}  ${route.name}`);
	}
	console.log(`[bundle-budget] TOTAL BUILD   : ${KB(totalBytes)} / ${KB(TOTAL_BUDGET_BYTES)}`);
	if (unattributedCss.length > 0) {
		console.log(
			`[bundle-budget] CSS sin atribuir a ninguna pantalla: ${KB(sumBytes(unattributedCss))} en ${unattributedCss.length} hoja(s) (ver cabecera; cuenta en el total)`
		);
	}

	// Se comprueban LOS TRES y se informa de todos los que fallan, no solo del primero: si un lote
	// se pasa por dos sitios a la vez, verlo de una vez ahorra una vuelta entera de build.
	const failures = [];
	if (initialBytes > INITIAL_BUDGET_BYTES) {
		failures.push(
			`CARGA INICIAL ${KB(initialBytes)} > ${KB(INITIAL_BUDGET_BYTES)}. Es el peso que paga TODO el mundo al entrar. ` +
				`Algo que antes se cargaba bajo demanda ha pasado a cargarse al arrancar: búscalo antes de subir el tope.`
		);
	}
	if (routes.length > 0 && routes[0].bytes > ROUTE_BUDGET_BYTES) {
		failures.push(
			`PANTALLA MÁS CARA ${KB(routes[0].bytes)} > ${KB(ROUTE_BUDGET_BYTES)} (${routes[0].name}). ` +
				`Esa pantalla se ha vuelto lenta de abrir por primera vez. Mira si parte de su código puede cargarse solo cuando se usa.`
		);
	}
	if (totalBytes > TOTAL_BUDGET_BYTES) {
		failures.push(
			`TOTAL BUILD ${KB(totalBytes)} > ${KB(TOTAL_BUDGET_BYTES)}. Este tope es una red de seguridad, no un presupuesto: ` +
				`si salta, lo normal es que haya entrado una dependencia grande por error, no que Vega haya crecido.`
		);
	}

	if (failures.length > 0) {
		for (const failure of failures) console.error(`[bundle-budget] SUPERADO: ${failure}`);
		console.error(
			'[bundle-budget] Los tres números los firma David (contrato §P8): no los subas sin decírselo.'
		);
		process.exitCode = 1;
		return;
	}

	console.log('[bundle-budget] OK, dentro de presupuesto.');
}

main();
