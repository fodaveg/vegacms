/**
 * Descargas reales contra PB: el token sigue autenticando, pero desaparece de los registros.
 * El control sin hook demuestra que el marcador llega al logger. Solo datos y credenciales
 * efímeros; ningún URL/token se imprime si falla un aserto. Sin Caddy ni servicios externos.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { isPocketBaseBinaryAvailable, pocketBaseBinaryVersion } from './pb-harness/binary';
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

const ROOT = path.resolve(import.meta.dirname, '../..');
const MARKER = 'vega-synthetic-log-marker-20261007';
const ORIGIN = 'https://admin.vegacms.com';
const DOWNLOAD = '/api/backups/synthetic.zip';

interface RequestLog {
	message: string;
	data: { url: string; status: number; referer: string };
}

describe.skipIf(!isPocketBaseBinaryAvailable())(
	'producción: copias sin token en logs y CORS',
	() => {
		let instance: PocketBaseInstanceDir | undefined;
		let server: PocketBaseServerHandle | undefined;
		let auth = '';
		let output = '';

		afterEach(async () => {
			await server?.stop();
			if (instance) destroyPocketBaseInstanceDir(instance);
			server = instance = undefined;
		});

		/** Petición autenticada a la instancia desechable; nunca incluye el token en mensajes. */
		async function api(method: string, route: string, body?: object) {
			return fetch(server!.url + route, {
				method,
				headers: { authorization: auth, 'content-type': 'application/json' },
				body: body ? JSON.stringify(body) : undefined
			});
		}

		/** El hook auxiliar observa DESPUÉS del saneamiento y fuerza el vaciado del logger real. */
		async function start(withRedaction: boolean) {
			expect(pocketBaseBinaryVersion()).toBe('0.39.9');
			instance = createPocketBaseInstanceDir();
			const hooksDir = path.join(instance.dataDir, 'test_hooks');
			mkdirSync(hooksDir);
			writeFileSync(
				path.join(hooksDir, 'observe.pb.js'),
				`routerUse(new Middleware((e) => {
				try { return e.next(); } finally {
					if (e.request.url.path.startsWith('/api/backups/')) {
						$app.store().set('redactionObservation', {
							queryEmpty: e.request.url.rawQuery === '',
							uriClean: e.request.requestURI.indexOf('?') === -1,
							refererEmpty: e.request.header.get('Referer') === ''
						});
					}
				}
			}, -1037));
			routerAdd('GET', '/api/test/log-flush', (e) => {
				$app.logger().handler().writeAll(e.request.context());
				return e.json(200, $app.store().get('redactionObservation'));
			}, $apis.requireSuperuserAuth(), $apis.skipSuccessActivityLog());`
			);
			if (withRedaction) {
				copyFileSync(
					path.join(ROOT, 'infra/production/pb_hooks/vega-backup-log-redaction.pb.js'),
					path.join(hooksDir, 'redact.pb.js')
				);
			}
			await createPocketBaseSuperuser(instance.dataDir);
			output = '';
			server = await startPocketBaseServerOn(instance, {
				hooksDir,
				origins: ORIGIN,
				onOutput: (text) => (output += text)
			});
			auth = '';
			const login = await api('POST', '/api/collections/_superusers/auth-with-password', {
				identity: ADMIN_EMAIL,
				password: ADMIN_PASSWORD
			});
			expect(login.status).toBe(200);
			auth = (await login.json()).token;
			expect(
				(await api('PATCH', '/api/settings', { logs: { maxDays: 1, minLevel: 0 } })).status
			).toBe(200);
		}

		async function logs(): Promise<RequestLog[]> {
			expect((await api('GET', '/api/test/log-flush')).status).toBe(200);
			const response = await api('GET', '/api/logs?perPage=100');
			expect(response.status).toBe(200);
			return (await response.json()).items;
		}

		test('control: sin hook, el marcador artificial sí aparece en el log de un 403', async () => {
			await start(false);
			const response = await fetch(`${server!.url}${DOWNLOAD}?token=${MARKER}`);
			expect(response.status).toBe(403);
			await response.text();
			await expect.poll(async () => JSON.stringify(await logs()).includes(MARKER)).toBe(true);
		}, 20_000);

		test('descarga íntegra y logs limpios en 200, 403, 429 y Referer hacia otra ruta', async () => {
			await start(true);
			// Una copia REAL de esta base efímera: no se lee ni envía ningún dato del usuario.
			expect((await api('POST', '/api/backups', { name: 'synthetic.zip' })).status).toBe(204);
			await expect
				.poll(async () => {
					const list = await api('GET', '/api/backups');
					return (await list.json()).some(
						(entry: { key: string }) => entry.key === 'synthetic.zip'
					);
				})
				.toBe(true);
			const fixture = readFileSync(path.join(instance!.dataDir, 'backups/synthetic.zip'));
			expect(fixture.length).toBeGreaterThan(22);
			const tokenResponse = await api('POST', '/api/files/token');
			expect(tokenResponse.status).toBe(200);
			const fileToken = (await tokenResponse.json()).token as string;
			const referer = `${server!.url}${DOWNLOAD}?token=${MARKER}`;
			const success = await fetch(
				`${server!.url}${DOWNLOAD}?token=${encodeURIComponent(fileToken)}&token=${MARKER}&%74oken=${MARKER}`,
				{ headers: { Referer: referer } }
			);
			expect(success.status).toBe(200);
			const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
			expect(digest(new Uint8Array(await success.arrayBuffer()))).toBe(digest(fixture));

			for (const query of [
				`token=${MARKER}`,
				`%74oken=${MARKER}&token=other`,
				`token=${MARKER}&bad=%zz`
			]) {
				const denied = await fetch(`${server!.url}${DOWNLOAD}?${query}`, {
					headers: { Referer: referer }
				});
				expect(denied.status).toBe(403);
				await denied.text();
			}
			// Restricción IP real, posterior a la autenticación del token válido.
			expect((await api('PATCH', '/api/settings', { superuserIPs: ['192.0.2.1'] })).status).toBe(
				200
			);
			const ipDenied = await fetch(`${server!.url}${DOWNLOAD}?token=${fileToken}&token=${MARKER}`);
			expect(ipDenied.status).toBe(403);
			await ipDenied.text();
			// Recupera el acceso de administración reiniciando con la CLI local de fixtures.
			await server!.stop();
			server = undefined;
			// La restricción se retira antes del siguiente arranque en una migración local de fixture,
			// sin añadir una excepción IP ni un endpoint que modifique settings.
			writeFileSync(
				path.join(instance!.migrationsDir, '9999999999_reset_ip.js'),
				`migrate((app) => { const s = app.settings(); s.superuserIPs = []; app.save(s); });`
			);
			server = await startPocketBaseServerOn(instance!, {
				hooksDir: path.join(instance!.dataDir, 'test_hooks'),
				origins: ORIGIN,
				onOutput: (text) => (output += text)
			});
			expect(
				(
					await api('PATCH', '/api/settings', {
						rateLimits: {
							enabled: true,
							rules: [{ label: '/api/backups/', maxRequests: 1, duration: 60 }]
						}
					})
				).status
			).toBe(200);
			for (const expected of [403, 429]) {
				const limited = await fetch(`${server!.url}${DOWNLOAD}?token=${MARKER}`, {
					headers: { Referer: referer }
				});
				expect(limited.status).toBe(expected);
				await limited.text();
			}
			for (const ref of [
				referer,
				`${server!.url}${DOWNLOAD}?%74oken=${MARKER}`,
				`${server!.url}${DOWNLOAD}?%zz=${MARKER}`
			]) {
				const health = await fetch(`${server!.url}/api/health`, { headers: { Referer: ref } });
				expect(health.status).toBe(200);
				await health.text();
			}
			const ordinaryReferer = 'https://admin.vegacms.com/copias?view=recent';
			const ordinary = await fetch(`${server!.url}/api/health`, {
				headers: { Referer: ordinaryReferer }
			});
			expect(ordinary.status).toBe(200);
			await ordinary.text();

			await expect
				.poll(async () => (await logs()).filter((entry) => entry.data?.url === DOWNLOAD).length)
				.toBe(7);
			await expect
				.poll(async () => (await logs()).some((entry) => entry.data?.referer === ordinaryReferer))
				.toBe(true);
			const entries = await logs();
			const backupEntries = entries.filter((entry) => entry.data?.url === DOWNLOAD);
			expect(backupEntries.map((entry) => entry.data.status)).toEqual(
				expect.arrayContaining([200, 403, 429])
			);
			expect(
				backupEntries.every((entry) => entry.message === `GET ${DOWNLOAD}` && !entry.data.referer)
			).toBe(true);
			const serialized = JSON.stringify(entries);
			expect(serialized.includes(MARKER)).toBe(false);
			expect(serialized.includes(fileToken)).toBe(false);
			const observation = await api('GET', '/api/test/log-flush');
			expect(await observation.json()).toEqual({
				queryEmpty: true,
				uriClean: true,
				refererEmpty: true
			});
			await server!.stop();
			server = undefined;
			expect(output.includes(MARKER)).toBe(false);
			expect(output.includes(fileToken)).toBe(false);
		}, 30_000);

		test('GET y preflight solo autorizan el origen de referencia; sin Origin la API funciona', async () => {
			await start(true);
			const dockerfile = readFileSync(path.join(ROOT, 'infra/production/Dockerfile'), 'utf8');
			expect(dockerfile).toContain(`"--origins=${ORIGIN}"`);
			for (const method of ['GET', 'OPTIONS']) {
				for (const origin of [ORIGIN, 'https://vega-cors-denied.invalid']) {
					const response = await fetch(`${server!.url}/api/health`, {
						method,
						headers: {
							Origin: origin,
							...(method === 'OPTIONS'
								? {
										'Access-Control-Request-Method': 'GET',
										'Access-Control-Request-Headers': 'Authorization'
									}
								: {})
						}
					});
					expect(response.ok).toBe(true);
					expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
						origin === ORIGIN ? ORIGIN : null
					);
					await response.text();
				}
			}
			const health = await fetch(`${server!.url}/api/health`);
			expect(health.status).toBe(200);
			expect(health.headers.get('Access-Control-Allow-Origin')).toBeNull();
			await health.text();
		}, 20_000);
	}
);
