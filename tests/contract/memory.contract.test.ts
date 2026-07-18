/**
 * Corre la suite de contrato (§10) contra `createMemoryBackend`. En Fase 2, un fichero
 * hermano (`pocketbase.contract.test.ts`) llamará a `describeBackendContract` con un
 * `makePort` que arranque/sembre un PocketBase real — sin tocar `backend-contract.ts`.
 */

import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { describeBackendContract } from './backend-contract';
import { kitchenSinkSeed } from './fixture';

describeBackendContract(
	(overrides) => createMemoryBackend(kitchenSinkSeed({ sessionTtlMs: overrides?.sessionTtlMs })),
	{
		name: 'memory',
		capabilities: createMemoryBackend().capabilities
	}
);
