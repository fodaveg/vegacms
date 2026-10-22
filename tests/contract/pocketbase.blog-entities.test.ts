/** Blog real: firmas públicas ordenadas, avatar expandido, árbol y actualización sin pérdida. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend/port';
import {
	previewSiteSeed,
	seedSiteProject,
	SITE_SEED_EDITOR_ACCESS_RULE
} from '$lib/backend/site-seeding';
import { SITE_SEED_BLOG_MODULE } from '$lib/backend/site-seeding-blog';
import { previousBlogModule } from '$lib/backend/site-seeding-blog-previous.fixture';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

describe.skipIf(!isPocketBaseBinaryAvailable())(
	'autores y categorías del blog contra PocketBase real',
	() => {
		let running: RunningPocketBase;
		let admin: SiteSeedingAdmin;
		let port: BackendPort;
		beforeEach(async () => {
			running = await startPocketBase();
			admin = await createSiteSeedingAdmin(running);
			port = createPocketBaseBackend({ url: running.url });
			await port.login({ email: running.adminEmail, password: running.adminPassword });
		}, 30_000);
		afterEach(async () => {
			await running?.stop();
		});

		test('colecciones públicas, solo editores escriben, parent apunta a sí misma y los slugs son únicos', async () => {
			await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
			for (const name of ['authors', 'categories']) {
				const collection = await admin.collections.getOne(name);
				expect(collection).toMatchObject({
					listRule: '',
					viewRule: '',
					createRule: SITE_SEED_EDITOR_ACCESS_RULE,
					updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
					deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
				});
				if (name === 'categories')
					expect(collection.fields.find((field) => field.name === 'parent')).toMatchObject({
						collectionId: collection.id,
						maxSelect: 1,
						cascadeDelete: false
					});
				const list = await fetch(`${running.url}/api/collections/${name}/records`);
				expect(list.status).toBe(200);
				const anonymousCreate = await fetch(`${running.url}/api/collections/${name}/records`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: 'Sin permiso', slug: 'sin-permiso' })
				});
				expect(anonymousCreate.status).toBe(400);
				await admin.collection(name).create({ name: 'Primera', slug: 'unico' });
				await expect(
					admin.collection(name).create({ name: 'Otra rama', slug: 'unico' })
				).rejects.toMatchObject({
					status: 400,
					response: { data: { slug: { code: 'validation_not_unique' } } }
				});
			}
		});

		test('el sitio expande autores y avatar sin sesión, conserva el orden y al borrar conserva la entrada', async () => {
			await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
			const data = new FormData();
			data.set(
				'file',
				new Blob(
					[
						Buffer.from(
							'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=',
							'base64'
						)
					],
					{ type: 'image/png' }
				),
				'ana.png'
			);
			data.set('title', 'Foto de Ana');
			const avatar = await admin.collection('vega_media').create(data);
			const ana = await admin
				.collection('authors')
				.create({ name: 'Ana', slug: 'ana', avatar: avatar.id });
			const luis = await admin.collection('authors').create({ name: 'Luis', slug: 'luis' });
			const post = await admin.collection('posts').create({
				title: 'Firmado',
				slug: 'firmado',
				status: 'published',
				authors: [luis.id, ana.id]
			});
			const response = await fetch(
				`${running.url}/api/collections/posts/records/${post.id}?expand=authors,authors.avatar`
			);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.expand.authors.map((author: { id: string }) => author.id)).toEqual([
				luis.id,
				ana.id
			]);
			expect(body.expand.authors[1].expand.avatar).toMatchObject({
				id: avatar.id,
				title: 'Foto de Ana'
			});
			await admin.collection('posts').update(post.id, { authors: [ana.id, luis.id] });
			expect((await admin.collection('posts').getOne(post.id)).authors).toEqual([ana.id, luis.id]);
			await admin.collection('authors').delete(ana.id);
			expect((await admin.collection('posts').getOne(post.id)).authors).toEqual([luis.id]);
			await admin.collection('vega_media').delete(avatar.id);
		});

		test('borrar madre conserva sus hijas como raíces y elimina la categoría principal de las entradas', async () => {
			await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
			const parent = await admin
				.collection('categories')
				.create({ name: 'Desarrollo', slug: 'desarrollo' });
			const child = await admin
				.collection('categories')
				.create({ name: 'Web', slug: 'web', parent: parent.id });
			const post = await admin
				.collection('posts')
				.create({ title: 'Entrada', slug: 'entrada', categories: [parent.id, child.id] });
			await admin.collection('categories').delete(parent.id);
			expect((await admin.collection('categories').getOne(child.id)).parent).toBe('');
			expect((await admin.collection('posts').getOne(post.id)).categories).toEqual([child.id]);
		});

		test('actualiza un blog anterior por adición y la segunda pasada no escribe', async () => {
			await seedSiteProject(port, { modules: [previousBlogModule()] });
			const entry = await admin.collection('posts').create({ title: 'Antes', slug: 'antes' });
			const preview = await previewSiteSeed(port, { modules: [SITE_SEED_BLOG_MODULE] });
			expect(preview.status).toBe('ready');
			if (preview.status !== 'ready') throw new Error('preflight bloqueado');
			expect(preview.modules.find((module) => module.id === 'blog')).toMatchObject({
				createdCollections: ['authors', 'categories'],
				addedFields: { posts: ['authors', 'categories'] }
			});
			await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
			expect((await admin.collection('posts').getOne(entry.id)).title).toBe('Antes');
			const update = vi.spyOn(port, 'update');
			const create = vi.spyOn(port, 'create');
			expect(await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] })).toMatchObject({
				createdCollections: [],
				addedFields: {},
				createdRecords: [],
				upgradedRecords: []
			});
			expect(update).not.toHaveBeenCalled();
			expect(create).not.toHaveBeenCalled();
		});
	}
);
