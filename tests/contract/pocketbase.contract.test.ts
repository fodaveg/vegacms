/**
 * Corre la MISMA suite de contrato (§10, Fase 2) contra un PocketBase real. Si no hay binario
 * descargado (`.pbbin/`, ver `scripts/download-pocketbase.mjs` / `pnpm test:pb`), el bloque
 * entero se salta declarándolo — nunca rompe `pnpm gate` para quien no tenga el binario.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';
import type { VegaError } from '$lib/backend';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { describeBackendContract } from './backend-contract';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import type { RunningPocketBase } from './pb-harness/server';
import { startPocketBase } from './pb-harness/server';
import { resetPocketBaseRecords, seedPocketBaseSchema } from './pb-harness/seed';
import { startCorruptingProxy } from './pb-harness/corrupt-proxy';
import { startAuthFailureProxy } from './pb-harness/auth-failure-proxy';

// La suite ejercita `subscribe()` (SSE) tal como lo haría un navegador; Node no trae
// `EventSource` global (a diferencia de un navegador de producción real), así que se
// polirrellena SOLO para este test — nunca en el adaptador de producción, que asume navegador.
globalThis.EventSource = EventSource as unknown as typeof globalThis.EventSource;

const AVAILABLE = isPocketBaseBinaryAvailable();

// PB solo permite fijar la duración del token de superuser a nivel de colección, con un
// mínimo de 10s (verificado en Fase 2). Se pinea aquí, una vez, para toda la suite: los tests
// de expiración (§10.1) esperan `authExpiryWaitMs` tras el login para darlo por vencido.
const SUPERUSER_TOKEN_DURATION_SECONDS = 10;
const AUTH_EXPIRY_WAIT_MS = (SUPERUSER_TOKEN_DURATION_SECONDS + 3) * 1000;

describe.skipIf(!AVAILABLE)('BackendPort contract — pocketbase (binario real en .pbbin/)', () => {
	let running: RunningPocketBase;
	let admin: PocketBase;

	beforeAll(async () => {
		running = await startPocketBase();
		admin = new PocketBase(running.url);
		admin.autoCancellation(false);
		await admin
			.collection('_superusers')
			.authWithPassword(running.adminEmail, running.adminPassword);
		await seedPocketBaseSchema(admin);
		// Última, a propósito: el resto de la siembra corre con la duración por defecto (86400s).
		await admin.collections.update('_superusers', {
			authToken: { duration: SUPERUSER_TOKEN_DURATION_SECONDS }
		});
	}, 30_000);

	afterAll(async () => {
		await running?.stop();
	});

	beforeEach(async () => {
		// El propio admin puede haber caducado entre tests (duration global = 10s): se
		// reautentica siempre antes de tocar datos, nunca asume que su sesión sigue viva.
		await admin
			.collection('_superusers')
			.authWithPassword(running.adminEmail, running.adminPassword);
		await resetPocketBaseRecords(admin);
	});

	// `capabilities` es una constante estática del adaptador: no hace falta (ni se puede, antes
	// de `beforeAll`) un `running.url` real para leerla — cualquier URL vale, no hay I/O aquí.
	const capabilities = createPocketBaseBackend({ url: 'http://placeholder.invalid' }).capabilities;

	describeBackendContract(() => createPocketBaseBackend({ url: running.url }), {
		name: 'pocketbase',
		capabilities,
		authExpiryWaitMs: AUTH_EXPIRY_WAIT_MS,
		numberFieldDefaultsToZero: true,
		transportFailures: {
			makeUnreachablePort: () => createPocketBaseBackend({ url: 'http://127.0.0.1:1' }),
			async makeCorruptResponsePort() {
				const proxy = await startCorruptingProxy(running.url);
				return {
					port: createPocketBaseBackend({ url: proxy.url }),
					cleanup: () => proxy.stop()
				};
			}
		}
	});
	/**
	 * Bugs de correctitud encontrados en code-review (§4.1/§5): la suite de contrato normal
	 * nunca provoca un 5xx real en `login`/`authRefresh` (PB solo rechaza con 400/401 en esos
	 * casos), así que hacía falta un proxy que se interponga entre el adaptador y el PB real
	 * para armar esos fallos a demanda.
	 */
	describe('login/restoreSession — 5xx del servidor (bug corregido: no colapsar a forbidden/limpieza)', () => {
		test('login: 5xx del servidor → backend, NUNCA forbidden (§5)', async () => {
			const proxy = await startAuthFailureProxy(running.url);
			try {
				proxy.setStatus('/auth-with-password', 500);
				const port = createPocketBaseBackend({ url: proxy.url });

				await expect(
					port.login({ email: running.adminEmail, password: running.adminPassword })
				).rejects.toMatchObject({ kind: 'backend' });
			} finally {
				await proxy.stop();
			}
		});

		test('restoreSession: 5xx en authRefresh → backend, NO limpia el token persistido (§4.1)', async () => {
			const proxy = await startAuthFailureProxy(running.url);
			try {
				const port = createPocketBaseBackend({ url: proxy.url });
				await port.login({ email: running.adminEmail, password: running.adminPassword });

				proxy.setStatus('/auth-refresh', 500);
				await expect(port.restoreSession()).rejects.toMatchObject({ kind: 'backend' });

				// Prueba de "no limpió el token": si `restoreSession` lo hubiese limpiado (bug
				// anterior: cualquier fallo no-network colapsaba a "inválido, limpiar"), esta
				// segunda llamada —con el 5xx ya desarmado, passthrough real hacia PB— tendría
				// que devolver `null` (no hay token que restaurar). En vez de eso, restaura de
				// verdad porque el token seguía persistido y sigue siendo válido.
				proxy.setStatus('/auth-refresh', null);
				const restored = await port.restoreSession();
				expect(restored?.user.email).toBe(running.adminEmail);
			} finally {
				await proxy.stop();
			}
		});
	});

	/**
	 * L7 (dedup del evento `expired`): el test de §10.1 en `backend-contract.ts` solo cubre el
	 * camino PROACTIVO (TTL/`exp` local, vía `checkSessionAlive` antes de tocar red), que NUNCA
	 * pasaba por el `catch` de `guarded()` donde vivía la carrera real. Este test fuerza el
	 * camino REACTIVO: el servidor responde 403 en endpoints de registros mientras el token
	 * sigue siendo localmente válido (invalidación que el chequeo proactivo no puede anticipar).
	 */
	describe('expiración REACTIVA concurrente (bug corregido: carrera al leer hasSession en el catch)', () => {
		test('2 operaciones en vuelo con 403 reactivo → AMBAS auth-expired, evento expired una sola vez', async () => {
			const proxy = await startAuthFailureProxy(running.url);
			try {
				const port = createPocketBaseBackend({ url: proxy.url });
				await port.login({ email: running.adminEmail, password: running.adminPassword });

				// A partir de aquí, cualquier petición a los endpoints de registros de `category`
				// recibe 403 — el token sigue siendo válido localmente (`pb.authStore.isValid`),
				// así que ninguna operación lo detecta de antemano: ambas llegan al `catch` de
				// `guarded()` casi a la vez.
				proxy.setStatus('/collections/category/records', 403);

				const reasons: string[] = [];
				port.onAuthChange((_s, reason) => reasons.push(reason));

				const [first, second] = await Promise.allSettled([
					port.list('category'),
					port.get('category', 'cualquiera')
				]);

				expect(first.status).toBe('rejected');
				expect(second.status).toBe('rejected');
				if (first.status === 'rejected') {
					expect((first.reason as VegaError).kind).toBe('auth-expired');
				}
				if (second.status === 'rejected') {
					expect((second.reason as VegaError).kind).toBe('auth-expired');
				}
				expect(reasons.filter((r) => r === 'expired')).toHaveLength(1);
				expect(port.currentSession()).toBeNull();
			} finally {
				await proxy.stop();
			}
		});
	});
});
