import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import { previewSiteSeed, seedSiteProject, type SiteSeedPreview } from './site-seeding';
import {
	handEditedManifest,
	seedLikePrevious0ace139,
	seedLikePrevious1bda988
} from './site-seeding-previous.fixture';

async function authedMemory(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

/** Todo lo observable del proyecto: esquema y registros de las colecciones del sembrado. */
async function observable(port: MemoryBackendPort): Promise<string> {
	const types = await port.listContentTypes();
	const records: Record<string, unknown> = {};
	for (const name of ['pages', 'blocks', 'redirects', 'vega']) {
		if (types.some((type) => type.name === name)) {
			records[name] = (await port.list(name, { perPage: 100 })).items;
		}
	}
	return JSON.stringify({ types, records });
}

function ready(preview: SiteSeedPreview) {
	if (preview.status !== 'ready') throw new Error('se esperaba un plan, no un aborto');
	return preview.plan;
}

describe('previewSiteSeed', () => {
	test('en un proyecto vacío cuenta todo lo que se crea y no escribe nada', async () => {
		const port = await authedMemory();
		const before = await observable(port);

		const plan = ready(await previewSiteSeed(port));

		expect(plan).toEqual({
			createdCollections: ['vega_media', 'pages', 'blocks', 'redirects', 'vega'],
			addedFields: {},
			manifest: 'create',
			pageMissing: true,
			upToDate: false
		});
		expect(await observable(port)).toBe(before);
	});

	test('no llama a ninguna escritura del puerto', async () => {
		const port = await authedMemory();
		const writes = [
			vi.spyOn(port, 'ensureCollections'),
			vi.spyOn(port, 'addCollectionFields'),
			vi.spyOn(port, 'create'),
			vi.spyOn(port, 'update')
		];
		const patterns = port.addCollectionFieldPatterns
			? vi.spyOn(port, 'addCollectionFieldPatterns')
			: null;

		await previewSiteSeed(port);
		await seedLikePrevious0ace139(port);
		writes.forEach((spy) => spy.mockClear());
		patterns?.mockClear();
		await previewSiteSeed(port);

		for (const spy of writes) expect(spy).not.toHaveBeenCalled();
		expect(patterns).not.toHaveBeenCalled();
	});

	test('tras sembrar no hay nada que hacer', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);

		const plan = ready(await previewSiteSeed(port));

		expect(plan).toEqual({
			createdCollections: [],
			addedFields: {},
			manifest: 'keep',
			pageMissing: false,
			upToDate: true
		});
	});

	test('con la versión anterior cuenta campos, patrones, colección nueva y las entradas que se añaden al manifiesto', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		const before = await observable(port);

		const preview = await previewSiteSeed(port);
		const plan = ready(preview);

		expect(await observable(port)).toBe(before);
		if (preview.status !== 'ready') return;
		// Un solo módulo, la base, y su desglose suma lo mismo que el plan total.
		expect(preview.modules).toHaveLength(1);
		expect(preview.modules[0]).toEqual({
			id: 'base',
			createdCollections: plan.createdCollections,
			addedFields: plan.addedFields,
			manifestEntries: [
				'collections.pages.publishAtField',
				'collections.pages.fieldGroups',
				'collections.pages.fields.publishAt',
				'collections.pages.fields.description',
				'collections.pages.fields.socialImage',
				'collections.pages.fields.noindex',
				'collections.pages.page',
				'collections.redirects'
			],
			manifestSkipped: [],
			ruleDifferences: []
		});
		expect(plan.createdCollections).toEqual(['redirects']);
		expect(plan.addedFields.pages).toEqual(
			expect.arrayContaining(['publishAt', 'description', 'socialImage', 'noindex'])
		);
		expect(plan.manifest).toBe('upgrade');
		expect(plan.pageMissing).toBe(false);
		expect(plan.upToDate).toBe(false);
	});

	test('un redirects ya sembrado sin patrón cuenta los campos que lo recibirían', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);

		const plan = ready(await previewSiteSeed(port));

		expect(plan.constrainedFields).toEqual({ redirects: ['from', 'to'] });
		expect(plan.upToDate).toBe(false);

		await port.addCollectionFieldPatterns!('redirects', { to: '^/solo-mio' });
		expect(ready(await previewSiteSeed(port)).constrainedFields).toEqual({
			redirects: ['from']
		});
	});

	test('un manifiesto editado a mano y válido es un plan: dice qué entradas se añadirían y no escribe', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const record = (await port.list('vega', { perPage: 1 })).items[0]!;
		await port.update('vega', record.id, { manifest: handEditedManifest() });
		const before = await observable(port);

		const preview = await previewSiteSeed(port);

		expect(await observable(port)).toBe(before);
		expect(preview.status).toBe('ready');
		if (preview.status !== 'ready') return;
		expect(preview.plan.manifest).toBe('upgrade');
		expect(preview.modules[0]!.manifestEntries).toEqual([
			'collections.pages.publishAtField',
			'collections.pages.fields.publishAt',
			'collections.pages.page',
			'collections.redirects'
		]);
	});

	test('en un proyecto vacío el desglose nombra las entradas del manifiesto que se crearía', async () => {
		const port = await authedMemory();

		const preview = await previewSiteSeed(port);

		if (preview.status !== 'ready') throw new Error('se esperaba un plan');
		expect(preview.modules).toHaveLength(1);
		expect(preview.modules[0]!.manifestEntries).toEqual(
			expect.arrayContaining(['collections.pages', 'collections.redirects', 'blockTypes.hero'])
		);
	});

	test('tras sembrar, el desglose por módulo está vacío', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);

		const preview = await previewSiteSeed(port);

		if (preview.status !== 'ready') throw new Error('se esperaba un plan');
		expect(preview.modules).toEqual([
			{
				id: 'base',
				createdCollections: [],
				addedFields: {},
				manifestEntries: [],
				manifestSkipped: [],
				ruleDifferences: []
			}
		]);
	});

	test('un manifiesto que no es válido ni tras la fusión es un aborto con su divergencia, sin escribir', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const record = (await port.list('vega', { perPage: 1 })).items[0]!;
		await port.update('vega', record.id, { manifest: { editado: 'a mano' } });
		const before = await observable(port);

		const preview = await previewSiteSeed(port);

		expect(preview.status).toBe('blocked');
		if (preview.status !== 'blocked') return;
		expect(preview.divergences).toHaveLength(1);
		expect(preview.divergences[0]).toMatchObject({ piece: 'registro "vega/default"' });
		expect(await observable(port)).toBe(before);
	});

	test('un fallo de lectura se propaga: no es una divergencia', async () => {
		const port = await authedMemory();
		vi.spyOn(port, 'listContentTypes').mockRejectedValue(new Error('sin red'));

		await expect(previewSiteSeed(port)).rejects.toThrow('sin red');
	});
});
