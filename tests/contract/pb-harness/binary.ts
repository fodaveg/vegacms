/**
 * Localiza el binario de PocketBase descargado por `scripts/download-pocketbase.mjs` (o
 * `pnpm test:pb`, que lo invoca antes). Si no está, el fichero de test lo declara con
 * `describe.skip`/`test.skip` — nunca rompe `pnpm gate` para quien no tenga el binario.
 */

import { existsSync } from 'node:fs';
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
