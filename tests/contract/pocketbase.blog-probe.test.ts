/** Sondas previas del blog: autorrelación por red, borrado, expansión pública y orden de firmas. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { isPocketBaseBinaryAvailable, pocketBaseBinaryVersion } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

describe.skipIf(!isPocketBaseBinaryAvailable())('sondas del blog contra PocketBase real', () => {
	let running: RunningPocketBase;
	let admin: SiteSeedingAdmin;
	beforeAll(async () => {
		running = await startPocketBase();
		admin = await createSiteSeedingAdmin(running);
	}, 30_000);
	afterAll(async () => {
		await running?.stop();
	});

	test('PATCH acepta una autorrelación y borrar la madre vacía la relación sin borrar la hija', async () => {
		expect(pocketBaseBinaryVersion()).toBe('0.39.9');
		const collection = await admin.collections.create({
			name: 'probe_categories',
			type: 'base',
			fields: [{ name: 'name', type: 'text' }]
		});
		await admin.collections.update(collection.id, {
			fields: [
				...collection.fields,
				{
					name: 'parent',
					type: 'relation',
					collectionId: collection.id,
					maxSelect: 1,
					cascadeDelete: false
				}
			]
		});
		const parent = await admin.collection(collection.name).create({ name: 'Desarrollo' });
		const child = await admin
			.collection(collection.name)
			.create({ name: 'Web', parent: parent.id });
		expect(child.parent).toBe(parent.id);
		await admin.collection(collection.name).delete(parent.id);
		expect((await admin.collection(collection.name).getOne(child.id)).parent).toBe('');
	});

	test('expand anidado usa viewRule y conserva el orden de una relación múltiple', async () => {
		const media = await admin.collections.create({
			name: 'probe_media',
			type: 'base',
			listRule: null,
			viewRule: '',
			fields: [{ name: 'title', type: 'text' }]
		});
		const photo = await admin.collection(media.name).create({ title: 'Foto de Ana' });
		const authors = await admin.collections.create({
			name: 'probe_authors',
			type: 'base',
			listRule: '',
			viewRule: '',
			fields: [
				{ name: 'name', type: 'text' },
				{
					name: 'avatar',
					type: 'relation',
					collectionId: media.id,
					maxSelect: 1,
					cascadeDelete: false
				}
			]
		});
		const ana = await admin.collection(authors.name).create({ name: 'Ana', avatar: photo.id });
		const luis = await admin.collection(authors.name).create({ name: 'Luis' });
		const posts = await admin.collections.create({
			name: 'probe_posts',
			type: 'base',
			listRule: '',
			viewRule: '',
			fields: [
				{
					name: 'authors',
					type: 'relation',
					collectionId: authors.id,
					maxSelect: 99,
					cascadeDelete: false
				}
			]
		});
		const post = await admin.collection(posts.name).create({ authors: [luis.id, ana.id] });
		const read = async () => {
			const response = await fetch(
				`${running.url}/api/collections/${posts.name}/records/${post.id}?expand=authors,authors.avatar`
			);
			expect(response.status).toBe(200);
			return response.json();
		};
		const first = await read();
		expect(first.authors).toEqual([luis.id, ana.id]);
		expect(first.expand.authors.map((author: { id: string }) => author.id)).toEqual([
			luis.id,
			ana.id
		]);
		expect(first.expand.authors[1].expand.avatar.title).toBe('Foto de Ana');
		await admin.collection(posts.name).update(post.id, { authors: [ana.id, luis.id] });
		expect((await read()).authors).toEqual([ana.id, luis.id]);
		await admin.collection(authors.name).delete(ana.id);
		expect((await read()).authors).toEqual([luis.id]);
	});
});
