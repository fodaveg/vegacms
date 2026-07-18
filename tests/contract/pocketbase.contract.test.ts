/**
 * Corre la MISMA suite de contrato (§10, Fase 2) contra un PocketBase real. Si no hay binario
 * descargado (`.pbbin/`, ver `scripts/download-pocketbase.mjs` / `pnpm test:pb`), el bloque
 * entero se salta declarándolo — nunca rompe `pnpm gate` para quien no tenga el binario.
 */

import { afterAll, beforeAll, beforeEach, describe } from 'vitest';
import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { describeBackendContract } from './backend-contract';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import type { RunningPocketBase } from './pb-harness/server';
import { startPocketBase } from './pb-harness/server';
import { resetPocketBaseRecords, seedPocketBaseSchema } from './pb-harness/seed';
import { startCorruptingProxy } from './pb-harness/corrupt-proxy';

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
});
