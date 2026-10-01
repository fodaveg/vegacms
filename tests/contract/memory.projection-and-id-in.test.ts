/**
 * Paridad en `memory` de las lecturas con proyección e `id in`
 * (`pocketbase.projection-and-id-in.test.ts` corre las mismas pruebas contra PocketBase real).
 */

import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { describeProjectionAndIdInContract } from './projection-and-id-in-contract';
import { FIXTURE_ADMIN_EMAIL, FIXTURE_ADMIN_PASSWORD, kitchenSinkSeed } from './fixture';

describeProjectionAndIdInContract({
	name: 'memory',
	async makePort() {
		const port = createMemoryBackend(kitchenSinkSeed());
		await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		return port;
	}
});
