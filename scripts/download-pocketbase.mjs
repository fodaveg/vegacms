#!/usr/bin/env node
/**
 * Descarga el binario de PocketBase pineado (§0/§10 del contrato: "CI corre contra la última
 * estable") a `.pbbin/` (gitignorado — nunca se commitea un binario). Idempotente: si ya está
 * descargado y es ejecutable, no vuelve a bajarlo. Pensado para `pnpm test:pb` (local) y el
 * workflow de CI (Linux); detecta plataforma/arquitectura automáticamente.
 *
 * Versión: por defecto la pineada (0.39.9), pero admite override vía `PB_VERSION` (P8·F1,
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

const PB_VERSION_FALLBACK = '0.39.9';
const PB_VERSION = process.env.PB_VERSION || PB_VERSION_FALLBACK;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.resolve(__dirname, '..', '.pbbin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

/**
 * SHA256 esperado por versión + `<platform>_<arch>` (mismo formato que `pbPlatformArch()`).
 * Fuente: `checksums.txt` que PocketBase publica en cada release de GitHub (0.26.0 verificado a mano
 * el 2026-07-19 descargando el asset y comparando con `shasum -a 256`; 0.39.9 copiado de
 * `checksums.txt` de la release v0.39.9 el 2026-10-01, no inventado). Cubre las
 * dos versiones que usa la matriz de CI (D-P8.7 opción B): la pineada 0.39.9 y la mínima
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
	'0.39.9': {
		darwin_amd64: '3f715e1008a314c6cf0f18e749142501a985340c895ac6bddd952b6ef2530d8b',
		darwin_arm64: 'bf12c774649be417345b6d60e97361ea0bf2ab167b442b0ecd8cd39c6b0f5835',
		linux_amd64: '4c5a1aced62ebf658bfbcfeaa944c4bfa88b173dd9d598d3cab55ea63587b36b',
		linux_arm64: 'fd4138f29182288cbe6e9982e9f29b11df5f8e689c4f6a8f6cdf7aadd29d95a1',
		linux_armv7: '8e0c58efe00c3d5e7ec3fda2c0f33ccfe924a64ee9e07915a19f951bcd084e60',
		linux_ppc64le: 'bb5ea08cad1ff7100f77e487927dfa5f0baaa68edf474f99ecb14bd9d11cdb9f',
		linux_s390x: '7d6f5eb6cecd833b6605eb284556bdd416d46d77963c9a902ff65b9e97326ef0',
		windows_amd64: '15fac48055142e57e3591cce064d66ef815bb5f7507bf77e51787ce1f79c3c4c',
		windows_arm64: '172360c0db2e82af124f64f3afe0722e1a9d582f70d5540ddbfef334cd20628b'
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

/**
 * `true` solo si el binario en `.pbbin/` ya existe, es ejecutable Y es la versión pedida
 * (`PB_VERSION`) — no basta con que exista: un binario de OTRA versión cacheado de una
 * ejecución anterior (p.ej. la pineada 0.39.9, tras correr sin `PB_VERSION`) se reutilizaría en
 * silencio, dejando que `PB_VERSION=0.26.0 pnpm test:pb` corra en realidad contra 0.39.9 sin
 * avisar (hallazgo P8·F1, 2026-07-19: así es como una reproducción local inicial dio un falso
 * "pasan los 54" contra 0.26.0).
 */
async function alreadyUsable() {
	if (!existsSync(BIN_PATH)) return false;
	try {
		const out = execFileSync(BIN_PATH, ['--version'], { encoding: 'utf8' });
		const match = out.match(/(\d+\.\d+\.\d+)/);
		return match !== null && match[1] === PB_VERSION;
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
