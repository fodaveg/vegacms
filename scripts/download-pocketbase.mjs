#!/usr/bin/env node
/**
 * Descarga el binario de PocketBase pineado (§0/§10 del contrato: "CI corre contra la última
 * estable") a `.pbbin/` (gitignorado — nunca se commitea un binario). Idempotente: si ya está
 * descargado y es ejecutable, no vuelve a bajarlo. Pensado para `pnpm test:pb` (local) y el
 * workflow de CI (Linux); detecta plataforma/arquitectura automáticamente.
 *
 * Si la descarga falla (sin red, GitHub caído…), el script termina con éxito silencioso: el
 * test de contrato contra PB se salta declarándolo (ver `tests/contract/pb-harness/binary.ts`),
 * nunca rompe `pnpm gate` para quien no tenga el binario.
 */

import { createWriteStream, existsSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const PB_VERSION = '0.39.6';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.resolve(__dirname, '..', '.pbbin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

function pbPlatformArch() {
	const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
	const archMap = { x64: 'amd64', arm64: 'arm64' };
	const platform = platformMap[process.platform];
	const arch = archMap[process.arch];
	if (!platform || !arch) {
		throw new Error(
			`Plataforma/arquitectura no soportada por este script: ${process.platform}/${process.arch}`
		);
	}
	return `${platform}_${arch}`;
}

async function alreadyUsable() {
	if (!existsSync(BIN_PATH)) return false;
	try {
		execFileSync(BIN_PATH, ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

async function download() {
	const platformArch = pbPlatformArch();
	const asset = `pocketbase_${PB_VERSION}_${platformArch}.zip`;
	const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${asset}`;

	console.log(`[pocketbase] descargando ${asset}…`);
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		throw new Error(`Descarga falló: HTTP ${res.status} en ${url}`);
	}

	mkdirSync(BIN_DIR, { recursive: true });
	const zipPath = path.join(BIN_DIR, asset);
	await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));

	// Solo necesitamos el binario del zip; `unzip` está disponible en macOS/Linux por defecto
	// (CI usa runners estándar de GitHub, que lo traen). No añadimos una dependencia npm de zip
	// solo para esto.
	execFileSync('unzip', ['-o', zipPath, 'pocketbase*', '-d', BIN_DIR], { stdio: 'inherit' });
	rmSync(zipPath);

	const extracted = path.join(
		BIN_DIR,
		process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase'
	);
	if (extracted !== BIN_PATH) execFileSync('mv', [extracted, BIN_PATH]);
	chmodSync(BIN_PATH, 0o755);
	console.log(`[pocketbase] listo en ${BIN_PATH}`);
}

async function main() {
	if (await alreadyUsable()) {
		console.log(`[pocketbase] ya disponible en ${BIN_PATH} (versión pineada ${PB_VERSION})`);
		return;
	}
	try {
		await download();
	} catch (err) {
		console.warn(
			`[pocketbase] no se pudo descargar el binario (${err.message}). La suite de contrato contra PB real se saltará (declarado, no oculto).`
		);
		// Éxito silencioso a propósito: no bloquear `pnpm gate` para quien no tenga red/binario.
	}
}

await main();
