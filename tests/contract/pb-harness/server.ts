/**
 * Arranca/tumba un proceso de PocketBase real con datos efímeros, para la suite de contrato
 * (§10, Fase 2). Un puerto libre por instancia para poder levantar varios servidores en el
 * mismo proceso de test (p.ej. el de "backend caído" no necesita uno nuevo, pero mantenerlo
 * aislado es más simple que compartir estado entre ficheros de test).
 *
 * `startPocketBase()` (para la suite de contrato normal) es un wrapper fino sobre primitivas más
 * pequeñas, expuestas para `pocketbase.migration.test.ts` (verificación de migraciones GENERADAS
 * contra el binario real, lote "esquema"): ese test necesita crear el `dataDir` ANTES de arrancar
 * el servidor (para escribir ficheros en `pb_migrations/` antes del primer `serve`), parar el
 * proceso, correr `pocketbase migrate up/down` a mano, y volver a arrancar sobre el MISMO
 * `dataDir` — nada de eso lo permite un `startPocketBase()` monolítico.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pocketBaseBinaryPath } from './binary';

export interface RunningPocketBase {
	url: string;
	adminEmail: string;
	adminPassword: string;
	stop(): Promise<void>;
}

export const ADMIN_EMAIL = 'admin@vega.test';
export const ADMIN_PASSWORD = 'vega-fixture-pw-1';

/** Puerto libre "al azar" en el rango efímero, sin dependencias nuevas (net.createServer(0)). */
async function findFreePort(): Promise<number> {
	const net = await import('node:net');
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, '127.0.0.1', () => {
			const address = srv.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			srv.close(() => resolve(port));
		});
		srv.on('error', reject);
	});
}

async function waitForHealth(url: string, timeoutMs = 10_000): Promise<void> {
	const start = Date.now();
	let lastErr: unknown;
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(`${url}/api/health`);
			if (res.ok) return;
		} catch (err) {
			lastErr = err;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`PocketBase no respondió a /api/health a tiempo: ${String(lastErr)}`);
}

/**
 * Par de directorios que necesita una instancia PocketBase efímera, creados SIN arrancar el
 * servidor — para poder escribir ficheros de migración en `migrationsDir` antes del primer
 * `serve`/`migrate up`.
 */
export interface PocketBaseInstanceDir {
	dataDir: string;
	migrationsDir: string;
}

/**
 * Crea el `dataDir` temporal y su `migrationsDir` (mkdir explícito: a diferencia del flujo
 * normal —donde PB lo crea solo al arrancar—, aquí el llamador necesita escribir en él ANTES de
 * arrancar nada). El default de PB para `--migrationsDir` es el HERMANO de `--dir`, no algo
 * dentro de él — y como `mkdtempSync` crea cada `dataDir` como hijo directo del MISMO `tmpdir()`,
 * todas las instancias "efímeras" de una máquina comparten ese hermano. `--automigrate` (default
 * true) escribe ahí una migración por cada colección creada vía API, y las REPLICA TODAS en
 * cualquier base nueva al arrancar: sin este flag explícito, un PB "recién creado" en realidad
 * hereda el esquema acumulado de TODAS las ejecuciones previas en esta máquina (hallazgo P8·F1,
 * 2026-07-19). Metiéndolo dentro de `dataDir`, se borra junto con él en `destroyInstanceDir`.
 */
export function createPocketBaseInstanceDir(): PocketBaseInstanceDir {
	const dataDir = mkdtempSync(path.join(tmpdir(), 'vega-pbdata-'));
	const migrationsDir = path.join(dataDir, 'pb_migrations');
	mkdirSync(migrationsDir, { recursive: true });
	return { dataDir, migrationsDir };
}

/** Borra el `dataDir` (y con él, `migrationsDir`) de una instancia ya parada. */
export function destroyPocketBaseInstanceDir(instance: PocketBaseInstanceDir): void {
	rmSync(instance.dataDir, { recursive: true, force: true });
}

/** Crea (o actualiza) el superuser de fixture vía CLI — no necesita el servidor arrancado. */
export async function createPocketBaseSuperuser(
	dataDir: string,
	email: string = ADMIN_EMAIL,
	password: string = ADMIN_PASSWORD
): Promise<void> {
	await execPocketBase(pocketBaseBinaryPath(), [
		'superuser',
		'upsert',
		email,
		password,
		'--dir',
		dataDir
	]);
}

export interface PocketBaseServerHandle {
	url: string;
	/** Solo mata el proceso — el `dataDir` sigue vivo (a diferencia de `RunningPocketBase.stop`,
	 *  que también lo borra), para poder volver a arrancar sobre el mismo directorio. */
	stop(): Promise<void>;
}

/**
 * Arranca `pocketbase serve` sobre una instancia ya creada (`createPocketBaseInstanceDir`).
 *
 * LANDMINE (relevante para quien reinicie tras un `runPocketBaseMigrate(['down', ...])`): el
 * runner de migraciones de usuario (`pb_migrations/*.js`) las aplica TODAS las que estén en
 * `migrationsDir` y no figuren en `_migrations` en CADA arranque — incluida una que se acaba de
 * revertir con `down`, si el fichero sigue en disco. `--automigrate` NO evita esto (ese flag
 * controla si PB auto-GENERA una migración cuando el esquema cambia por la API/Admin UI, no si
 * EJECUTA las que ya existen como fichero) — verificado a mano: `serve --automigrate=false`
 * reaplica igualmente un `down` reciente si el `.js` sigue en `migrationsDir`. Para arrancar
 * sobre el estado post-`down` de verdad, hay que BORRAR el fichero de migración revertido antes
 * de llamar aquí (igual que en un revert real: se revierte junto con su commit en git).
 */
