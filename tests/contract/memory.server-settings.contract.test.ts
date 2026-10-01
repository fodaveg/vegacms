/**
 * Paridad de la sección `serverSettings` en `memory` con el contrato medido contra PocketBase
 * (`pocketbase.server-settings.contract.test.ts` corre las mismas pruebas sobre el binario real).
 * Además, lo que solo `memory` decide: cómo falla la prueba de conexión en la demo.
 */

import { describe, expect, test } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import { MEMORY_UNREACHABLE_S3_HOST } from '$lib/backend/adapters/memory/server-settings';
import { describeServerSettingsContract } from './server-settings-contract';
import { FIXTURE_ADMIN_EMAIL, FIXTURE_ADMIN_PASSWORD, kitchenSinkSeed } from './fixture';

async function makeMemoryPort(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend(kitchenSinkSeed());
	await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
	return port;
}

describeServerSettingsContract({
	name: 'memory',
	makePort: makeMemoryPort,
	readSecrets: (port) => (port as MemoryBackendPort).inspectServerSecrets()
});

describe('memory: la prueba de conexión de la demo', () => {
	test('con el almacén activado responde que sí, salvo si el servidor es unreachable.test', async () => {
		const port = await makeMemoryPort();
		const section = port.serverSettings!;
		await section.update({
			backups: {
				s3: {
					enabled: true,
					endpoint: 'https://s3.example.test',
					bucket: 'b',
					region: 'r',
					accessKey: 'k',
					secret: 's'
				}
			}
		});
		expect(await section.testS3()).toEqual({ ok: true });

		await section.update({
			backups: { s3: { endpoint: `https://${MEMORY_UNREACHABLE_S3_HOST}` } }
		});
		expect(await section.testS3()).toEqual({
			ok: false,
			message: expect.stringContaining('no such host')
		});
	});

	test('testEmail falla con el correo desactivado y responde que sí con él activado', async () => {
		const port = await makeMemoryPort();
		const section = port.serverSettings!;
		expect(await section.testEmail('a@b.test', 'verification')).toMatchObject({ ok: false });
		await section.update({ smtp: { enabled: true } });
		expect(await section.testEmail('a@b.test', 'verification')).toEqual({ ok: true });
	});

	test('con el almacén activado y sin ninguna clave secreta guardada, falta es un error de ESE campo', async () => {
		const port = await makeMemoryPort();
		await expect(
			port.serverSettings!.update({ backups: { s3: { enabled: true } } })
		).rejects.toMatchObject({
			kind: 'validation',
			fieldErrors: { 'backups.s3.secret': { code: 'validation_required' } }
		});
	});

	test('el parche es atómico: un campo inválido no deja aplicar los válidos', async () => {
		const port = await makeMemoryPort();
		const section = port.serverSettings!;
		await expect(
			section.update({ meta: { appURL: 'https://nuevo.example.test' }, backups: { cron: 'nope' } })
		).rejects.toMatchObject({ kind: 'validation' });
		expect((await section.get()).meta.appURL).toBe('http://localhost:8090');
	});
});
