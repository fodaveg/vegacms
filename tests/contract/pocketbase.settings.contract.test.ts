/**
 * MEDICIÓN (contrato) de `GET/PATCH /api/settings` y `POST /api/settings/test/*` contra un
 * PocketBase REAL, previa a construir la pantalla de ajustes (SMTP, copias, S3, `meta.appURL`).
 * Fija lo que el servidor HACE con los secretos y con los bloques parciales, para que la pantalla
 * no dependa de suposiciones. Si no hay binario (`.pbbin/`, `pnpm pb:download`) el bloque entero
 * se salta declarándolo, igual que `pocketbase.contract.test.ts`.
 *
 * Los secretos nunca viajan por la API (el GET no los devuelve), así que la conservación se
 * comprueba LEYENDO la base de datos de PocketBase (`_params`, id `settings`, JSON en claro porque
 * el arranque no define `PB_ENCRYPTION_KEY`), en solo lectura.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
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

const AVAILABLE = isPocketBaseBinaryAvailable();

interface Settings {
	smtp: Record<string, unknown>;
	s3: Record<string, unknown>;
	backups: { cron: string; cronMaxKeep: number; s3: Record<string, unknown> };
	meta: Record<string, unknown>;
}

interface FieldError {
	code: string;
}

/** Cuerpo de respuesta visto como lo leen las mediciones: cada test solo toca lo que PB rellena. */
interface ApiBody extends Settings {
	message: string;
	data: {
		backups: { cron: FieldError; cronMaxKeep: FieldError };
		meta: { appURL: FieldError };
		email: FieldError;
		template: FieldError;
		filesystem: FieldError;
	};
}

interface ApiResult {
	status: number;
	body: ApiBody;
}

