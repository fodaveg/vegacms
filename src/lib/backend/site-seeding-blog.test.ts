/** Altas, actualización y divergencias del blog con firmas y árbol editorial. */
import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from './adapters/memory';
import { seedSiteProject, previewSiteSeed, SITE_SEED_EDITOR_ACCESS_RULE } from './site-seeding';
import { SITE_SEED_BLOG_MODULE } from './site-seeding-blog';
import { previousBlogModule } from './site-seeding-blog-previous.fixture';

async function backend() {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

describe('firmas y categorías del blog', () => {
	test('esquema completo, reglas públicas y relaciones sin cascada', async () => {
		const port = await backend();
		await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
		for (const name of ['authors', 'categories']) {
			expect(port.inspectCollection(name)!.rules).toMatchObject({
				listRule: '',
				viewRule: '',
				createRule: SITE_SEED_EDITOR_ACCESS_RULE,
				updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
				deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
			});
		}
		const types = await port.listContentTypes();
		const categories = types.find((type) => type.name === 'categories')!;
		expect(categories.fields.find((field) => field.name === 'parent')).toMatchObject({
			type: 'relation',
			target: 'categories',
			multiple: false,
			cascadeDelete: false
		});
		const posts = types.find((type) => type.name === 'posts')!;
		for (const name of ['authors', 'categories'])
			expect(posts.fields.find((field) => field.name === name)).toMatchObject({
				type: 'relation',
				target: name,
				multiple: true,
				cascadeDelete: false,
				required: false
			});
	});

	test('un blog anterior gana solo lo ausente, conserva firmas y preferencias y repetir no escribe', async () => {
		const port = await backend();
		await seedSiteProject(port, { modules: [previousBlogModule()] });
		const existing = await port.create('posts', {
			title: 'Anterior',
			slug: 'anterior',
			status: 'draft'
		});
		const preview = await previewSiteSeed(port, { modules: [SITE_SEED_BLOG_MODULE] });
		expect(preview.status).toBe('ready');
		if (preview.status !== 'ready') throw new Error('preflight bloqueado');
		expect(preview.modules.find((module) => module.id === 'blog')).toMatchObject({
			createdCollections: ['authors', 'categories'],
			addedFields: { posts: ['authors', 'categories'] }
		});
		await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
		expect((await port.get('posts', existing.id)).values).toMatchObject({
			title: 'Anterior',
			slug: 'anterior'
		});
		const update = vi.spyOn(port, 'update');
		const create = vi.spyOn(port, 'create');
		expect(await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] })).toMatchObject({
			createdCollections: [],
			addedFields: {},
			upgradedRecords: []
		});
		expect(update).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});

	test.each(['authors', 'categories'])(
		'posts.%s de texto bloquea el lote sin crear colecciones',
		async (field) => {
			const port = await backend();
			await seedSiteProject(port, { modules: [previousBlogModule()] });
			await port.addCollectionFields('posts', [{ name: field, type: 'text' }]);
			const ensure = vi.spyOn(port, 'ensureCollections');
			const addFields = vi.spyOn(port, 'addCollectionFields');
			await expect(seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] })).rejects.toThrow();
			expect(ensure).not.toHaveBeenCalled();
			expect(addFields).not.toHaveBeenCalled();
			expect((await port.listContentTypes()).map((type) => type.name)).not.toContain(field);
		}
	);

	test('ensureCollections admite autorrelación e idempotencia, pero no una relación externa ausente', async () => {
		const port = await backend();
		const spec = {
			name: 'families',
			fields: [
				{
					name: 'parent',
					type: 'relation' as const,
					target: 'families',
					multiple: false,
					cascadeDelete: false
				}
			]
		};
		expect(await port.ensureCollections([spec])).toEqual({ created: ['families'], skipped: [] });
		expect(
			(await port.listContentTypes()).find((type) => type.name === 'families')!.fields[0]
		).toMatchObject(spec.fields[0]);
		expect(await port.ensureCollections([spec])).toEqual({ created: [], skipped: ['families'] });
		await expect(
			port.ensureCollections([
				{ name: 'outsiders', fields: [{ ...spec.fields[0], target: 'absent' }] }
			])
		).rejects.toMatchObject({
			kind: 'validation',
			fieldErrors: { parent: { code: 'vega_relation_target_not_found' } }
		});
	});
});
