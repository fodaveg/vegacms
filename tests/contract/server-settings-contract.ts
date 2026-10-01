/**
 * Contrato de la sección `serverSettings` del puerto (`src/lib/backend/server-settings.ts`), el
 * mismo para `memory` (paridad) y para PocketBase REAL. Solo usa el puerto: lo que PocketBase tiene
 * guardado de verdad (los secretos, que el GET no devuelve) lo lee cada fichero con `readSecrets`.
 *
 * Quitar la clave secreta del almacén NO está aquí: PocketBase 0.39.9 no persiste ese borrado (ver
 * `pocketbase.server-settings.contract.test.ts`) y el tipo del borrador no deja pedirlo.
 *
 * Lo que no se puede probar contra un PocketBase sin almacén S3 es la prueba CORRECTA de conexión
 * (`{ ok: true }`): ni en el binario oficial ni aquí hay un servidor S3 al que llegar.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import type { BackendPort } from '$lib/backend';
import { buildServerSettingsPatch } from '$lib/backend/server-settings-rules';

export interface StoredSecrets {
	smtpPassword: string;
	backupsS3Secret: string | undefined;
}

export interface ServerSettingsContractOptions {
	name: string;
	/** Un puerto con sesión de superusuario sobre un servidor limpio o reutilizado (se re-siembra). */
	makePort(): Promise<BackendPort>;
	/** Los secretos tal como están guardados (PB: lectura directa de su base; memory: inspección). */
	readSecrets(port: BackendPort): Promise<StoredSecrets>;
}

/** El estado conocido de partida: cron diario, 5 copias, almacén externo APAGADO con sus datos. */
const SEED = {
	backups: {
		cron: '0 0 * * *',
		cronMaxKeep: 5,
		s3: {
			enabled: false,
			endpoint: 'https://s3.example.test',
			bucket: 'copias',
			region: 'eu',
			accessKey: 'bak-key',
			forcePathStyle: false,
			secret: 'bak-secret'
		}
	},
	smtp: { password: 'smtp-secret' }
};

export function describeServerSettingsContract(options: ServerSettingsContractOptions): void {
	describe(`serverSettings (ajustes del servidor): ${options.name}`, () => {
		let port: BackendPort;
		const section = () => port.serverSettings!;

		beforeEach(async () => {
			port = await options.makePort();
			await section().update(SEED);
		});

		test('capability y sección del puerto aparecen juntas', () => {
			expect(port.capabilities.serverSettings).toBe(true);
			expect(port.serverSettings).toBeDefined();
		});

		test('get trae los bloques de la interfaz y NINGÚN secreto', async () => {
			const settings = await section().get();
			expect(settings.backups).toMatchObject({
				cron: '0 0 * * *',
				cronMaxKeep: 5,
				s3: { enabled: false, bucket: 'copias', accessKey: 'bak-key' }
			});
			expect(typeof settings.meta.appURL).toBe('string');
			expect(JSON.stringify(settings)).not.toMatch(/secret|password|bak-secret|smtp-secret/i);
		});

		test('parchear cron y cronMaxKeep no toca backups.s3 ni su secreto', async () => {
			const before = await section().get();
			const after = await section().update({ backups: { cron: '0 0 * * 0', cronMaxKeep: 9 } });
			expect(after.backups).toMatchObject({ cron: '0 0 * * 0', cronMaxKeep: 9 });
			expect(after.backups.s3).toEqual(before.backups.s3);
			expect((await options.readSecrets(port)).backupsS3Secret).toBe('bak-secret');
		});

		test('«Nunca» (cron vacío) se guarda y desactiva las copias programadas', async () => {
			const after = await section().update({ backups: { cron: '' } });
			expect(after.backups.cron).toBe('');
		});

		test('guardar el almacén sin escribir la clave secreta (parche de la pantalla) no la pierde', async () => {
			const current = await section().get();
			const patch = buildServerSettingsPatch(current, {
				backups: { s3: { enabled: true, bucket: 'otro' } },
				secrets: { backupsS3Secret: { kind: 'set', value: '' } }
			});
			expect(patch).toEqual({ backups: { s3: { enabled: true, bucket: 'otro' } } });
			const after = await section().update(patch);
			expect(after.backups.s3).toMatchObject({ enabled: true, bucket: 'otro' });
			expect((await options.readSecrets(port)).backupsS3Secret).toBe('bak-secret');
		});

		test('una clave secreta nueva sustituye a la guardada', async () => {
			await section().update({ backups: { s3: { secret: 'nueva' } } });
			expect((await options.readSecrets(port)).backupsS3Secret).toBe('nueva');
		});

		test('quitar la contraseña del correo la borra y no toca la clave del almacén', async () => {
			const current = await section().get();
			await section().update(
				buildServerSettingsPatch(current, { secrets: { smtpPassword: { kind: 'clear' } } })
			);
			expect(await options.readSecrets(port)).toEqual({
				smtpPassword: '',
				backupsS3Secret: 'bak-secret'
			});
		});

		test('cron inválido: error de campo `backups.cron` y no se aplica nada del mismo envío', async () => {
			await expect(
				section().update({ backups: { cron: 'cada lunes', cronMaxKeep: 9 } })
			).rejects.toMatchObject({
				kind: 'validation',
				fieldErrors: { 'backups.cron': { code: 'validation_invalid_cron' } }
			});
			const after = await section().get();
			expect(after.backups).toMatchObject({ cron: '0 0 * * *', cronMaxKeep: 5 });
		});

		test('cronMaxKeep a 0 con copias programadas: error de campo `backups.cronMaxKeep`', async () => {
			await expect(section().update({ backups: { cronMaxKeep: 0 } })).rejects.toMatchObject({
				kind: 'validation',
				fieldErrors: { 'backups.cronMaxKeep': { code: 'validation_required' } }
			});
		});

		test('probar el almacén cuando está apagado: resultado fallido con el texto del servidor, no excepción', async () => {
			const outcome = await section().testS3();
			expect(outcome).toEqual({ ok: false, message: expect.stringContaining('not enabled') });
		});

		test('sin sesión de superusuario no hay sección (la capability se apaga con ella)', async () => {
			// Un puerto sin sesión rechaza con VegaError; aquí solo se fija que la sección rechaza tipado.
			await port.logout();
			await expect(section().get()).rejects.toMatchObject({ name: 'VegaError' });
		});
	});
}
