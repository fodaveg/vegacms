/**
 * Corre la suite de contrato (§10) contra `createMemoryBackend`. En Fase 2, un fichero
 * hermano (`pocketbase.contract.test.ts`) llamará a `describeBackendContract` con un
 * `makePort` que arranque/sembre un PocketBase real — sin tocar `backend-contract.ts`.
 */

import { describe, expect, test } from 'vitest';
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

/**
 * Detalles de implementación de `memory` que NO son parte del contrato genérico del puerto
 * (por eso no viven en `describeBackendContract`, que debe poder correr sin cambios contra
 * PocketBase real en Fase 2): aislamiento entre instancias, no-aliasing y blindaje del `pattern`.
 */
describe('memory: detalles de implementación', () => {
	test('cada instancia aísla su propio estado (ids únicos, sin fuga de registros entre backends)', async () => {
		const portA = createMemoryBackend(kitchenSinkSeed());
		const portB = createMemoryBackend(kitchenSinkSeed());

		const a1 = await portA.create('kitchen_sink', { title: 'A1' });
		const b1 = await portB.create('kitchen_sink', { title: 'B1' });
		const a2 = await portA.create('kitchen_sink', { title: 'A2' });

		expect(new Set([a1.id, a2.id, b1.id]).size).toBe(3);
		await expect(portB.get('kitchen_sink', a1.id)).rejects.toMatchObject({ kind: 'not-found' });
	});

	test('mutar el valor devuelto por create() no corrompe el almacén (json/select-multi/relation-multi)', async () => {
		const port = createMemoryBackend(kitchenSinkSeed());
		const created = await port.create('kitchen_sink', {
			title: 'aliasing',
			tags: ['a'],
			categories: ['cat-alpha'],
			metadata: { count: 1 }
		});

		// Mutación deliberada de lo que devolvió create(): si `normalizeFieldValue` no clona,
		// esto corrompe el registro "persistido" en el Map interno del adaptador.
		(created.values.tags as string[]).push('mutado');
		(created.values.categories as string[]).push('cat-beta');
		(created.values.metadata as Record<string, unknown>).count = 999;

		const fetched = await port.get('kitchen_sink', created.id);
		expect(fetched.values.tags).toEqual(['a']);
		expect(fetched.values.categories).toEqual(['cat-alpha']);
		expect(fetched.values.metadata).toEqual({ count: 1 });
	});

	test('un pattern de esquema inválido no revienta con SyntaxError crudo (degrada, ley L2/L11)', async () => {
		const port = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'x' }],
			contentTypes: [
				{
					name: 'broken_pattern',
					readonly: false,
					fields: [
						{
							name: 'code',
							type: 'text',
							subtype: 'plain',
							required: false,
							readonly: false,
							presentable: false,
							hidden: false,
							unique: false,
							pattern: '(unclosed' // regex inválida a propósito
						}
					]
				}
			],
			records: { broken_pattern: [] }
		});

		// Antes de la corrección, esto lanzaba un SyntaxError nativo (no un VegaError): violaba
		// L2 ("toda promesa del puerto rechaza con VegaError y solo con VegaError").
		await expect(port.create('broken_pattern', { code: 'cualquier-cosa' })).resolves.toMatchObject({
			values: { code: 'cualquier-cosa' }
		});
	});
});
