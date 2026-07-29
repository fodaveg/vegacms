import { describe, expect, test, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import type { CollectionSpec } from '../../collections';
import { addFieldsOnPocketBase, ensureCollectionsOnPocketBase } from './collections';

function pocketBaseStub(
	snapshots: Array<{
		fields: Array<{ id: string; name: string; type: string }>;
		indexes: string[];
	}>
): { pb: PocketBase; update: ReturnType<typeof vi.fn> } {
	const update = vi.fn().mockResolvedValue({});
	const getOne = vi.fn().mockImplementation(async () => {
		const next = snapshots.shift();
		if (!next) throw new Error('snapshot PocketBase no previsto');
		return { name: 'pages', type: 'base', ...next };
	});
	return {
		pb: { collections: { getOne, update } } as unknown as PocketBase,
		update
	};
}

describe('addFieldsOnPocketBase — campo text unique', () => {
	test('envía campo e índice juntos en un único PATCH', async () => {
		const existing = {
			fields: [{ id: 'field_title', name: 'title', type: 'text' }],
			indexes: ['CREATE INDEX `idx_pages_title` ON `pages` (`title`)']
		};
		const { pb, update } = pocketBaseStub([structuredClone(existing), structuredClone(existing)]);

		await expect(
			addFieldsOnPocketBase(pb, 'pages', [{ name: 'path', type: 'text', unique: true }])
		).resolves.toEqual({ added: ['path'], skipped: [] });

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith('pages', {
			fields: [existing.fields[0], { name: 'path', type: 'text', required: false, max: 0 }],
			indexes: [
				existing.indexes[0],
				'CREATE UNIQUE INDEX `idx_vega_unique_5_pages_4_path` ON `pages` (`path`)'
			]
		});
	});

	test('si indexes cambia entre lecturas, falla sin PATCH y no pierde el índice concurrente', async () => {
		const initial = {
			fields: [{ id: 'field_title', name: 'title', type: 'text' }],
			indexes: ['CREATE INDEX `idx_pages_title` ON `pages` (`title`)']
		};
		const concurrent = {
			fields: structuredClone(initial.fields),
			indexes: [...initial.indexes, 'CREATE INDEX `idx_pages_concurrent` ON `pages` (`title`)']
		};
		const { pb, update } = pocketBaseStub([initial, concurrent]);

		await expect(
			addFieldsOnPocketBase(pb, 'pages', [{ name: 'path', type: 'text', unique: true }])
		).rejects.toMatchObject({ kind: 'backend' });
		expect(update).not.toHaveBeenCalled();
	});
});

describe('ensureCollectionsOnPocketBase', () => {
	test('rechaza una regla exclusiva de auth sobre base antes de llamar al SDK', async () => {
		let networkCalls = 0;
		const pb = {
			collections: {
				async getOne() {
					networkCalls += 1;
					throw new Error('no debería tocar red');
				},
				async create() {
					networkCalls += 1;
				}
			}
		} as unknown as PocketBase;
		const invalid = {
			name: 'posts',
			type: 'base',
			fields: [],
			authRule: ''
		} as unknown as CollectionSpec;

		await expect(ensureCollectionsOnPocketBase(pb, [invalid])).rejects.toMatchObject({
			kind: 'validation',
			fieldErrors: {
				posts: { code: 'vega_auth_rule_requires_auth_collection' }
			}
		});
		expect(networkCalls).toBe(0);
	});
});
