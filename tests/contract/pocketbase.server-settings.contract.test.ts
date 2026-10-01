/**
 * Contrato de la sección `serverSettings` del puerto contra un PocketBase REAL: las mismas pruebas
 * que corre `memory` (`server-settings-contract.ts`) más lo que solo puede medirse aquí: los
 * secretos que PocketBase tiene guardados (lectura de su base, solo lectura), el error crudo de una
 * prueba de S3 hacia un servidor que no existe y el de una prueba de correo sin SMTP. La medición
 * de la red cruda está en `pocketbase.settings.contract.test.ts`. Sin binario (`pnpm pb:download`)
 * el bloque entero se salta declarándolo.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	createPocketBaseInstanceDir,
	createPocketBaseSuperuser,
	destroyPocketBaseInstanceDir,
	startPocketBaseServerOn,
	type PocketBaseInstanceDir,
	type PocketBaseServerHandle
} from './pb-harness/server';
import { describeServerSettingsContract } from './server-settings-contract';

const AVAILABLE = isPocketBaseBinaryAvailable();

describe.skipIf(!AVAILABLE)('ajustes del servidor contra PocketBase real', () => {
	let instance: PocketBaseInstanceDir;
	let server: PocketBaseServerHandle;

	beforeAll(async () => {
		instance = createPocketBaseInstanceDir();
		await createPocketBaseSuperuser(instance.dataDir);
		server = await startPocketBaseServerOn(instance);
	}, 30_000);

	afterAll(async () => {
		await server?.stop();
		if (instance) destroyPocketBaseInstanceDir(instance);
	});

	async function makePort(): Promise<BackendPort> {
		const port = createPocketBaseBackend({ url: server.url });
		await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
		return port;
	}

	/** Lo que PocketBase tiene guardado de verdad (JSON en claro: el arranque no pone clave). */
	function readSecrets(): Promise<{ smtpPassword: string; backupsS3Secret: string | undefined }> {
		const db = new DatabaseSync(path.join(instance.dataDir, 'data.db'), { readOnly: true });
		try {
			const row = db.prepare("SELECT value FROM _params WHERE id = 'settings'").get() as {
				value: Uint8Array;
			};
			const stored = JSON.parse(Buffer.from(row.value).toString('utf8')) as {
				smtp: { password: string };
				backups: { s3: { secret: string } };
			};
			return Promise.resolve({
				smtpPassword: stored.smtp.password,
				backupsS3Secret: stored.backups.s3.secret
			});
		} finally {
			db.close();
		}
	}

	describeServerSettingsContract({
		name: 'pocketbase',
		makePort: async () => {
			// Cada prueba parte de lo mismo: PocketBase conserva lo que escribió la anterior.
			const port = await makePort();
			await port.serverSettings!.update({ backups: { cron: '', s3: { enabled: false } } });
			return port;
		},
		readSecrets
	});

	describe('lo que solo se mide con el binario real', () => {
		test('la prueba de S3 hacia un servidor que no existe devuelve el error crudo como resultado', async () => {
			const section = (await makePort()).serverSettings!;
			await section.update({
				backups: {
					s3: {
						enabled: true,
						endpoint: 'https://s3.no-existe.test',
						bucket: 'b',
						region: 'r',
						accessKey: 'k',
						secret: 's'
					}
				}
			});
			const outcome = await section.testS3();
			expect(outcome).toEqual({
				ok: false,
				message: expect.stringContaining('Failed to test the S3 filesystem. Raw error:')
			});
			await section.update({ backups: { s3: { enabled: false } } });
		});

		test('la prueba de correo con un SMTP inalcanzable devuelve el error crudo como resultado', async () => {
			const section = (await makePort()).serverSettings!;
			await section.update({
				smtp: { enabled: true, host: '127.0.0.1', port: 1, tls: false }
			});
			const outcome = await section.testEmail('dest@example.test', 'verification');
			expect(outcome).toEqual({
				ok: false,
				message: expect.stringContaining('Failed to send the test email. Raw error:')
			});
			await section.update({ smtp: { enabled: false } });
		});

		test('con el almacén activado, el endpoint se valida como URL: «s3.x.test» vale y «e» no', async () => {
			const section = (await makePort()).serverSettings!;
			const ok = await section.update({
				backups: { s3: { enabled: true, endpoint: 's3.sin-esquema.test' } }
			});
			expect(ok.backups.s3.endpoint).toBe('s3.sin-esquema.test');
			await expect(section.update({ backups: { s3: { endpoint: 'e' } } })).rejects.toMatchObject({
				kind: 'validation',
				fieldErrors: { 'backups.s3.endpoint': { code: 'validation_is_url' } }
			});
			await section.update({ backups: { s3: { enabled: false } } });
		});

		test('PocketBase NO persiste el borrado de backups.s3.secret: el siguiente guardado lo resucita (por eso Vega no lo ofrece)', async () => {
			const port = await makePort();
			const section = port.serverSettings!;
			await section.update({ backups: { s3: { secret: 'antes' } } });
			await section.update({ backups: { s3: { secret: '' } } });
			expect((await readSecrets()).backupsS3Secret).toBeUndefined();
			await section.update({ backups: { cronMaxKeep: 4 } });
			expect((await readSecrets()).backupsS3Secret).toBe('antes');
		});

		test('con el almacén activado y sin ninguna clave secreta guardada, falta es un error de ESE campo', async () => {
			// Servidor aparte: los demás ya guardaron una clave y PocketBase no deja quitarla.
			const fresh = createPocketBaseInstanceDir();
			await createPocketBaseSuperuser(fresh.dataDir);
			const freshServer = await startPocketBaseServerOn(fresh);
			try {
				const port = createPocketBaseBackend({ url: freshServer.url });
				await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
				await expect(
					port.serverSettings!.update({ backups: { s3: { enabled: true } } })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { 'backups.s3.secret': { code: 'validation_required' } }
				});
			} finally {
				await freshServer.stop();
				destroyPocketBaseInstanceDir(fresh);
			}
		});

		test('con copias programadas vacías PocketBase acepta cronMaxKeep 0 (por eso la pantalla lo para)', async () => {
			const section = (await makePort()).serverSettings!;
			await section.update({ backups: { cron: '' } });
			const after = await section.update({ backups: { cronMaxKeep: 0 } });
			expect(after.backups.cronMaxKeep).toBe(0);
			await section.update({ backups: { cronMaxKeep: 3 } });
		});

		test('una macro de cron (@daily) es válida: la pantalla la trata como personalizada', async () => {
			const section = (await makePort()).serverSettings!;
			const after = await section.update({ backups: { cron: '@daily' } });
			expect(after.backups.cron).toBe('@daily');
			await section.update({ backups: { cron: '' } });
		});
	});
});
