/**
 * Arranca/tumba un proceso de PocketBase real con datos efímeros, para la suite de contrato
 * (§10, Fase 2). Un puerto libre por instancia para poder levantar varios servidores en el
 * mismo proceso de test (p.ej. el de "backend caído" no necesita uno nuevo, pero mantenerlo
 * aislado es más simple que compartir estado entre ficheros de test).
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pocketBaseBinaryPath } from './binary';

export interface RunningPocketBase {
	url: string;
	adminEmail: string;
	adminPassword: string;
	stop(): Promise<void>;
}

const ADMIN_EMAIL = 'admin@vega.test';
const ADMIN_PASSWORD = 'vega-fixture-pw-1';

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

/** Arranca un PocketBase efímero (datos en un dir temporal) y crea el superuser de fixture. */
export async function startPocketBase(): Promise<RunningPocketBase> {
	const bin = pocketBaseBinaryPath();
	const dataDir = mkdtempSync(path.join(tmpdir(), 'vega-pbdata-'));
	// El default de PB para `--migrationsDir` es EL HERMANO de `--dir` (`<padre>/pb_migrations`),
	// no algo dentro de él — y como `mkdtempSync` crea cada `dataDir` como hijo directo del
	// MISMO `tmpdir()`, todas las instancias "efímeras" de una máquina comparten ese hermano.
	// `--automigrate` (default true) escribe ahí una migración por cada colección creada vía
	// API, y las REPLICA TODAS en cualquier base nueva al arrancar: sin este flag explícito, un
	// PB "recién creado" en realidad hereda el esquema acumulado de TODAS las ejecuciones
	// previas en esta máquina (hallazgo P8·F1, 2026-07-19 — confundió una reproducción local:
	// parecía que `kitchen_sink` ya existía con forma vieja/parcial de una tanda anterior).
	// Metiéndolo dentro de `dataDir`, se borra junto con él en `stop()`.
	const migrationsDir = path.join(dataDir, 'pb_migrations');
	const port = await findFreePort();
	const url = `http://127.0.0.1:${port}`;

	// Superuser vía CLI (no necesita el servidor arrancado): más rápido y fiable que la API.
	await execPocketBase(bin, ['superuser', 'upsert', ADMIN_EMAIL, ADMIN_PASSWORD, '--dir', dataDir]);

	const child = spawn(
		bin,
		['serve', `--http=127.0.0.1:${port}`, '--dir', dataDir, '--migrationsDir', migrationsDir],
		{ stdio: 'pipe' }
	);
	child.stderr?.on('data', () => {}); // silencia stderr; los tests no dependen de sus logs

	await waitForHealth(url).catch((err) => {
		child.kill();
		rmSync(dataDir, { recursive: true, force: true });
		throw err;
	});

	return {
		url,
		adminEmail: ADMIN_EMAIL,
		adminPassword: ADMIN_PASSWORD,
		async stop() {
			await killProcess(child);
			rmSync(dataDir, { recursive: true, force: true });
		}
	};
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
