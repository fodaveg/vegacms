/**
 * Las lecturas con proyección (`Query.fields`) e `id in [...]` del lote «menos peticiones»,
 * medidas contra un PocketBase REAL (`projection-and-id-in-contract.ts`; `memory` corre las
 * mismas en `memory.projection-and-id-in.test.ts`). Sin binario (`pnpm pb:download`) el bloque
 * entero se salta declarándolo.
 */

import { afterAll, beforeAll, beforeEach, describe } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import type { RunningPocketBase } from './pb-harness/server';
import { startPocketBase } from './pb-harness/server';
import { resetPocketBaseRecords, seedPocketBaseSchema } from './pb-harness/seed';
import { describeProjectionAndIdInContract } from './projection-and-id-in-contract';

const AVAILABLE = isPocketBaseBinaryAvailable();

describe.skipIf(!AVAILABLE)('proyección e id in — pocketbase (binario real en .pbbin/)', () => {
	let running: RunningPocketBase;
	let admin: SiteSeedingAdmin;

	beforeAll(async () => {
		running = await startPocketBase();
		admin = await createSiteSeedingAdmin(running);
		await seedPocketBaseSchema(admin);
	}, 30_000);

	afterAll(async () => {
		await running?.stop();
	});

	beforeEach(async () => {
		await resetPocketBaseRecords(admin);
	});

	describeProjectionAndIdInContract({
		name: 'pocketbase',
		async makePort() {
			const port = createPocketBaseBackend({ url: running.url });
			await port.login({ email: running.adminEmail, password: running.adminPassword });
			return port;
		}
	});
});
