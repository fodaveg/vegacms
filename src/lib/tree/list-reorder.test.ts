/** Lectura completa y movimiento acotado: no fragmentar ramas ni alterar otras madres. */
import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { SITE_SEED_BLOG_MODULE } from '$lib/backend/site-seeding-blog';
import { resolveContentModel } from '$lib/model/resolve';
import { loadTreeList } from '$lib/list/tree-load';
import { moveTreeSibling } from './reorder';

async function setup() {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
	const manifest = (await port.list('vega')).items[0].values.manifest;
	const type = resolveContentModel({
		types: await port.listContentTypes(),
		manifestRaw: manifest,
		accessBypass: true
	}).types.find((type) => type.name === 'categories')!;
	return { port, type };
}
const view = { q: '', status: null, sort: null, page: 1 };

describe('lectura y orden del árbol', () => {
	test('más de 200 filas: no pierde hojas y una búsqueda conserva título de madre y nivel', async () => {
		const { port, type } = await setup();
		const root = await port.create('categories', { name: 'Desarrollo', slug: 'desarrollo' });
		for (let i = 0; i < 205; i += 1)
			await port.create('categories', {
				name: `Rama ${i}`,
				slug: `rama-${i}`,
				parent: root.id,
				order: i
			});
		const list = vi.spyOn(port, 'list');
		const all = await loadTreeList(port, type, view);
		expect(all.page.items).toHaveLength(206);
		expect(all.treeRows[0].record.id).toBe(root.id);
		expect(list).toHaveBeenCalledTimes(2);
		const filtered = await loadTreeList(port, type, { ...view, q: 'Rama 204' });
		expect(filtered.page.items.map((record) => record.values.name)).toEqual(['Rama 204']);
		expect(
			filtered.treeRows.find((row) => row.record.id === filtered.page.items[0].id)
		).toMatchObject({ parentId: root.id, depth: 2 });
		expect(filtered.treeRows.find((row) => row.record.id === root.id)?.record.values.name).toBe(
			'Desarrollo'
		);
	});
	test('Subir solo actualiza el orden de hermanas y conserva los enlaces y otras ramas', async () => {
		const { port, type } = await setup();
		const root = await port.create('categories', {
			name: 'Desarrollo',
			slug: 'desarrollo',
			order: 0
		});
		const other = await port.create('categories', {
			name: 'Personal',
			slug: 'personal',
			order: 10
		});
		const web = await port.create('categories', {
			name: 'Web',
			slug: 'web',
			parent: root.id,
			order: 5
		});
		const apple = await port.create('categories', {
			name: 'Apple',
			slug: 'apple',
			parent: root.id,
			order: 10
		});
		const child = await port.create('categories', {
			name: 'Vida',
			slug: 'vida',
			parent: other.id,
			order: 7
		});
		const update = vi.spyOn(port, 'update');
		await moveTreeSibling(port, type, apple.id, -1);
		expect(update.mock.calls.map((call) => call[1]).sort()).toEqual([apple.id, web.id].sort());
		for (const call of update.mock.calls) expect(Object.keys(call[2])).toEqual(['order']);
		expect((await port.get('categories', child.id)).values).toMatchObject({
			parent: other.id,
			order: 7
		});
		const all = await loadTreeList(port, type, view);
		expect(
			all.treeRows.filter((row) => row.parentId === root.id).map((row) => row.record.id)
		).toEqual([apple.id, web.id]);
	});
});