export async function startPocketBaseServerOn(
	instance: PocketBaseInstanceDir
): Promise<PocketBaseServerHandle> {
	const bin = pocketBaseBinaryPath();
	const port = await findFreePort();
	const url = `http://127.0.0.1:${port}`;

	const child = spawn(
		bin,
		[
			'serve',
			`--http=127.0.0.1:${port}`,
			'--dir',
			instance.dataDir,
			'--migrationsDir',
			instance.migrationsDir
		],
		{ stdio: 'pipe' }
	);
	child.stderr?.on('data', () => {}); // silencia stderr; los tests no dependen de sus logs

	await waitForHealth(url).catch((err) => {
		child.kill();
		throw err;
	});

	return { url, stop: () => killProcess(child) };
}

/** Arranca un PocketBase efímero (datos en un dir temporal) y crea el superuser de fixture.
 *  Wrapper fino sobre las primitivas de arriba — mismo comportamiento de siempre para los
 *  callers actuales (`pocketbase.contract.test.ts`). */
export async function startPocketBase(): Promise<RunningPocketBase> {
	const instance = createPocketBaseInstanceDir();
	// El `try` cubre TAMBIÉN el `superuser upsert`: antes del refactor, un fallo ahí dejaba el
	// `dataDir` huérfano en `/tmp` (mismo bug, no una regresión — ahora que son dos llamadas
	// separadas, envolver las dos es gratis).
	const server = await (async () => {
		try {
			await createPocketBaseSuperuser(instance.dataDir);
			return await startPocketBaseServerOn(instance);
		} catch (err) {
			destroyPocketBaseInstanceDir(instance);
			throw err;
		}
	})();

	return {
		url: server.url,
		adminEmail: ADMIN_EMAIL,
		adminPassword: ADMIN_PASSWORD,
		async stop() {
			await server.stop();
			destroyPocketBaseInstanceDir(instance);
		}
	};
}

export interface MigrateResult {
	/** stdout y stderr COMBINADOS (PB no es consistente sobre por dónde saca cada línea) — es la
	 *  ÚNICA forma fiable de saber si `down` revirtió de verdad (ver `runPocketBaseMigrate`): el
	 *  exit code no lo delata. */
	stdout: string;
	exitCode: number | null;
}

/**
 * Corre `pocketbase migrate <args...>` contra `instance` (p.ej. `['up']` o `['down', '1']`).
 *
 * LANDMINE (el corazón de `pocketbase.migration.test.ts`): `migrate down` PIDE confirmación
 * interactiva ("Do you really want to revert...? (y/N)") por stdin. Con stdin cerrado/vacío
 * imprime "The command has been cancelled" y sale con código 0 — NO revierte nada, y el exit
 * code no lo distingue de un revert real. Por eso esta función escribe SIEMPRE "y\n" en el
 * stdin del proceso (inofensivo para `up`/`create`, que no leen stdin) y devuelve el `stdout`
 * completo: el llamador debe comprobar que contiene "Reverted <fichero>" antes de asumir que
 * revirtió — comprobar solo el exit code pasaría en verde sin haber revertido nada.
 *
 * `timeoutMs` acota el proceso igual que `waitForHealth`/`killProcess` acotan el `serve`: si el
 * binario se colgara (lock de SQLite, bug suyo), dejar el hijo vivo indefinidamente haría que el
 * `afterAll` del test intentase borrar el `dataDir` con un proceso todavía encima — se mata y se
 * rechaza, en vez de abandonar la promesa al timeout de vitest.
 */
export function runPocketBaseMigrate(
	instance: PocketBaseInstanceDir,
	args: string[],
	timeoutMs = 15_000
): Promise<MigrateResult> {
	const bin = pocketBaseBinaryPath();
	return new Promise((resolve, reject) => {
		const child = spawn(
			bin,
			['migrate', ...args, '--dir', instance.dataDir, '--migrationsDir', instance.migrationsDir],
			{ stdio: ['pipe', 'pipe', 'pipe'] }
		);
		let stdout = '';
		const timer = setTimeout(() => {
			child.kill();
			reject(
				new Error(
					`"pocketbase migrate ${args.join(' ')}" no terminó en ${timeoutMs}ms; salida hasta ahora: ${stdout}`
				)
			);
		}, timeoutMs);
		child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
		child.stderr?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			resolve({ stdout, exitCode: code });
		});
		child.stdin?.write('y\n');
		child.stdin?.end();
	});
}

function execPocketBase(bin: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: 'pipe' });
		let stderr = '';
		child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`"${bin} ${args.join(' ')}" salió con código ${code}: ${stderr}`));
		});
		child.on('error', reject);
	});
}

function killProcess(child: ChildProcess): Promise<void> {
	return new Promise((resolve) => {
		if (child.exitCode !== null) {
			resolve();
			return;
		}
		child.once('exit', () => resolve());
		child.kill();
		// Backstop: si no muere a tiempo, no bloqueamos el teardown de los tests indefinidamente.
		setTimeout(resolve, 3000);
	});
}
