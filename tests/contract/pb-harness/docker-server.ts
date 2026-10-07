/** PocketBase de una imagen local inmutable, con hook empaquetado y datos/CA solo de fixture. */
import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { ADMIN_EMAIL, ADMIN_PASSWORD, type RunningPocketBase } from './server';

const exec = promisify(execFile);

/** Resuelve el gateway desde la misma imagen; no supone que --network=host comparta localhost. */
export async function imageGatewayIp(image: string): Promise<string> {
	const { stdout } = await exec('docker', [
		'run',
		'--rm',
		'--pull=never',
		'--platform',
		'linux/amd64',
		'--read-only',
		'--cap-drop',
		'ALL',
		'--entrypoint',
		'/bin/busybox',
		image,
		'nslookup',
		'host.docker.internal'
	]);
	const ip = stdout.match(/Name:\s*host\.docker\.internal\s*Address:\s*([\d.]+)/)?.[1];
	if (!ip || !net.isIPv4(ip)) throw new Error('El gateway Docker no devolvió una IPv4 de fixture.');
	return ip;
}

/** Solo monta datos efímeros y una COPIA de la CA pública; mantiene USER 10001 y el hook de imagen. */
export async function startImagePocketBase(
	image: string,
	caFile?: string
): Promise<RunningPocketBase> {
	if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('La prueba exige image ID inmutable.');
	const dir = await mkdtemp(path.join(tmpdir(), 'vega-pb-image-'));
	const data = path.join(dir, 'data');
	const publicCa = path.join(dir, 'public-ca');
	const name = `vega-contact-proof-${randomUUID()}`;
	let started = false;
	const stop = async () => {
		try {
			if (started) await exec('docker', ['rm', '--force', name]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};
	try {
		// El padre sigue 0700 en host; el UID de imagen necesita escribir SOLO en el bind de datos.
		await mkdir(data, { mode: 0o777 });
		await chmod(data, 0o777);
		await mkdir(path.join(data, 'migrations'), { mode: 0o777 });
		await chmod(path.join(data, 'migrations'), 0o777);
		const common = [
			'--pull=never',
			'--platform',
			'linux/amd64',
			'--read-only',
			'--cap-drop',
			'ALL',
			'--security-opt=no-new-privileges',
			'--tmpfs',
			'/tmp:size=16m',
			'--mount',
			`type=bind,src=${data},dst=/test-data`
		];
		// Config privada bajo padre0700; el launcher Docker no lleva la contraseña en argv/logs.
		const credentials = path.join(dir, 'credentials');
		const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
		await writeFile(
			credentials,
			`email=${quote(ADMIN_EMAIL)}\npassword=${quote(ADMIN_PASSWORD)}\n`,
			{ mode: 0o644 }
		);
		await chmod(credentials, 0o644);
		try {
			await exec('docker', [
				'run',
				'--rm',
				...common,
				'--mount',
				`type=bind,src=${credentials},dst=/test-credentials,readonly`,
				'--entrypoint',
				'/bin/sh',
				image,
				'-c',
				'. /test-credentials; exec /pb/pocketbase superuser upsert "$email" "$password" --dir=/test-data --migrationsDir=/test-data/migrations'
			]);
		} finally {
			await rm(credentials, { force: true });
		}
		const server = net.createServer();
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const port = (server.address() as net.AddressInfo).port;
		await new Promise<void>((resolve) => server.close(() => resolve()));
		const trust: string[] = [];
		if (caFile) {
			await mkdir(publicCa, { mode: 0o755 });
			await mkdir(path.join(publicCa, 'empty'), { mode: 0o755 });
			await chmod(publicCa, 0o755);
			await chmod(path.join(publicCa, 'empty'), 0o755);
			await copyFile(caFile, path.join(publicCa, 'ca.pem'));
			await chmod(path.join(publicCa, 'ca.pem'), 0o644);
			trust.push(
				'--mount',
				`type=bind,src=${publicCa},dst=/test-ca,readonly`,
				'--env',
				'SSL_CERT_FILE=/test-ca/ca.pem',
				'--env',
				'SSL_CERT_DIR=/test-ca/empty'
			);
		}
		await exec('docker', [
			'run',
			'--detach',
			'--name',
			name,
			...common,
			...trust,
			'--publish',
			`127.0.0.1:${port}:8090`,
			'--env',
			'VEGA_CONTACT_NOTIFY_TO=editor@example.test',
			image,
			'serve',
			'--http=0.0.0.0:8090',
			'--dir=/test-data',
			'--migrationsDir=/test-data/migrations',
			'--hooksDir=/pb/pb_hooks',
			'--publicDir=/pb/pb_public',
			'--origins=https://admin.vegacms.com'
		]);
		started = true;
		const url = `http://127.0.0.1:${port}`;
		const deadline = Date.now() + 10_000;
		while (true) {
			try {
				if ((await fetch(`${url}/api/health`)).ok) break;
			} catch {
				/* Arranque pendiente. */
			}
			if (Date.now() > deadline) throw new Error('PocketBase de imagen no respondió a health.');
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return { url, adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, stop };
	} catch (error) {
		await stop();
		throw error;
	}
}
