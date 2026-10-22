import { beforeAll, describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { SITE_SEED_BLOG_MODULE } from '$lib/backend/site-seeding-blog';
import { resolveContentModel } from '$lib/model/resolve';
import type { ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { sendRecord } from './record-save';
import { validateTreeBeforeSave } from './tree-validation';

let type: ResolvedContentType;
beforeAll(async () => {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
	const manifest = (await port.list('vega')).items[0].values.manifest;
	type = resolveContentModel({
		types: await port.listContentTypes(),
		manifestRaw: manifest
	}).types.find((type) => type.name === 'categories')!;
});
const row = (id: string, parent: string | null): VegaRecord => ({
	id,
	type: 'categories',
	values: { parent }
});
const context = (records: VegaRecord[], id: string | null = 'a') => ({
	port: {
		list: vi.fn().mockResolvedValue({
			items: records,
			page: 1,
			perPage: 200,
			totalItems: records.length,
			totalPages: 1
		})
	},
	id,
	message: (reason: string) => reason
});

describe('guarda del árbol antes del envío común', () => {
	test('lectura proyectada una vez y validación de toda la rama antes de onSubmit', async () => {
		const ctx = context([row('a', null), row('b', 'a')]);
		const submit = vi.fn();
		await expect(
			sendRecord({
				type,
				baseline: {},
				values: { parent: 'b' },
				treeValidation: ctx,
				expectedVersion: () => undefined,
				onSubmit: submit,
				captureRedirectJob: () => null,
				syncRedirects: async () => null,
				runAfterSave: async () => [],
				commitSaved: vi.fn()
			})
		).rejects.toMatchObject({
			kind: 'validation',
			fieldErrors: { parent: { code: 'vega_tree_cycle' } }
		});
		expect(submit).not.toHaveBeenCalled();
		expect(ctx.port.list).toHaveBeenCalledTimes(1);
		expect(ctx.port.list).toHaveBeenCalledWith('categories', {
			filter: undefined,
			perPage: 200,
			fields: ['parent']
		});
	});
	test('creación contextual también rechaza un cuarto nivel', async () => {
		await expect(
			validateTreeBeforeSave(
				type,
				{ parent: 'c' },
				context([row('a', null), row('b', 'a'), row('c', 'b')], null)
			)
		).rejects.toMatchObject({ fieldErrors: { parent: { code: 'vega_tree_too-deep' } } });
	});
	test('un fallo de lectura impide escribir y conserva auth-expired para el overlay', async () => {
		const ctx = context([]);
		ctx.port.list.mockRejectedValueOnce(VegaError.network('sin conexión'));
		await expect(validateTreeBeforeSave(type, { parent: null }, ctx)).rejects.toMatchObject({
			kind: 'validation',
			fieldErrors: { parent: { code: 'vega_tree_unavailable' } }
		});
		ctx.port.list.mockRejectedValueOnce(VegaError.authExpired());
		await expect(validateTreeBeforeSave(type, { parent: null }, ctx)).rejects.toMatchObject({
			kind: 'auth-expired'
		});
	});
	test('sin contexto no se omite la guarda y con árbol válido continúa', async () => {
		await expect(validateTreeBeforeSave(type, {})).rejects.toMatchObject({ kind: 'validation' });
		await expect(
			validateTreeBeforeSave(type, { parent: null }, context([]))
		).resolves.toBeUndefined();
	});
});
