import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import type { CollectionFieldSpec } from './collections';
import type { BackendPort } from './port';
import type { AccessLevel, ContentType, Field, JsonValue } from './types';
import {
	actualFieldShape,
	expectedFieldShape,
	sameShape,
	SITE_SEED_BLOCKS_READ_RULE,
	SITE_SEED_CANONICAL_PAGE_PATH,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_MANIFEST_READ_RULE,
	SITE_SEED_PAGES_READ_RULE,
	SITE_SEED_REDIRECTS_READ_RULE,
	SiteSeedDivergenceError,
	seedSiteProject
} from './site-seeding';
import starterManifest from './site-seeding-manifest.json';
import { previousStarterManifest, seedLikePrevious1bda988 } from './site-seeding-previous.fixture';
import {
	ensureMediaCollection,
	VEGA_MEDIA_EDITOR_ACCESS_RULE,
	VEGA_MEDIA_VIEW_RULE
} from '$lib/media/media-collection';
import { resolveContentModel } from '$lib/model/resolve';
import { validateManifestStrict } from '$lib/model/validate';

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
	for (const name of ['pages', 'blocks', 'redirects', 'vega']) {
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
			['vega_editors', 'pages', 'vega_media', 'blocks', 'redirects', 'vega'].map((name) => [
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
			createdCollections: ['vega_editors', 'vega_media', 'pages', 'blocks', 'redirects', 'vega'],
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
		expect(port.inspectCollection('pages')?.rules).toEqual({
			listRule: SITE_SEED_PAGES_READ_RULE,
			viewRule: SITE_SEED_PAGES_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(port.inspectCollection('blocks')?.rules).toEqual({
			listRule: SITE_SEED_BLOCKS_READ_RULE,
			viewRule: SITE_SEED_BLOCKS_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(port.inspectCollection('vega_media')?.rules).toEqual({
			listRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
			viewRule: VEGA_MEDIA_VIEW_RULE,
			createRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
			updateRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
			deleteRule: VEGA_MEDIA_EDITOR_ACCESS_RULE
		});

		const pages = types.find((type) => type.name === 'pages')!;
		expect(pages.fields.find((field) => field.name === 'description')).toMatchObject({
			type: 'text',
			required: false
		});
		expect(pages.fields.find((field) => field.name === 'socialImage')).toMatchObject({
			type: 'relation',
			target: 'vega_media',
			multiple: false,
			required: false
		});
		expect(pages.fields.find((field) => field.name === 'noindex')).toMatchObject({
			type: 'bool',
			required: false
		});
		const redirects = types.find((type) => type.name === 'redirects')!;
		expect(redirects.fields.map((field) => field.name)).toEqual(['from', 'to', 'code']);
		expect(redirects.fields.find((field) => field.name === 'code')).toMatchObject({
			type: 'select',
			options: ['301', '308'],
			multiple: false,
			required: true
		});
		expect(port.inspectCollection('redirects')?.rules).toEqual({
			listRule: SITE_SEED_REDIRECTS_READ_RULE,
			viewRule: SITE_SEED_REDIRECTS_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});

		const before = await logicalSnapshot(port);
		await expect(seedSiteProject(port)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
		expect(await logicalSnapshot(port)).toEqual(before);
	});

	test('el formulario resuelve SEO y redirecciones con etiquetas y ayudas, sin avisos', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		expect(validateManifestStrict(starterManifest as JsonValue)).toEqual({ ok: true });

		const model = resolveContentModel({
			types: await port.listContentTypes(),
			manifestRaw: starterManifest as JsonValue
		});

		expect(model.warnings).toEqual([]);
		const pages = model.types.find((type) => type.name === 'pages')!;
		const seoFields = pages.fields.filter((field) => field.group === 'SEO');
		expect(seoFields.map((field) => field.name)).toEqual(['description', 'socialImage', 'noindex']);
		for (const field of seoFields) {
			expect(field.label, field.name).not.toBe(field.name);
			expect(field.help, field.name).toEqual(expect.any(String));
		}
		expect(pages.fieldGroups).toContainEqual({ name: 'SEO', columns: 1, placement: 'aside' });

		const redirects = model.types.find((type) => type.name === 'redirects')!;
		expect(redirects.hidden).toBe(false);
		expect(redirects.label).toBe('Redirecciones');
		for (const field of redirects.fields) {
			expect(field.label, field.name).not.toBe(field.name);
			expect(field.help, field.name).toEqual(expect.any(String));
		}
	});

	test('un proyecto sembrado con la versión anterior recibe SEO, redirects y el manifiesto nuevo sin perder datos', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		const page = await canonicalPage(port);
		await port.update('pages', page.id, { title: 'Portada humana', status: 'published' });
		const block = await port.create('blocks', {
			parent: page.id,
			order: 1,
			type: 'richtext',
			data: { heading: 'Hola' }
		});

		const result = await seedSiteProject(port);

		expect(result).toEqual({
			createdCollections: ['redirects'],
			addedFields: {
				vega_media: ['focal'],
				pages: ['description', 'socialImage', 'noindex']
			},
			createdRecords: [],
			upgradedRecords: ['manifest']
		});
		const after = await canonicalPage(port);
		expect(after.id).toBe(page.id);
		expect(after.values).toMatchObject({ title: 'Portada humana', status: 'published' });
		expect((await port.get('blocks', block.id)).values).toMatchObject({
			parent: page.id,
			data: { heading: 'Hola' }
		});
		const manifests = await port.list('vega', { perPage: 5 });
		expect(manifests.totalItems).toBe(1);
		expect(manifests.items[0]?.values.manifest).toEqual(starterManifest);

		// Y la pasada siguiente ya no tiene nada que hacer.
		await expect(seedSiteProject(port)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
	});

	test('un manifiesto anterior EDITADO no se actualiza: aborta como cualquier manifiesto humano', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		const manifestRecord = (await port.list('vega', { perPage: 1 })).items[0]!;
		const edited = {
			...(previousStarterManifest as Record<string, unknown>),
			site: { name: 'Mi taller' }
		};
		await port.update('vega', manifestRecord.id, { manifest: edited as JsonValue });
		const writes = watchSeedWrites(port);

		await expect(seedSiteProject(port)).rejects.toBeInstanceOf(SiteSeedDivergenceError);
		expectNoSeedWrites(writes);
		expect((await port.get('vega', manifestRecord.id)).values.manifest).toEqual(edited);
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
			addedFields: {
				pages: ['title', 'path', 'layout', 'description', 'socialImage', 'noindex']
			}
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
			createdRecords: [],
			upgradedRecords: []
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
			createdRecords: [],
			upgradedRecords: []
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

/** Campo `select` real (`Field`, lo que devuelve el puerto) con los defaults de `FieldBase` que no
 *  varían entre los casos de abajo — solo `multiple`/`options`/`maxSelect` cambian por test. */
function actualSelectField(opts: {
	options: string[];
	multiple: boolean;
	maxSelect?: number;
}): Field {
	return {
		name: 'tags',
		type: 'select',
		options: opts.options,
		multiple: opts.multiple,
		maxSelect: opts.maxSelect,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

function expectedSelectSpec(opts: { options: string[]; multiple: boolean }): CollectionFieldSpec {
	return { name: 'tags', type: 'select', options: opts.options, multiple: opts.multiple };
}

describe('expectedFieldShape/actualFieldShape/sameShape: select MÚLTIPLE', () => {
	/**
	 * `seedSiteProject` nunca alcanza esta rama en la suite de arriba: su único `select`
	 * (`pages.status`) es SIEMPRE simple. `multiple` compila a `maxSelect: 99`
	 * (`collections.ts`, comentario de `CollectionFieldSpec['relation'].multiple`) y
	 * `actualFieldShape` solo compara `maxSelect` cuando el campo es un `select` múltiple (ver su
	 * cabecera) — exactamente lo que estos tests ejercitan.
	 */

	test('mismo select múltiple (mismas opciones, maxSelect=99 real) → misma forma', () => {
		const expected = expectedFieldShape(
			expectedSelectSpec({ options: ['a', 'b'], multiple: true })
		);
		const actual = actualFieldShape(
			actualSelectField({ options: ['a', 'b'], multiple: true, maxSelect: 99 })
		);
		expect(sameShape(expected, actual)).toBe(true);
	});

	test('múltiple con maxSelect real distinto de 99 → forma distinta (cardinalidad no coincide)', () => {
		const expected = expectedFieldShape(
			expectedSelectSpec({ options: ['a', 'b'], multiple: true })
		);
		// Un `select` creado a mano en PocketBase con `multiple: true` pero un límite propio
		// (p.ej. 5): mismo `multiple`, mismas opciones, pero OTRA cardinalidad — sí debe divergir
		// (ver el comentario de `actualFieldShape`: "dos límites distintos son cardinalidades
		// distintas").
		const actual = actualFieldShape(
			actualSelectField({ options: ['a', 'b'], multiple: true, maxSelect: 5 })
		);
		expect(sameShape(expected, actual)).toBe(false);
	});

	test('múltiple vs simple (mismas opciones) → forma distinta', () => {
		const expectedMultiple = expectedFieldShape(
			expectedSelectSpec({ options: ['a', 'b'], multiple: true })
		);
		const actualSimple = actualFieldShape(
			actualSelectField({ options: ['a', 'b'], multiple: false, maxSelect: 1 })
		);
		expect(sameShape(expectedMultiple, actualSimple)).toBe(false);

		const expectedSimple = expectedFieldShape(
			expectedSelectSpec({ options: ['a', 'b'], multiple: false })
		);
		const actualMultiple = actualFieldShape(
			actualSelectField({ options: ['a', 'b'], multiple: true, maxSelect: 99 })
		);
		expect(sameShape(expectedSimple, actualMultiple)).toBe(false);
	});

	test('múltiple con opciones distintas: actual SUPERCONJUNTO del esperado → sigue siendo compatible', () => {
		// Mismo criterio que el single de `site-seeding.test.ts` ("superconjunto desordenado de
		// opciones sigue siendo compatible"), documentado aquí para la rama múltiple: opciones EXTRA
		// en el servidor no son una divergencia, solo faltar una esperada lo es (`sameSelectOptions`).
		const expected = expectedFieldShape(
			expectedSelectSpec({ options: ['a', 'b'], multiple: true })
		);
		const actual = actualFieldShape(
			actualSelectField({ options: ['b', 'a', 'c'], multiple: true, maxSelect: 99 })
		);
		expect(sameShape(expected, actual)).toBe(true);
	});

	test('múltiple con una opción esperada AUSENTE en el actual → forma distinta', () => {
		const expected = expectedFieldShape(
			expectedSelectSpec({ options: ['a', 'b'], multiple: true })
		);
		const actual = actualFieldShape(
			actualSelectField({ options: ['a'], multiple: true, maxSelect: 99 })
		);
		expect(sameShape(expected, actual)).toBe(false);
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
