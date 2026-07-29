import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import type { BackendPort } from './port';
import type { AccessLevel, ContentType } from './types';
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

async function authedMemoryWithTypes(contentTypes: ContentType[]): Promise<MemoryBackendPort> {
	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-password' }],
		contentTypes,
		records: {}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

function emptyType(name: string, list: AccessLevel): ContentType {
	return {
		name,
		readonly: false,
		fields: [],
		access: {
			list,
			view: list,
			create: 'conditional',
			update: 'conditional',
			delete: 'conditional'
		}
	};
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

function withActualField(
	port: BackendPort,
	collectionName: string,
	fieldName: string,
	patch: Record<string, unknown>
): BackendPort {
	return {
		...port,
		async listContentTypes() {
			return (await port.listContentTypes()).map((type) =>
				type.name === collectionName
					? {
							...type,
							fields: type.fields.map((field) =>
								field.name === fieldName ? ({ ...field, ...patch } as typeof field) : field
							)
						}
					: type
			);
		}
	};
}

function watchSeedWrites(port: BackendPort) {
	return [
		vi.spyOn(port, 'ensureCollections'),
		vi.spyOn(port, 'addCollectionFields'),
		vi.spyOn(port, 'create'),
		vi.spyOn(port, 'update'),
		vi.spyOn(port, 'delete')
	];
}

function expectNoSeedWrites(spies: ReturnType<typeof watchSeedWrites>) {
	for (const spy of spies) expect(spy).not.toHaveBeenCalled();
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

	test('pages.status sin una opción esperada diverge y aborta sin escribir', async () => {
		const port = await authedMemory();
		await port.ensureCollections([
			{
				name: 'pages',
				fields: [
					{
						name: 'status',
						type: 'select',
						options: ['draft', 'archived'],
						multiple: false
					}
				]
			}
		]);
		const writes = watchSeedWrites(port);

		await expect(seedSiteProject(port)).rejects.toMatchObject({
			name: 'SiteSeedDivergenceError',
			divergences: [
				expect.objectContaining({
					piece: 'campo "pages.status"',
					actual: expect.stringContaining('"options":["draft","archived"]'),
					expected: expect.stringContaining('"options":["draft","published"]')
				})
			]
		});
		expectNoSeedWrites(writes);
		expect(port.inspectCollection('vega_editors')).toBeNull();
	});

	test('pages.status con un superconjunto desordenado de opciones sigue siendo compatible', async () => {
		const port = await authedMemory();
		await port.ensureCollections([
			{
				name: 'pages',
				fields: [
					{
						name: 'status',
						type: 'select',
						options: ['archived', 'published', 'draft'],
						multiple: false
					}
				]
			}
		]);

		await expect(seedSiteProject(port)).resolves.toMatchObject({
			addedFields: { pages: ['title', 'path', 'layout'] }
		});
		const pages = (await port.listContentTypes()).find((type) => type.name === 'pages')!;
		expect(pages.fields.find((field) => field.name === 'status')).toMatchObject({
			options: ['archived', 'published', 'draft'],
			maxSelect: 1
		});
	});

	test('pages.status con una opción repetida diverge y aborta sin escribir', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const writes = watchSeedWrites(port);
		const actualPort = withActualField(port, 'pages', 'status', {
			options: ['draft', 'published', 'published']
		});

		await expect(seedSiteProject(actualPort)).rejects.toMatchObject({
			name: 'SiteSeedDivergenceError',
			divergences: [
				expect.objectContaining({
					piece: 'campo "pages.status"',
					actual: expect.stringContaining('"options":["draft","published","published"]')
				})
			]
		});
		expectNoSeedWrites(writes);
	});

	// Regresión de la revisión fría del lote `endurecimiento-pre-despliegue`: comparar `maxSelect`
	// en un `select` SIMPLE abortaba un sembrado legítimo. PocketBase trata `maxSelect` 0, 1 y
	// ausente como el mismo single, y el adaptador colapsa el 0 a `undefined`
	// (`adapters/pocketbase/schema.ts:180-189`), así que una colección creada a mano, por una
	// versión anterior o migrada desde otra herramienta llegaba con `null` frente al `1` que
	// produce la creación. El límite solo es información en un `select` múltiple.
	//
	// Ojo: la rama MÚLTIPLE no tiene test conductual porque hoy no se puede construir su escenario.
	// El único `select` que siembra Vega es `pages.status`, que es simple, y el manifiesto del
	// starter no declara ninguno en sus bloques, así que no hay forma de que el lado ESPERADO sea
	// múltiple. Se deja escrito antes que fabricar un test que no ejerza lo que dice ejercer.
	test('pages.status con maxSelect ausente (single crudo de PocketBase) SIGUE siendo compatible', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const actualPort = withActualField(port, 'pages', 'status', { maxSelect: undefined });

		// Aquí NO vale `expectNoSeedWrites`: el camino compatible sí llama a `ensureCollections`,
		// que es idempotente y devuelve `skipped`. Lo que se afirma es que no CREÓ nada.
		await expect(seedSiteProject(actualPort)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: []
		});
	});

	test('options y maxSelect ajenos en un campo no select no cambian el veredicto', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const actualPort = withActualField(port, 'pages', 'title', {
			options: ['irrelevant'],
			maxSelect: 37
		});

		await expect(seedSiteProject(actualPort)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: []
		});
	});

	test('pages preexistente con lectura denegada y blocks ausente aborta sin escribir', async () => {
		const port = await authedMemoryWithTypes([emptyType('pages', 'denied')]);
		const before = await logicalSnapshot(port);

		await expect(seedSiteProject(port)).rejects.toThrow(
			'lectura de "pages" denegada; "blocks" quedaría imposible de listar'
		);

		expect(await logicalSnapshot(port)).toEqual(before);
		expect(port.inspectCollection('blocks')).toBeNull();
		expect(port.inspectCollection('vega_editors')).toBeNull();
	});

	test.each(['allowed', 'conditional'] as const)(
		'pages preexistente con lectura %s permite crear blocks',
		async (listAccess) => {
			const port = await authedMemoryWithTypes([emptyType('pages', listAccess)]);

			await expect(seedSiteProject(port)).resolves.toMatchObject({
				createdCollections: expect.arrayContaining(['vega_editors', 'vega_media', 'blocks', 'vega'])
			});
			expect(port.inspectCollection('blocks')).not.toBeNull();
		}
	);

	test('blocks preexistente y pages ausente no dispara un aborto simétrico', async () => {
		const port = await authedMemoryWithTypes([emptyType('blocks', 'denied')]);

		await expect(seedSiteProject(port)).resolves.toMatchObject({
			createdCollections: expect.arrayContaining(['pages'])
		});
		expect(port.inspectCollection('pages')).not.toBeNull();
		expect(port.inspectCollection('blocks')).not.toBeNull();
	});

	test('pages preexistente conserva literalmente sus cinco reglas', async () => {
		const port = await authedMemory();
		await port.ensureCollections([
			{
				name: 'pages',
				listRule: 'legacyList = true',
				viewRule: '',
				createRule: null,
				updateRule: '@request.auth.id != ""',
				deleteRule: 'legacyDelete = true',
				fields: []
			}
		]);
		const before = port.inspectCollection('pages')!.rules;

		await seedSiteProject(port);

		expect(port.inspectCollection('pages')!.rules).toEqual(before);
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
