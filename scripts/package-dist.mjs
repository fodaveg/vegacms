#!/usr/bin/env node
/**
 * Empaqueta la build estática (`build/`, salida de `pnpm build`) en `dist/vega-<version>.zip`
 * (lote L5, distribución/onboarding genérico — David: "artefacto distribuible = zip de build/ por
 * release"). Pensado para uso LOCAL/manual (`pnpm package`): comprobar rápido el zip que se
 * distribuiría, o servirlo aparte de un despliegue `pb_public` same-origin (ver
 * `docs/DEPLOYMENT.md`).
 *
 * Distinto — a propósito — del zip que ya construye `.github/workflows/release.yml` en cada tag
 * `v*`: ese es el artefacto OFICIAL de un GitHub Release (staged bajo `vega-$VERSION/`, con
 * `LICENSE`+`README.md`, byte-a-byte determinista y verificado dos veces en CI). Este script NO
 * lo sustituye ni se integra ahí: es una utilidad de conveniencia para el día a día
 * (local/CI ad hoc), sin las garantías de reproducibilidad del workflow de release. El zip que
 * produce contiene el CONTENIDO de `build/` en la raíz del zip (sin carpeta contenedora ni
 * ficheros extra), listo para descomprimir directamente en un `pb_public/` o un webroot.
 *
 * Usa `zip -r` vía `node:child_process` (disponible en macOS y en los runners `ubuntu-latest` de
 * GitHub Actions, igual que ya asume `download-pocketbase.mjs` con `unzip`) — sin dependencia npm
 * nueva para esto.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const DIST_DIR = path.join(ROOT, 'dist');

/**
 * Fix de code-review de L5 (UX de script): sin este guard, un `zip` ausente del `PATH` (nada
 * exótico — no todas las imágenes mínimas de CI/contenedores lo traen preinstalado) hace que
 * `execFileSync('zip', …)` reviente más abajo con un stack trace `ENOENT` crudo, igual de
 * confuso que el `build/` ausente sin este guard tendría. Mismo criterio que la comprobación de
 * `BUILD_DIR`: mensaje claro, `exit 1`, sin traza. `zip -v` (imprime la versión) es el chequeo
 * más barato que existe sin tocar disco de verdad; `stdio: 'ignore'` porque solo interesa si
 * LANZA (binario ausente), no su salida.
 */
function ensureZipAvailable() {
	try {
		execFileSync('zip', ['-v'], { stdio: 'ignore' });
		return true;
	} catch (err) {
		console.error(
			`[package-dist] Se requiere el comando \`zip\` en el PATH (no encontrado: ${err.message}). ` +
				'Instálalo (viene por defecto en macOS y en los runners ubuntu-latest de GitHub Actions) y reintenta.'
		);
		process.exitCode = 1;
		return false;
	}
}

function main() {
	if (!statSync(BUILD_DIR, { throwIfNoEntry: false })?.isDirectory()) {
		console.error(
			`[package-dist] No existe ${BUILD_DIR}. Corre \`pnpm build\` antes de \`pnpm package\`.`
		);
		process.exitCode = 1;
		return;
	}

	if (!ensureZipAvailable()) return;

	// Misma técnica que `vite.config.ts` para leer `package.json` sin depender de import
	// attributes (`import ... with { type: 'json' }`): `readFileSync` + `JSON.parse` a secas.
	const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	const version = pkg.version;

	mkdirSync(DIST_DIR, { recursive: true });

	const zipPath = path.join(DIST_DIR, `vega-${version}.zip`);
	if (existsSync(zipPath)) {
		console.log(`[package-dist] borrando zip previo: ${path.relative(ROOT, zipPath)}`);
		rmSync(zipPath);
	}

	console.log(
		`[package-dist] empaquetando ${path.relative(ROOT, BUILD_DIR)}/ → ${path.relative(ROOT, zipPath)}`
	);
	// `-r` recursivo; se ejecuta con cwd=BUILD_DIR para que las entradas del zip queden en la
	// RAÍZ (sin el prefijo `build/`) — es "el contenido de build/", no la carpeta en sí.
	execFileSync('zip', ['-r', zipPath, '.'], { cwd: BUILD_DIR, stdio: 'inherit' });

	console.log(`[package-dist] listo: ${path.relative(ROOT, zipPath)}`);
}

main();