describe.skipIf(!AVAILABLE)(
	'PocketBase settings — contrato medido (binario real en .pbbin/)',
	() => {
		let instance: PocketBaseInstanceDir;
		let server: PocketBaseServerHandle;
		let token: string;

		async function api(method: string, route: string, body?: unknown): Promise<ApiResult> {
			const res = await fetch(`${server.url}${route}`, {
				method,
				headers: { 'content-type': 'application/json', authorization: token },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			return { status: res.status, body: (await res.json()) as ApiBody };
		}

		/** Lo que PocketBase tiene REALMENTE guardado, secretos incluidos (lectura directa de la BD). */
		function stored(): Settings {
			const db = new DatabaseSync(path.join(instance.dataDir, 'data.db'), { readOnly: true });
			try {
				const row = db.prepare("SELECT value FROM _params WHERE id = 'settings'").get() as {
					value: Uint8Array;
				};
				// PocketBase guarda el JSON como BLOB: `node:sqlite` lo devuelve como Uint8Array.
				return JSON.parse(Buffer.from(row.value).toString('utf8')) as Settings;
			} finally {
				db.close();
			}
		}

		const SEEDED = {
			smtp: {
				enabled: true,
				host: '127.0.0.1',
				port: 1,
				username: 'user',
				password: 'smtp-secret',
				tls: false
			},
			s3: {
				enabled: false,
				bucket: 'files',
				region: 'eu',
				endpoint: 'https://s3.example.test',
				accessKey: 'files-key',
				secret: 'files-secret',
				forcePathStyle: false
			},
			backups: {
				cron: '0 0 * * *',
				cronMaxKeep: 5,
				s3: {
					enabled: false,
					bucket: 'bak',
					region: 'eu',
					endpoint: 'https://s3.example.test',
					accessKey: 'bak-key',
					secret: 'bak-secret',
					forcePathStyle: false
				}
			}
		};

		beforeAll(async () => {
			instance = createPocketBaseInstanceDir();
			await createPocketBaseSuperuser(instance.dataDir);
			server = await startPocketBaseServerOn(instance);
			const res = await fetch(`${server.url}/api/collections/_superusers/auth-with-password`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
			});
			token = ((await res.json()) as { token: string }).token;
		}, 30_000);

		afterAll(async () => {
			await server?.stop();
			if (instance) destroyPocketBaseInstanceDir(instance);
		});

		beforeEach(async () => {
			// Estado conocido, con los tres secretos guardados, antes de cada medición.
			const res = await api('PATCH', '/api/settings', {
				...SEEDED,
				meta: { appURL: 'http://localhost:8090' }
			});
			expect(res.status).toBe(200);
		});

		test('el estado sembrado de verdad guarda los tres secretos (premisa de las demás mediciones)', () => {
			const s = stored();
			expect([s.smtp.password, s.s3.secret, s.backups.s3.secret]).toEqual([
				'smtp-secret',
				'files-secret',
				'bak-secret'
			]);
		});

		// --- 1. Forma del GET ---------------------------------------------------------------

		test('1. GET no devuelve los secretos: la clave está AUSENTE (ni asteriscos ni vacío)', async () => {
			const { body } = await api('GET', '/api/settings');
			expect(['password' in body.smtp, 'secret' in body.s3, 'secret' in body.backups.s3]).toEqual([
				false,
				false,
				false
			]);
		});

		test('1. GET sí devuelve el resto de campos de los bloques (para poder pintarlos)', async () => {
			const { body } = await api('GET', '/api/settings');
			expect([body.smtp.host, body.s3.accessKey, body.backups.s3.accessKey]).toEqual([
				'127.0.0.1',
				'files-key',
				'bak-key'
			]);
		});

		test('1. GET sin autenticación como superuser responde 401', async () => {
			const res = await fetch(`${server.url}/api/settings`);
			expect(res.status).toBe(401);
		});

		// --- 2. PATCH de un solo bloque ------------------------------------------------------

		test('2. PATCH solo de meta.appURL cambia el appURL', async () => {
			await api('PATCH', '/api/settings', { meta: { appURL: 'https://cms.example.test' } });
			expect(stored().meta.appURL).toBe('https://cms.example.test');
		});

		test('2. PATCH solo de meta.appURL conserva los tres secretos guardados', async () => {
			await api('PATCH', '/api/settings', { meta: { appURL: 'https://cms.example.test' } });
			const s = stored();
			expect([s.smtp.password, s.s3.secret, s.backups.s3.secret]).toEqual([
				'smtp-secret',
				'files-secret',
				'bak-secret'
			]);
		});

		test('2. PATCH de un solo campo de s3 conserva su secreto y el resto del bloque', async () => {
			await api('PATCH', '/api/settings', { s3: { bucket: 'otro' } });
			const s = stored();
			expect([s.s3.bucket, s.s3.secret, s.s3.accessKey]).toEqual([
				'otro',
				'files-secret',
				'files-key'
			]);
		});

		// --- 3. PATCH devolviendo el bloque tal cual vino del GET -----------------------------

		test('3. PATCH con el bloque smtp tal cual vino del GET (sin password) conserva el secreto', async () => {
			const { body } = await api('GET', '/api/settings');
			await api('PATCH', '/api/settings', { smtp: { ...body.smtp, host: 'smtp.example.test' } });
			const s = stored();
			expect([s.smtp.host, s.smtp.password]).toEqual(['smtp.example.test', 'smtp-secret']);
		});

		test('3. PATCH con un password enmascarado (asteriscos) lo MACHACA: PocketBase lo guarda literal', async () => {
			await api('PATCH', '/api/settings', { smtp: { password: '******' } });
			expect(stored().smtp.password).toBe('******');
		});

		// --- 4. PATCH de smtp omitiendo password ----------------------------------------------

		test('4. PATCH de smtp omitiendo password conserva el secreto', async () => {
			await api('PATCH', '/api/settings', { smtp: { username: 'otro-usuario' } });
			const s = stored();
			expect([s.smtp.username, s.smtp.password]).toEqual(['otro-usuario', 'smtp-secret']);
		});

		test('4. PATCH con password "" BORRA el secreto (vaciar es explícito, no omisión)', async () => {
			await api('PATCH', '/api/settings', { smtp: { password: '' } });
			expect(stored().smtp.password).toBe('');
		});

		test('4. PATCH con un password nuevo lo sustituye', async () => {
			await api('PATCH', '/api/settings', { smtp: { password: 'nuevo' } });
			expect(stored().smtp.password).toBe('nuevo');
		});

		// --- 5. PATCH parcial dentro de un bloque ---------------------------------------------

		test('5. PATCH de backups.cron y cronMaxKeep FUSIONA: actualiza ambos', async () => {
			await api('PATCH', '/api/settings', { backups: { cron: '5 4 * * *', cronMaxKeep: 9 } });
			const b = stored().backups;
			expect([b.cron, b.cronMaxKeep]).toEqual(['5 4 * * *', 9]);
		});

		test('5. PATCH de backups.cron y cronMaxKeep conserva backups.s3 entero, secreto incluido', async () => {
			await api('PATCH', '/api/settings', { backups: { cron: '5 4 * * *', cronMaxKeep: 9 } });
			expect(stored().backups.s3).toEqual(SEEDED.backups.s3);
		});

		// --- 6. Validación --------------------------------------------------------------------

		test('6. backups.cron inválido: 400 con código validation_invalid_cron en data.backups.cron', async () => {
			const res = await api('PATCH', '/api/settings', { backups: { cron: 'nope' } });
			expect([res.status, res.body.data.backups.cron.code]).toEqual([
				400,
				'validation_invalid_cron'
			]);
		});

		test('6. backups.cron inválido NO se guarda (el valor anterior sigue)', async () => {
			await api('PATCH', '/api/settings', { backups: { cron: 'nope' } });
			expect(stored().backups.cron).toBe('0 0 * * *');
		});

		test('6. backups.cron vacío es válido (desactiva las copias programadas)', async () => {
			const res = await api('PATCH', '/api/settings', { backups: { cron: '' } });
			expect([res.status, stored().backups.cron]).toEqual([200, '']);
		});

		test('6. backups.cronMaxKeep a 0 se rechaza como validation_required', async () => {
			const res = await api('PATCH', '/api/settings', { backups: { cronMaxKeep: 0 } });
			expect([res.status, res.body.data.backups.cronMaxKeep.code]).toEqual([
				400,
				'validation_required'
			]);
		});

		test('6. meta.appURL que no es URL: 400 con validation_is_url', async () => {
			const res = await api('PATCH', '/api/settings', { meta: { appURL: 'not a url' } });
			expect([res.status, res.body.data.meta.appURL.code]).toEqual([400, 'validation_is_url']);
		});

		test('6. meta.appURL vacío: 400 con validation_required', async () => {
			const res = await api('PATCH', '/api/settings', { meta: { appURL: '' } });
			expect([res.status, res.body.data.meta.appURL.code]).toEqual([400, 'validation_required']);
		});

		test('6. meta.appURL con esquema no http (ftp://) PocketBase lo acepta: la validación de http(s) es nuestra', async () => {
			const res = await api('PATCH', '/api/settings', { meta: { appURL: 'ftp://x' } });
			expect(res.status).toBe(200);
		});

		test('6. un PATCH con un campo inválido no aplica los válidos del mismo envío', async () => {
			await api('PATCH', '/api/settings', {
				meta: { appURL: 'https://nuevo.example.test' },
				backups: { cron: 'nope' }
			});
			expect(stored().meta.appURL).toBe('http://localhost:8090');
		});

		// --- 7. Endpoints de prueba -----------------------------------------------------------

		test('7. POST /test/email sin cuerpo: 400 con email y template validation_required', async () => {
			const res = await api('POST', '/api/settings/test/email', {});
			expect([res.status, res.body.data.email.code, res.body.data.template.code]).toEqual([
				400,
				'validation_required',
				'validation_required'
			]);
		});

		test('7. POST /test/email con SMTP inalcanzable: 400, data vacío y el error crudo en message', async () => {
			const res = await api('POST', '/api/settings/test/email', {
				email: 'dest@example.test',
				template: 'verification'
			});
			expect([res.status, res.body.data, res.body.message]).toEqual([
				400,
				{},
				expect.stringContaining('Failed to send the test email. Raw error:')
			]);
		});

		test('7. POST /test/s3 con S3 desactivado: 400 con "S3 storage filesystem is not enabled"', async () => {
			const res = await api('POST', '/api/settings/test/s3', { filesystem: 'storage' });
			expect([res.status, res.body.message]).toEqual([
				400,
				expect.stringContaining('S3 storage filesystem is not enabled')
			]);
		});

		test('7. POST /test/s3 con un filesystem desconocido: 400 con validation_in_invalid', async () => {
			const res = await api('POST', '/api/settings/test/s3', { filesystem: 'nope' });
			expect([res.status, res.body.data.filesystem.code]).toEqual([400, 'validation_in_invalid']);
		});

		test('7. POST /test/s3 de backups con S3 desactivado: 400', async () => {
			const res = await api('POST', '/api/settings/test/s3', { filesystem: 'backups' });
			expect(res.status).toBe(400);
		});
	}
);
