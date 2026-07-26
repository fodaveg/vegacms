#!/usr/bin/env node
/**
 * Presupuesto de peso del bundle (P8·F1, D-P8.6 opción A / L-P8.9): tras `pnpm build`, suma el
 * tamaño GZIP de TODO el JS+CSS servido bajo `build/` (el output de `adapter-static`, SPA
 * `ssr=false`) y falla (`exit 1`) si supera el umbral. Sin dependencia npm nueva — sería irónico
 * añadir una dependencia para medir cuánto pesamos; usa `node:zlib` (gzip nivel 9, el peor caso
 * razonable: la mayoría de servidores/CDNs comprimen a ese nivel o brotli, que siempre pesa
 * menos, así que este número es conservador/pesimista).
 *
 * Alcance deliberado: SOLO `.js`/`.css` (el "peso de código" de la app). NO cubre imágenes,
 * fuentes ni otros media estáticos bajo `build/` — hoy no hay ninguno relevante (P6/media aún no
 * ha llegado); si P6 añade binarios grandes servidos por la app, eso necesitará su PROPIO
 * presupuesto (otro criterio, otro umbral), no inflar este.
 *
 * Umbral MEDIDO (P8·F1, 2026-07-19) sobre el MVP de entonces (P1–P5 + P7·motor, sin P6/media):
 * total gzip real = 267.86 KB (274 292 bytes) en 47 ficheros .js/.css bajo `build/`.
 * BUDGET_BYTES fijaba ~320 KB (≈ +19 % de margen sobre lo medido) — cabecera para crecimiento
 * normal sin dejar pasar una regresión grande sin darse cuenta. Este número lo firma David
 * (contrato §P8: "David firma el número"): AJÚSTALO aquí si el margen no es el que quieres.
 *
 * RE-MEDIDO 2026-07-25 (v0.2.0, rediseño «aquelarre» completo). Medición real, no estimación:
 *   - v0.1.1 (`22d9791`, build limpio en worktree aparte): 308.46 KB en 61 ficheros — o sea que
 *     el umbral de 320 KB ya solo tenía un 3.6 % de aire, agotado por P6/media + L6/auth + l10-l12
 *     + el banner de update, ninguno de los cuales lo re-midió.
 *   - v0.2.0 (esta versión): 326.34 KB. Delta de la ola 3 = +17.88 KB para el rediseño de shell,
 *     lista, editor y medios + 3 capacidades de manifiesto (`slugField`, `editorRail`,
 *     `fieldGroups[].placement`) + `EditorRail`/`MediaSelectionBar`/`media-card`/`media-metrics`/
 *     `slugify`/`record-meta` + el escaparate de `demo-seed`. Repartido: ~4.7 KB el seed, el resto
 *     código y CSS de funcionalidad. No hay bulto anómalo que recortar.
 * Nuevo BUDGET_BYTES = 380 KB, que conserva la MISMA cabecera ABSOLUTA que firmó David en su día
 * (~52 KB por encima de lo medido, ≈ +16 %) en vez de re-aplicar un porcentaje sobre un total ya
 * mayor. OJO al code-splitting: este script suma TODO el `build/`, así que trocear en chunks no
 * baja el número — solo baja si de verdad se deja de compilar código.
 *
 * RE-MEDIDO 2026-07-26 (v0.5.0). El techo de 380 KB se había quedado con 2.36 KB de aire, y esta
 * vez el aviso llegó ANTES de que lo reventara nadie. Mediciones reales de esta sesión, no
 * estimaciones:
 *   - `63f9bf1` (fin de `#lote-shell`, build limpio en worktree aparte): 367.75 KB. O sea que los
 *     41.41 KB que van desde v0.2.0 se los repartieron v0.3.0 (preview + editor de esquema),
 *     v0.4.0 (`#lote-integridad`: historial, papelera, «¿dónde se usa esto?») y el propio
 *     `#lote-shell` (buscador global + permisos en la UI). Ninguno de los tres re-midió el techo,
 *     que es exactamente cómo se agota un presupuesto sin que nadie decida nada.
 *   - `#lote-esquema` (export/import de contenido) añade 9.89 KB en total: +3.35 KB la fase 1
 *     (serializador, paginación por cursor, diálogo de export) y +6.54 KB la fase 2 (validación,
 *     vista previa, deserializador, traída de ficheros y diálogo de import).
 *   - v0.5.0: 377.64 KB. No hay bulto anómalo: los dos chunks gordos (86.9 y 44.4 KB) son el
 *     runtime y el editor, no grasa reciente.
 * Nuevo BUDGET_BYTES = 430 KB, aplicando OTRA VEZ el mismo criterio de cabecera absoluta (~52 KB
 * sobre lo medido) en vez de inflar por porcentaje. David firmó este número el 26 jul.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// Re-medido 2026-07-26 sobre v0.5.0: 377.64 KB gzip reales (v0.2.0 medía 326.34 KB). Ver la
// cabecera para el desglose del delta y el criterio de la cabecera absoluta.
const BUDGET_BYTES = 430 * 1024;

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

function main() {
	if (!statSync(BUILD_DIR, { throwIfNoEntry: false })?.isDirectory()) {
		console.error(
			`[bundle-budget] No existe ${BUILD_DIR}. Corre \`pnpm build\` antes de este script.`
		);
		process.exitCode = 1;
		return;
	}

	const files = walk(BUILD_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
	if (files.length === 0) {
		console.error(`[bundle-budget] No se encontró ningún .js/.css bajo ${BUILD_DIR}.`);
		process.exitCode = 1;
		return;
	}

	const sized = files
		.map((f) => ({
			file: path.relative(BUILD_DIR, f),
			gzipBytes: gzipSync(readFileSync(f), { level: 9 }).length
		}))
		.sort((a, b) => b.gzipBytes - a.gzipBytes);

	const totalBytes = sized.reduce((sum, f) => sum + f.gzipBytes, 0);

	console.log(`[bundle-budget] ${files.length} ficheros .js/.css bajo build/`);
	console.log('[bundle-budget] los 5 más pesados (gzip):');
	for (const f of sized.slice(0, 5)) {
		console.log(`  ${(f.gzipBytes / 1024).toFixed(2)} KB  ${f.file}`);
	}
	console.log(
		`[bundle-budget] total gzip: ${(totalBytes / 1024).toFixed(2)} KB / presupuesto ${(BUDGET_BYTES / 1024).toFixed(2)} KB`
	);

	if (totalBytes > BUDGET_BYTES) {
		console.error(
			`[bundle-budget] SUPERADO: ${(totalBytes / 1024).toFixed(2)} KB > ${(BUDGET_BYTES / 1024).toFixed(2)} KB. ` +
				`El bundle JS+CSS ha crecido por encima del presupuesto (ver cabecera de este script para el número firmado). ` +
				`Revisa qué se añadió (los 5 más pesados de arriba) antes de subir el umbral.`
		);
		process.exitCode = 1;
		return;
	}

	console.log('[bundle-budget] OK, dentro de presupuesto.');
}

main();
