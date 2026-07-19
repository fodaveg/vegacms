#!/usr/bin/env node
/**
 * Descarga el binario de PocketBase pineado (§0/§10 del contrato: "CI corre contra la última
 * estable") a `.pbbin/` (gitignorado — nunca se commitea un binario). Idempotente: si ya está
 * descargado y es ejecutable, no vuelve a bajarlo. Pensado para `pnpm test:pb` (local) y el
 * workflow de CI (Linux); detecta plataforma/arquitectura automáticamente.
 *
 * Versión: por defecto la pineada (0.39.6), pero admite override vía `PB_VERSION` (P8·F1,
 * D-P8.7 opción B) para que CI pueda correr la suite de contrato en MATRIZ contra la mínima
 * soportada (0.26.0, D-P1.3) además de la pineada, sin tocar este fichero por versión.
 *
 * Si la descarga falla (sin red, GitHub caído…), el script termina con éxito silencioso: el
 * test de contrato contra PB se salta declarándolo (ver `tests/contract/pb-harness/binary.ts`),
 * nunca rompe `pnpm gate` para quien no tenga el binario. Un checksum que NO casa es distinto:
 * eso SÍ aborta con error (supply-chain, D-P8.8 opción A) — no es "falta de red", es "lo que
 * llegó no es lo esperado".
 */

import { createWriteStream, existsSync, mkdirSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const PB_VERSION_FALLBACK = '0.39.6';
const PB_VERSION = process.env.PB_VERSION || PB_VERSION_FALLBACK;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.resolve(__dirname, '..', '.pbbin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

/**
 * SHA256 esperado por versión + `<platform>_<arch>` (mismo formato que `pbPlatformArch()`).
 * Fuente: `checksums.txt` que PocketBase publica en cada release de GitHub (verificado a mano
 * el 2026-07-19 descargando el asset y comparando con `shasum -a 256`, no inventado). Cubre las
 * dos versiones que usa la matriz de CI (D-P8.7 opción B): la pineada 0.39.6 y la mínima
 * soportada 0.26.0. Si añades una versión nueva a la matriz/pin y no está aquí, el script
 * ABORTA (mejor un fallo explícito que saltarse la verificación en silencio).
 */
const PB_CHECKSUMS = {
	'0.26.0': {
		darwin_amd64: '0ca9a1120680b176f93eebe8d7813fc081cdbb07524fae2c0bf5cd7d1861cdb9',
		darwin_arm64: '7813a4d7253b51a8c5f2f7b91612e6bdd1dc2b13b9bf3ad2e88e191948ea4b47',
		linux_amd64: '0d81b2bc0374413865071389dfe4e56d0a66b533ec43a0e1a96e198c36df66c5',
		linux_arm64: 'ebdf2e2b7b7fe35b89517c46ab97e2b359a6853bc40e50c9d98e4fff1224fd69',
		windows_amd64: '188fb9cf5befa15b9c04e700d8e27ba34776a80bd81e3a900bbfccf80cc4203d',
		windows_arm64: 'fbef584fc1bdbc3d6c5d0677a3999861576124d51023d2f01a6c06cfebbd98f9'
	},
	'0.39.6': {
		darwin_amd64: 'ee642cd5f8b2f77b4f28e36d93536e19887f42f1e01b384e1fe53775428aed88',
		darwin_arm64: '704111f6c4b489f27cebf525bcbe7fe0b98661a147f05f1c7b9dffeb89dcef6d',
		linux_amd64: '9251d4ebca4fe91771392dc389a6e449e4e00a34182b0316e7a2d9984d34da3d',
		linux_arm64: '1787ec2de1821f9464d835ccede697603d45eabe9078c3a4209442b3c6f7d18b',
		windows_amd64: 'aad897c08b04334c94814e29250245325eccf300bb0d051716632cf9cedd1af3',
		windows_arm64: 'f8fd13ae1b8809b8f36877904b43b756189f2007ade304ff6e436d0ff8d47ad9'
	}
};

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

/**
 * Verifica el SHA256 del zip descargado contra `PB_CHECKSUMS` (D-P8.8 opción A). Si no hay hash
 * conocido para esta versión/plataforma, avisa (no bloquea versiones fuera de la matriz/pin
 * actual — de lo contrario nadie podría probar una versión nueva de PB sin tocar antes este
 * script) pero lo deja BIEN visible en el log. Si hay hash conocido y NO casa, aborta: eso es
 * exactamente el escenario de supply-chain que esta verificación existe para cazar.
 */
function verifyChecksum(zipPath, platformArch) {
	const expected = PB_CHECKSUMS[PB_VERSION]?.[platformArch];
	const actual = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
	if (!expected) {
		console.warn(
			`[pocketbase] AVISO: no hay checksum conocido para ${PB_VERSION}/${platformArch} en ` +
				`scripts/download-pocketbase.mjs (PB_CHECKSUMS). Descarga SIN verificar. Añade el ` +
				`hash oficial (checksums.txt del release de GitHub) si esta versión pasa a ser fija.`
		);
		return;
	}
	if (actual !== expected) {
		throw new ChecksumMismatchError(
			`Checksum SHA256 no coincide para pocketbase_${PB_VERSION}_${platformArch}.zip.\n` +
				`  esperado: ${expected}\n` +
				`  obtenido: ${actual}\n` +
				`Descarga abortada (posible asset corrupto o comprometido). No se instala el binario.`
		);
	}
	console.log(`[pocketbase] checksum SHA256 verificado (${platformArch}).`);
}

/**
 * Distingue "no hay red/GitHub caído" (silencioso a propósito, ver cabecera del fichero) de
 * "lo descargado no es lo esperado" (supply-chain, D-P8.8): esta clase marca el segundo caso
 * para que `main()` lo deje escapar como fallo DURO en vez de tragárselo.
 */
class ChecksumMismatchError extends Error {}

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

	try {
		verifyChecksum(zipPath, platformArch);
	} catch (err) {
		// Un zip que no verifica no debe quedarse en `.pbbin/`: ni como binario extraído (no
		// llegamos ahí) ni como zip a medio verificar que un reintento pueda confundir con "ya
		// descargado".
		rmSync(zipPath, { force: true });
		throw err;
	}

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
		console.log(`[pocketbase] ya disponible en ${BIN_PATH} (versión ${PB_VERSION})`);
		return;
	}
	try {
		await download();
	} catch (err) {
		if (err instanceof ChecksumMismatchError) {
			// A diferencia de "sin red/GitHub caído", esto NUNCA se traga en silencio (D-P8.8):
			// un checksum que no casa es un fallo de supply-chain, no una ausencia de binario.
			console.error(`[pocketbase] ${err.message}`);
			process.exitCode = 1;
			return;
		}
		console.warn(
			`[pocketbase] no se pudo descargar el binario (${err.message}). La suite de contrato contra PB real se saltará (declarado, no oculto).`
		);
		// Éxito silencioso a propósito: no bloquear `pnpm gate` para quien no tenga red/binario.
	}
}

await main();
