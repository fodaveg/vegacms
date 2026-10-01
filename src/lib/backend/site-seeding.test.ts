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
	SITE_SEED_REDIRECT_FROM_PATTERN,
	SITE_SEED_REDIRECT_TO_PATTERN,
	SITE_SEED_REDIRECTS_READ_RULE,
	SITE_SEED_BASE_MODULE,
	SiteSeedDivergenceError,
	previewSiteSeed,
	seedSiteProject,
	type SiteSeedModule
} from './site-seeding';
import starterManifest from './site-seeding-manifest.json';
import {
	findSiteSeedModule,
	SITE_SEED_MODULES,
	SITE_SEED_OPTIONAL_MODULES
} from './site-seeding-modules';
import {
	handEditedManifest,
	previousStarterManifest,
	seedLikePrevious0ace139,
	seedLikePrevious1bda988,
	starterManifest0ace139
} from './site-seeding-previous.fixture';
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

		expect(port.inspectCollection('vega_editors')).toMatchObject({
			type: 'auth',
			fieldNames: ['created']
		});
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
		// «Publicar el»: fecha editable (no autodate) y OPCIONAL, como exige `vegaschedule`.
		expect(pages.fields.find((field) => field.name === 'publishAt')).toMatchObject({
			type: 'date',
			required: false,
			readonly: false
		});
		const redirects = types.find((type) => type.name === 'redirects')!;
		expect(redirects.fields.map((field) => field.name)).toEqual([
			'from',
			'to',
			'code',
			'created',
			'updated'
		]);
		// Las fechas de alta y edición son autodate (`date` readonly en el puerto); `updated` es la
		// que lee «cambios sin publicar», y `pages`/`blocks` las llevan igual.
		for (const name of ['pages', 'blocks', 'redirects']) {
			const fields = types.find((type) => type.name === name)!.fields;
			for (const dateField of ['created', 'updated']) {
				expect(
					fields.find((field) => field.name === dateField),
					`${name}.${dateField}`
				).toMatchObject({
					type: 'date',
					readonly: true
				});
			}
		}
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

		expect(pages.publishAtField).toBe('publishAt');
		const publishAt = pages.fields.find((field) => field.name === 'publishAt')!;
		expect(publishAt.label).toBe('Publicar el');
		expect(publishAt.widget).toBe('datetime');
		expect(publishAt.help).toContain('vegaschedule');

		const redirects = model.types.find((type) => type.name === 'redirects')!;
		expect(redirects.hidden).toBe(false);
		expect(redirects.label).toBe('Redirecciones');
		for (const field of redirects.fields.filter(
			(item) => !['created', 'updated'].includes(item.name)
		)) {
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
			// `vega_editors` gana `created` (autodate) y `vega_media` gana `focal`: ninguno de los dos
			// lo creaba el sembrado anterior.
			addedFields: {
				vega_editors: ['created'],
				vega_media: ['focal'],
				pages: ['publishAt', 'description', 'socialImage', 'noindex', 'created', 'updated'],
				blocks: ['created', 'updated']
			},
			createdRecords: [],
			upgradedRecords: ['manifest'],
			manifestEntries: {
				base: [
					'collections.pages.publishAtField',
					'collections.pages.fieldGroups',
					'collections.pages.fields.publishAt',
					'collections.pages.fields.description',
					'collections.pages.fields.socialImage',
					'collections.pages.fields.noindex',
					'collections.redirects'
				]
			}
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

	test('un proyecto sembrado con SEO (0ace139) recibe pages.publishAt y el manifiesto nuevo sin perder datos', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const page = await canonicalPage(port);
		await port.update('pages', page.id, {
			title: 'Portada humana',
			status: 'published',
			description: 'Escrita a mano'
		});
		const redirect = await port.create('redirects', { from: '/viejo', to: '/', code: '301' });

		const result = await seedSiteProject(port);

		expect(result).toEqual({
			createdCollections: [],
			addedFields: {
				vega_editors: ['created'],
				vega_media: ['focal'],
				pages: ['publishAt', 'created', 'updated'],
				blocks: ['created', 'updated'],
				redirects: ['created', 'updated']
			},
			constrainedFields: { redirects: ['from', 'to'] },
			createdRecords: [],
			upgradedRecords: ['manifest'],
			manifestEntries: {
				base: ['collections.pages.publishAtField', 'collections.pages.fields.publishAt']
			}
		});
		const after = await canonicalPage(port);
		expect(after.id).toBe(page.id);
		expect(after.values).toMatchObject({
			title: 'Portada humana',
			status: 'published',
			description: 'Escrita a mano'
		});
		expect((await port.get('redirects', redirect.id)).values).toMatchObject({ from: '/viejo' });
		const manifests = await port.list('vega', { perPage: 5 });
		expect(manifests.totalItems).toBe(1);
		expect(manifests.items[0]?.values.manifest).toEqual(starterManifest);

		await expect(seedSiteProject(port)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
	});

	describe('patrones de redirects.from y redirects.to', () => {
		const VALID_TO = ['/', '/a', '/a/b', '/a?x=1', '/#ancla', 'https://x.y/z', 'http://x.y'];
		const INVALID_TO = [
			'javascript:alert(1)',
			'data:text/html,x',
			'//evil.com',
			'/\\evil.com',
			'/\t/evil.com',
			'/\n/evil.com',
			'/ /evil.com',
			'evil.com',
			''
		];

		test('los regex cumplen la tabla de destinos legítimos e ilegítimos', () => {
			const to = new RegExp(SITE_SEED_REDIRECT_TO_PATTERN);
			for (const value of VALID_TO) expect(to.test(value), JSON.stringify(value)).toBe(true);
			for (const value of INVALID_TO) expect(to.test(value), JSON.stringify(value)).toBe(false);
			const from = new RegExp(SITE_SEED_REDIRECT_FROM_PATTERN);
			expect(from.test('/viejo')).toBe(true);
			expect(from.test('viejo')).toBe(false);
			expect(from.test('https://x.y')).toBe(false);
		});

		test('un sembrado nuevo crea redirects con los dos patrones y rechaza destinos peligrosos', async () => {
			const port = await authedMemory();
			const result = await seedSiteProject(port);
			expect(result.constrainedFields).toBeUndefined();
			const redirects = (await port.listContentTypes()).find((type) => type.name === 'redirects')!;
			expect(redirects.fields.find((field) => field.name === 'from')).toMatchObject({
				pattern: SITE_SEED_REDIRECT_FROM_PATTERN
			});
			expect(redirects.fields.find((field) => field.name === 'to')).toMatchObject({
				pattern: SITE_SEED_REDIRECT_TO_PATTERN
			});
			await expect(
				port.create('redirects', { from: '/a', to: 'javascript:alert(1)', code: '301' })
			).rejects.toMatchObject({ kind: 'validation' });
			await expect(
				port.create('redirects', { from: '/b', to: '/', code: '301' })
			).resolves.toBeTruthy();
		});

		test('un proyecto ya sembrado recibe los patrones sin tocar registros ni campos con patrón propio', async () => {
			const port = await authedMemory();
			await seedLikePrevious0ace139(port);
			const legacy = await port.create('redirects', {
				from: '/viejo',
				to: 'sin-barra',
				code: '301'
			});

			const result = await seedSiteProject(port);

			expect(result.constrainedFields).toEqual({ redirects: ['from', 'to'] });
			// El registro antiguo, aunque no cumpla el patrón, sigue ahí tal cual.
			expect((await port.get('redirects', legacy.id)).values).toMatchObject({ to: 'sin-barra' });
			await expect(
				port.create('redirects', { from: '/x', to: '//evil.com', code: '301' })
			).rejects.toMatchObject({ kind: 'validation' });
			// Segunda pasada: nada que hacer.
			expect((await seedSiteProject(port)).constrainedFields).toBeUndefined();
		});

		test('un patrón que el usuario ya puso en redirects.to no se pisa', async () => {
			const port = await authedMemory();
			await seedLikePrevious0ace139(port);
			await port.addCollectionFieldPatterns!('redirects', { to: '^/solo-mio' });

			const result = await seedSiteProject(port);

			expect(result.constrainedFields).toEqual({ redirects: ['from'] });
			const redirects = (await port.listContentTypes()).find((type) => type.name === 'redirects')!;
			expect(redirects.fields.find((field) => field.name === 'to')).toMatchObject({
				pattern: '^/solo-mio'
			});
		});
	});

	test('un manifiesto de 0ace139 EDITADO recibe las entradas que le faltan y conserva lo editado', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const manifestRecord = (await port.list('vega', { perPage: 1 })).items[0]!;
		const edited = {
			...(starterManifest0ace139 as Record<string, unknown>),
			site: { name: 'Mi taller' }
		};
		await port.update('vega', manifestRecord.id, { manifest: edited as JsonValue });

		const result = await seedSiteProject(port);

		expect(result.upgradedRecords).toEqual(['manifest']);
		expect(result.manifestEntries).toEqual({
			base: ['collections.pages.publishAtField', 'collections.pages.fields.publishAt']
		});
		const after = (await port.get('vega', manifestRecord.id)).values.manifest;
		expect(after).toEqual({ ...(starterManifest as Record<string, unknown>), site: edited.site });
	});

	test('un manifiesto editado a mano: se añade lo que falta, no se pierde nada y la segunda pasada no escribe', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const manifestRecord = (await port.list('vega', { perPage: 1 })).items[0]!;
		const edited = handEditedManifest();
		await port.update('vega', manifestRecord.id, { manifest: edited });

		const result = await seedSiteProject(port);

		expect(result.upgradedRecords).toEqual(['manifest']);
		expect(result.manifestEntries).toEqual({
			base: [
				'collections.pages.publishAtField',
				'collections.pages.fields.publishAt',
				// La entrada que el usuario borró a propósito vuelve: decisión abierta, ver
				// `site-seeding-merge.test.ts` y docs/POCKETBASE-INTEGRATION.md.
				'collections.redirects'
			]
		});
		const after = (await port.get('vega', manifestRecord.id)).values.manifest as Record<
			string,
			Record<string, Record<string, unknown>>
		>;
		// Todo lo que había sigue: el manifiesto editado es un subconjunto del resultado.
		expect(after).toMatchObject(edited as Record<string, unknown>);
		expect(after.site.name).toBe('Mi taller');
		expect(after.collections.pages.label).toBe('Hojas');
		expect(after.collections.pages.listFields).toEqual(['title', 'status']);
		expect(after.collections.recetas).toEqual({ label: 'Recetas', icon: 'tag' });
		expect(after.blockTypes.hero.label).toBe('Cabecera');
		expect(after.blockTypes.receta.label).toBe('Receta');
		expect(after.collections.pages.publishAtField).toBe('publishAt');

		const snapshot = await logicalSnapshot(port);
		const writes = watchSeedWrites(port);
		await expect(seedSiteProject(port)).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
		expect(writes[2]).not.toHaveBeenCalled();
		expect(writes[3]).not.toHaveBeenCalled();
		expect(writes[4]).not.toHaveBeenCalled();
		expect(await logicalSnapshot(port)).toEqual(snapshot);
	});

	test('un manifiesto que la fusión no puede dejar válido aborta sin escribir y se queda intacto', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const manifestRecord = (await port.list('vega', { perPage: 1 })).items[0]!;
		// `clave_inventada` no existe en el schema: ni con las entradas de la base valida.
		const invalid = { ...(starterManifest0ace139 as Record<string, unknown>), clave_inventada: 1 };
		await port.update('vega', manifestRecord.id, { manifest: invalid as JsonValue });
		const writes = watchSeedWrites(port);

		const error = await seedSiteProject(port).then(
			() => null,
			(caught: unknown) => caught
		);

		expect(error).toBeInstanceOf(SiteSeedDivergenceError);
		expect((error as SiteSeedDivergenceError).divergences).toEqual([
			expect.objectContaining({
				piece: 'registro "vega/default"',
				actual: expect.stringContaining('manifiesto distinto y no válido')
			})
		]);
		expectNoSeedWrites(writes);
		expect((await port.get('vega', manifestRecord.id)).values.manifest).toEqual(invalid);
	});

	test('un manifiesto que no es un objeto aborta sin escribir', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const manifestRecord = (await port.list('vega', { perPage: 1 })).items[0]!;
		await port.update('vega', manifestRecord.id, { manifest: ['no', 'es', 'un', 'objeto'] });
		const writes = watchSeedWrites(port);

		await expect(seedSiteProject(port)).rejects.toBeInstanceOf(SiteSeedDivergenceError);
		expectNoSeedWrites(writes);
	});

	test('vega_editors ya existente gana created sin perder sus campos, y las cuentas nuevas traen alta', async () => {
		const port = await authedMemory();
		await port.ensureCollections([
			{ name: 'vega_editors', type: 'auth', fields: [{ name: 'displayName', type: 'text' }] }
		]);
		const before = await port.administration!.createEditor('antes@vega.test', {
			kind: 'password',
			password: 'contraseña-larga'
		});
		expect(before.created).toBeNull();

		const result = await seedSiteProject(port);
		expect(result.createdCollections).not.toContain('vega_editors');
		expect(result.addedFields.vega_editors).toEqual(['created']);
		expect(port.inspectCollection('vega_editors')?.fieldNames).toEqual(['displayName', 'created']);

		const after = await port.administration!.createEditor('despues@vega.test', {
			kind: 'password',
			password: 'contraseña-larga'
		});
		expect(Number.isNaN(Date.parse(after.created ?? ''))).toBe(false);
		expect((await seedSiteProject(port)).addedFields).toEqual({});
	});

	test('con passwordResetUrl, el sembrado deja el enlace de invitación en /restablecer una sola vez', async () => {
		const port = await authedMemory();
		const url = 'https://admin.example/restablecer';
		expect((await seedSiteProject(port, { passwordResetUrl: url })).invitationLink).toBe('updated');
		expect((await seedSiteProject(port, { passwordResetUrl: url })).invitationLink).toBe('current');
		// Sin la opción, el resultado no cambia de forma (el sembrado headless no sabe su URL).
		expect(await seedSiteProject(port)).not.toHaveProperty('invitationLink');
	});

	test('un manifiesto anterior (1bda988) EDITADO recibe SEO y redirects y conserva lo editado', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		const manifestRecord = (await port.list('vega', { perPage: 1 })).items[0]!;
		const edited = {
			...(previousStarterManifest as Record<string, unknown>),
			site: { name: 'Mi taller' }
		};
		await port.update('vega', manifestRecord.id, { manifest: edited as JsonValue });

		const result = await seedSiteProject(port);

		expect(result.createdCollections).toEqual(['redirects']);
		expect(result.upgradedRecords).toEqual(['manifest']);
		expect((await port.get('vega', manifestRecord.id)).values.manifest).toEqual({
			...(starterManifest as Record<string, unknown>),
			site: edited.site
		});
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
		expect(result.addedFields.blocks).toEqual(['image', 'images', 'created', 'updated']);
		const blocks = (await port.listContentTypes()).find((type) => type.name === 'blocks')!;
		expect(blocks.fields.map((field) => field.name)).toEqual([
			'parent',
			'order',
			'type',
			'data',
			'image',
			'images',
			'created',
			'updated'
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
				pages: [
					'title',
					'path',
					'layout',
					'publishAt',
					'description',
					'socialImage',
					'noindex',
					'created',
					'updated'
				]
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

	test('un manifiesto humano distinto conserva lo suyo y recibe las entradas de la base', async () => {
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

		const result = await seedSiteProject(port);

		expect(result).toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: ['manifest'],
			manifestEntries: {
				base: [
					'nav',
					'collections.pages',
					'collections.redirects',
					'collections.blocks',
					'blockTypes.hero',
					'blockTypes.richtext',
					'blockTypes.image',
					'blockTypes.gallery',
					'blockTypes.cta',
					'blockTypes.divider'
				]
			}
		});
		const after = await port.get('vega', manifestRecord.id);
		expect(after.id).toBe(manifestRecord.id);
		expect(after.values.manifest).toEqual({
			...(starterManifest as Record<string, unknown>),
			site: { name: 'Proyecto humano' }
		});
	});

	describe('módulos', () => {
		const NOTES_MODULE: SiteSeedModule = {
			id: 'notas',
			collections: [
				{
					name: 'notes',
					listRule: SITE_SEED_EDITOR_ACCESS_RULE,
					viewRule: SITE_SEED_EDITOR_ACCESS_RULE,
					createRule: SITE_SEED_EDITOR_ACCESS_RULE,
					updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
					deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
					fields: [
						{ name: 'title', type: 'text', required: true, max: 200 },
						{
							name: 'page',
							type: 'relation',
							target: 'pages',
							multiple: false,
							cascadeDelete: false
						}
					]
				}
			],
			manifest: {
				collections: { notes: { label: 'Notas', titleField: 'title' } },
				blockTypes: {
					'note-list': {
						label: 'Lista de notas',
						icon: 'tag',
						fields: [
							{ name: 'heading', label: 'Título', widget: 'text', source: 'data', default: '' }
						]
					}
				}
			}
		};

		test('la base es el módulo `base` y es el único registrado', () => {
			expect(SITE_SEED_MODULES).toEqual([SITE_SEED_BASE_MODULE]);
			expect(SITE_SEED_OPTIONAL_MODULES).toEqual([]);
			expect(findSiteSeedModule('base')).toBe(SITE_SEED_BASE_MODULE);
			expect(findSiteSeedModule('blog')).toBeUndefined();
			expect(SITE_SEED_BASE_MODULE.id).toBe('base');
			expect(SITE_SEED_BASE_MODULE.collections.map((spec) => spec.name)).toEqual([
				'vega_media',
				'pages',
				'blocks',
				'redirects',
				'vega'
			]);
			expect(SITE_SEED_BASE_MODULE.manifest).toEqual(starterManifest);
		});

		test('sin módulos pedidos, un proyecto vacío recibe exactamente el manifiesto inicial', async () => {
			const port = await authedMemory();
			await seedSiteProject(port);

			const saved = (await port.list('vega', { perPage: 1 })).items[0]!.values.manifest;
			expect(JSON.stringify(saved)).toBe(JSON.stringify(starterManifest));
		});

		test('un módulo añadido a un sitio ya sembrado crea su colección y suma sus entradas sin tocar las de la base', async () => {
			const port = await authedMemory();
			await seedSiteProject(port);
			const before = (await port.list('vega', { perPage: 1 })).items[0]!;

			const preview = await previewSiteSeed(port, { modules: [NOTES_MODULE] });
			expect(preview).toEqual({
				status: 'ready',
				plan: {
					createdCollections: ['notes'],
					addedFields: {},
					manifest: 'upgrade',
					pageMissing: false,
					upToDate: false
				},
				modules: [
					{ id: 'base', createdCollections: [], addedFields: {}, manifestEntries: [] },
					{
						id: 'notas',
						createdCollections: ['notes'],
						addedFields: {},
						manifestEntries: ['collections.notes', 'blockTypes.note-list']
					}
				]
			});

			const result = await seedSiteProject(port, { modules: [NOTES_MODULE] });

			expect(result).toEqual({
				createdCollections: ['notes'],
				addedFields: {},
				createdRecords: [],
				upgradedRecords: ['manifest'],
				manifestEntries: { notas: ['collections.notes', 'blockTypes.note-list'] }
			});
			const after = (await port.list('vega', { perPage: 2 })).items;
			expect(after).toHaveLength(1);
			expect(after[0]!.id).toBe(before.id);
			const manifest = after[0]!.values.manifest as Record<string, Record<string, unknown>>;
			expect(manifest).toMatchObject(before.values.manifest as Record<string, unknown>);
			expect(manifest.collections.notes).toEqual({ label: 'Notas', titleField: 'title' });
			expect(Object.keys(manifest.collections)).toEqual(['pages', 'redirects', 'blocks', 'notes']);
			expect(port.inspectCollection('notes')).toBeDefined();
			await expect(port.create('notes', { title: 'Primera' })).resolves.toMatchObject({
				values: { title: 'Primera' }
			});

			// La segunda pasada con el mismo módulo no tiene nada que hacer.
			await expect(seedSiteProject(port, { modules: [NOTES_MODULE] })).resolves.toEqual({
				createdCollections: [],
				addedFields: {},
				createdRecords: [],
				upgradedRecords: []
			});
			const again = await previewSiteSeed(port, { modules: [NOTES_MODULE] });
			expect(again).toMatchObject({ status: 'ready', plan: { upToDate: true } });
		});

		test('base y módulo a la vez sobre un proyecto vacío: un solo manifiesto con las entradas de los dos', async () => {
			const port = await authedMemory();

			const preview = await previewSiteSeed(port, { modules: [NOTES_MODULE] });
			if (preview.status !== 'ready') throw new Error('se esperaba un plan');
			expect(preview.plan.createdCollections).toEqual([
				'vega_media',
				'pages',
				'blocks',
				'redirects',
				'vega',
				'notes'
			]);
			expect(preview.modules.map((module) => [module.id, module.createdCollections])).toEqual([
				['base', ['vega_media', 'pages', 'blocks', 'redirects', 'vega']],
				['notas', ['notes']]
			]);
			expect(preview.modules[1]!.manifestEntries).toEqual([
				'collections.notes',
				'blockTypes.note-list'
			]);

			const result = await seedSiteProject(port, { modules: [NOTES_MODULE] });

			expect(result.createdCollections).toEqual([
				'vega_editors',
				'vega_media',
				'pages',
				'blocks',
				'redirects',
				'vega',
				'notes'
			]);
			expect(result.createdRecords).toEqual(['manifest', 'page:/']);
			expect(result.manifestEntries).toBeUndefined();
			const manifest = (await port.list('vega', { perPage: 1 })).items[0]!.values
				.manifest as Record<string, Record<string, unknown>>;
			expect(manifest).toMatchObject(starterManifest as Record<string, unknown>);
			expect(manifest.collections.notes).toBeDefined();
			expect(manifest.blockTypes['note-list']).toBeDefined();
		});

		test('un fragmento de módulo mal escrito se rechaza en el preflight, antes de crear nada', async () => {
			const port = await authedMemory();
			const writes = watchSeedWrites(port);
			const broken: SiteSeedModule = {
				id: 'roto',
				collections: [],
				manifest: { blockTypes: { NoValido: { label: 'x', fields: [] } } }
			};

			await expect(seedSiteProject(port, { modules: [broken] })).rejects.toThrow(
				'no forman un manifiesto válido'
			);
			expectNoSeedWrites(writes);
		});

		test('una colección del módulo con otra forma aborta el lote entero antes de escribir', async () => {
			const port = await authedMemory();
			await seedSiteProject(port);
			await port.ensureCollections([
				{ name: 'notes', fields: [{ name: 'title', type: 'number' }] }
			]);
			const writes = watchSeedWrites(port);

			const preview = await previewSiteSeed(port, { modules: [NOTES_MODULE] });
			expect(preview.status).toBe('blocked');
			await expect(seedSiteProject(port, { modules: [NOTES_MODULE] })).rejects.toBeInstanceOf(
				SiteSeedDivergenceError
			);
			expectNoSeedWrites(writes);
		});

		test('un módulo repetido, o una colección declarada por dos módulos, es un error de registro', async () => {
			const port = await authedMemory();
			const reads = vi.spyOn(port, 'listContentTypes');

			await expect(
				seedSiteProject(port, { modules: [NOTES_MODULE, { ...NOTES_MODULE }] })
			).rejects.toThrow('Módulo de sembrado repetido: "notas"');
			await expect(
				seedSiteProject(port, {
					modules: [
						{ id: 'otro', collections: [SITE_SEED_BASE_MODULE.collections[1]!], manifest: {} }
					]
				})
			).rejects.toThrow(
				'La colección "pages" la declaran dos módulos de sembrado: "base" y "otro"'
			);
			expect(reads).not.toHaveBeenCalled();
		});
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
