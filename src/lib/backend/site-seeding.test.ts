import { describe, expect, test } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import type { BackendPort } from './port';
import {
	SITE_SEED_CANONICAL_PAGE_PATH,
	SITE_SEED_MANIFEST_READ_RULE,
	SiteSeedDivergenceError,
	seedSiteProject
} from './site-seeding';
import { ensureMediaCollection } from '$lib/media/media-collection';

async function authedMemory(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

async function logicalSnapshot(port: MemoryBackendPort) {
	const types = await port.listContentTypes();
	const records: Record<string, unknown> = {};
	for (const name of ['pages', 'blocks', 'vega']) {
		if (types.some((type) => type.name === name)) {
			const page = await port.list(name, { perPage: 200 });
			records[name] = {
				totalItems: page.totalItems,
				items: page.items.map((record) => ({ id: record.id, values: record.values }))
			};
		}
	}
	return {
		types,
		collections: Object.fromEntries(
			['vega_editors', 'pages', 'vega_media', 'blocks', 'vega'].map((name) => [
				name,
				port.inspectCollection(name)
			])
		),
		records
	};
}

describe('seedSiteProject', () => {
	test('deja un proyecto completo y la segunda pasada no cambia el servidor', async () => {
		const port = await authedMemory();

		await expect(seedSiteProject(port)).resolves.toMatchObject({
			createdCollections: ['vega_editors', 'pages', 'vega_media', 'blocks', 'vega'],
			createdRecords: ['manifest', 'page:/']
		});

		const types = await port.listContentTypes();
		const blocks = types.find((type) => type.name === 'blocks')!;
		expect(blocks.fields.find((field) => field.name === 'image')).toMatchObject({
			type: 'relation',
			target: 'vega_media',
			multiple: false,
			required: false
		});
		expect(blocks.fields.find((field) => field.name === 'images')).toMatchObject({
			type: 'relation',
			target: 'vega_media',
			multiple: true,
			required: false
		});

		const manifestPage = await port.list('vega', { perPage: 2 });
		const manifest = manifestPage.items[0]?.values.manifest as Record<string, unknown>;
		expect(manifest.schemaVersion).toBe(1);
		expect((manifest.site as Record<string, unknown>).name).toBe('Aguja');
		expect(Object.keys(manifest.blockTypes as Record<string, unknown>)).toEqual([
			'hero',
			'richtext',
			'image',
			'gallery',
			'cta',
			'divider'
		]);

		const firstPage = await port.list('pages', {
			perPage: 2,
			filter: {
				kind: 'cond',
				field: 'path',
				op: 'eq',
				value: SITE_SEED_CANONICAL_PAGE_PATH
			}
		});
		expect(firstPage.totalItems).toBe(1);
		expect(firstPage.items[0]?.values).toMatchObject({
			title: 'Inicio',
			path: '/',
			layout: 'default',
			status: 'draft'
		});

		expect(port.inspectCollection('vega_editors')).toMatchObject({ type: 'auth' });
		expect(port.inspectCollection('vega')?.rules).toMatchObject({
			listRule: SITE_SEED_MANIFEST_READ_RULE,
			viewRule: SITE_SEED_MANIFEST_READ_RULE
		});

		const before = await logicalSnapshot(port);
		await expect(seedSiteProject(port)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: []
		});
		expect(await logicalSnapshot(port)).toEqual(before);
	});

	test('completa image e images como piezas ausentes de blocks existente', async () => {
		const port = await authedMemory();
		await port.ensureCollections([
			{
				name: 'pages',
				fields: [
					{ name: 'title', type: 'text', required: true, max: 200 },
					{ name: 'path', type: 'text', required: true, max: 200, unique: true },
					{ name: 'layout', type: 'text', max: 64 },
					{
						name: 'status',
						type: 'select',
						options: ['draft', 'published'],
						multiple: false
					}
				]
			}
		]);
		await ensureMediaCollection(port);
		await port.ensureCollections([
			{
				name: 'blocks',
				fields: [
					{
						name: 'parent',
						type: 'relation',
						target: 'pages',
						required: true,
						multiple: false,
						cascadeDelete: true
					},
					{ name: 'order', type: 'number' },
					{ name: 'type', type: 'text', required: true, max: 64 },
					{ name: 'data', type: 'json' }
				]
			}
		]);

		const result = await seedSiteProject(port);
		expect(result.addedFields.blocks).toEqual(['image', 'images']);
		const blocks = (await port.listContentTypes()).find((type) => type.name === 'blocks')!;
		expect(blocks.fields.map((field) => field.name)).toEqual([
			'parent',
			'order',
			'type',
			'data',
			'image',
			'images'
		]);
	});

	test('una forma incompatible aborta antes de crear incluso vega_editors', async () => {
		const port = await authedMemory();
		await port.ensureCollections([
			{
				name: 'pages',
				fields: [{ name: 'title', type: 'number' }]
			}
		]);
		const before = await logicalSnapshot(port);

		await expect(seedSiteProject(port)).rejects.toMatchObject({
			name: 'SiteSeedDivergenceError',
			divergences: [
				expect.objectContaining({
					piece: 'campo "pages.title"',
					actual: expect.stringContaining('"type":"number"'),
					expected: expect.stringContaining('"type":"text"')
				})
			]
		});
		expect(await logicalSnapshot(port)).toEqual(before);
		expect(port.inspectCollection('vega_editors')).toBeNull();
	});

	test('un manifiesto humano distinto se conserva y aborta antes de otras escrituras', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const manifestPage = await port.list('vega', { perPage: 1 });
		const manifestRecord = manifestPage.items[0]!;
		const humanManifest = {
			schemaVersion: 1,
			site: { name: 'Proyecto humano' },
			collections: {},
			blockTypes: {}
		};
		await port.update('vega', manifestRecord.id, { manifest: humanManifest });
		const before = await logicalSnapshot(port);

		await expect(seedSiteProject(port)).rejects.toBeInstanceOf(SiteSeedDivergenceError);
		expect(await logicalSnapshot(port)).toEqual(before);
		const after = await port.get('vega', manifestRecord.id);
		expect(after.values.manifest).toEqual(humanManifest);
	});

	test('una página canónica ya editada se salta sin duplicarla ni pisarla', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const page = await canonicalPage(port);
		await port.update('pages', page.id, { title: 'Portada humana', layout: 'campaign' });

		await seedSiteProject(port);

		const after = await canonicalPage(port);
		expect(after.id).toBe(page.id);
		expect(after.values).toMatchObject({ title: 'Portada humana', layout: 'campaign' });
		const all = await port.list('pages', { perPage: 10 });
		expect(all.totalItems).toBe(1);
	});

	test('la colisión pages=auth falla con nombre, tipo hallado y tipo esperado', async () => {
		const port = await authedMemory();
		await port.ensureCollections([{ name: 'pages', type: 'auth', fields: [] }]);

		await expect(seedSiteProject(port)).rejects.toThrow(
			'La colección "pages" ya existe como auth, no como base'
		);
		expect(port.inspectCollection('vega_editors')).toMatchObject({ type: 'auth' });
		expect(port.inspectCollection('pages')).toMatchObject({ type: 'auth' });
	});
});

async function canonicalPage(port: BackendPort) {
	const page = await port.list('pages', {
		perPage: 2,
		filter: {
			kind: 'cond',
			field: 'path',
			op: 'eq',
			value: SITE_SEED_CANONICAL_PAGE_PATH
		}
	});
	expect(page.totalItems).toBe(1);
	return page.items[0]!;
}
