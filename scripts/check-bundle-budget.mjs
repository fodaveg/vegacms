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
 * Umbral MEDIDO (P8·F1, 2026-07-19) sobre el MVP actual (P1–P5 + P7·motor, sin P6/media):
 * total gzip real = 267.86 KB (274 292 bytes) repartido en 47 ficheros .js/.css bajo `build/`.
 * BUDGET_BYTES fija ~320 KB (≈ +19 % de margen sobre lo medido) — cabecera para crecimiento
 * normal sin dejar pasar una regresión grande sin darse cuenta. Este número lo firma David
 * (contrato §P8: "David firma el número"): AJÚSTALO aquí si el margen no es el que quieres.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// Medido 2026-07-19: 274 292 bytes gzip (267.86 KB) para el MVP actual. Provisional — pendiente
// de que David lo firme (o ajuste) según el contrato.
const BUDGET_BYTES = 320 * 1024;

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
