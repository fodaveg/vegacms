import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import { previewSiteSeed, seedSiteProject, type SiteSeedPreview } from './site-seeding';
import { seedLikePrevious0ace139, seedLikePrevious1bda988 } from './site-seeding-previous.fixture';

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

	test('con la versión anterior cuenta campos, patrones, colección nueva y manifiesto a sustituir', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		const before = await observable(port);

		const plan = ready(await previewSiteSeed(port));

		expect(await observable(port)).toBe(before);
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

	test('un manifiesto editado a mano es un aborto con su divergencia, sin escribir', async () => {
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
