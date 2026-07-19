/**
 * Localiza el binario de PocketBase descargado por `scripts/download-pocketbase.mjs` (o
 * `pnpm test:pb`, que lo invoca antes). Si no está, el fichero de test lo declara con
 * `describe.skip`/`test.skip` — nunca rompe `pnpm gate` para quien no tenga el binario.
 */

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export function pocketBaseBinaryPath(): string {
	const name = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
	return path.join(REPO_ROOT, '.pbbin', name);
}

export function isPocketBaseBinaryAvailable(): boolean {
	return existsSync(pocketBaseBinaryPath());
}

/**
 * Versión REAL del binario ya presente en `.pbbin/` (nunca la que se pidió por `PB_VERSION`:
 * `scripts/download-pocketbase.mjs`'s `alreadyUsable()` reutiliza en silencio un binario ya
 * descargado sin comprobar que su versión coincida con la pedida, así que el env var puede
 * mentir — esto lee la verdad ejecutando `--version` contra el propio binario). `null` si no
 * hay binario disponible.
 */
export function pocketBaseBinaryVersion(): string | null {
	if (!isPocketBaseBinaryAvailable()) return null;
	const out = execFileSync(pocketBaseBinaryPath(), ['--version'], { encoding: 'utf8' });
	const match = out.match(/(\d+\.\d+\.\d+)/);
	return match ? match[1] : null;
}

/**
 * `true` si `version` es >= `minVersion` (comparación numérica simple `x.y.z`, suficiente para
 * los releases de PocketBase — sin rangos ni prerelease).
 */
export function pbVersionAtLeast(version: string, minVersion: string): boolean {
	const a = version.split('.').map(Number);
	const b = minVersion.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		if (av !== bv) return av > bv;
	}
	return true;
}
