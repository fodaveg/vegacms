import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { VEGA_COLLECTION } from '$lib/backend/collections';
import type { BackendPort } from '$lib/backend/port';
import {
	SITE_SEED_MANIFEST_READ_RULE,
	SiteSeedDivergenceError,
	seedSiteProject
} from '$lib/backend/site-seeding';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import {
	createSiteSeedingAdmin,
	isPocketBaseNotFound,
	type SiteSeedingAdmin,
	type SiteSeedingCollectionModel
} from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

const AVAILABLE = isPocketBaseBinaryAvailable();
const TOUCHED_COLLECTIONS = ['vega_editors', 'pages', 'vega_media', 'blocks', 'vega'] as const;
const RECORD_COLLECTIONS = ['pages', 'blocks', 'vega'] as const;

describe.skipIf(!AVAILABLE)('sembrado de sitio contra PocketBase real', () => {
	let running: RunningPocketBase | undefined;
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
		running = undefined;
	});

	test('desde limpio crea el proyecto utilizable y la segunda pasada no cambia la instantánea lógica', async () => {
		await seedSiteProject(port);

		const collections = await Promise.all(
			TOUCHED_COLLECTIONS.map((name) => admin.collections.getOne(name))
		);
		expect(collections.map((collection) => collection.name)).toEqual(TOUCHED_COLLECTIONS);
		expect(collections[0]?.type).toBe('auth');

		const media = collections.find((collection) => collection.name === 'vega_media')!;
		const blocks = collections.find((collection) => collection.name === 'blocks')!;
		const blockFields = new Map(blocks.fields.map((field) => [field.name, field]));
		expect(blockFields.get('image')).toMatchObject({
			type: 'relation',
			collectionId: media.id,
			maxSelect: 1,
			required: false
		});
		expect(blockFields.get('images')).toMatchObject({
			type: 'relation',
			collectionId: media.id,
			maxSelect: 99,
			required: false
		});

		const vega = collections.find((collection) => collection.name === 'vega')!;
		expect(vega.listRule).toBe(SITE_SEED_MANIFEST_READ_RULE);
		expect(vega.viewRule).toBe(SITE_SEED_MANIFEST_READ_RULE);

		const manifestRecords = await admin.collection('vega').getFullList();
		expect(manifestRecords).toHaveLength(1);
		expect(manifestRecords[0]).toMatchObject({
			key: 'default',
			manifestVersion: 1
		});
		expect(Object.keys(manifestRecords[0]?.manifest.blockTypes).sort()).toEqual([
			'cta',
			'divider',
			'gallery',
			'hero',
			'image',
			'richtext'
		]);
		expect(manifestRecords[0]?.schemaSnapshot).toEqual(expect.any(Array));

		const pages = await admin.collection('pages').getFullList();
		expect(pages).toHaveLength(1);
		expect(pages[0]).toMatchObject({
			title: 'Inicio',
			path: '/',
			layout: 'default',
			status: 'draft'
		});

		const before = await logicalSnapshot(admin);
		await seedSiteProject(port);
		expect(await logicalSnapshot(admin)).toEqual(before);
	});

	test('si blocks desaparece, la siguiente pasada recrea solo esa colección', async () => {
		await seedSiteProject(port);
		const pageBefore = (await admin.collection('pages').getFullList())[0]!;
		const manifestBefore = (await admin.collection('vega').getFullList())[0]!;
		await admin.collections.delete('blocks');

		const result = await seedSiteProject(port);

		expect(result.createdCollections).toEqual(['blocks']);
		await expect(admin.collections.getOne('blocks')).resolves.toMatchObject({ type: 'base' });
		expect((await admin.collection('pages').getFullList())[0]?.id).toBe(pageBefore.id);
		expect((await admin.collection('vega').getFullList())[0]?.id).toBe(manifestBefore.id);
	});

	test('si falta solo blocks.images, lo añade sin tocar los demás campos', async () => {
		await seedSiteProject(port);
		const blocks = await admin.collections.getOne('blocks');
		await admin.collections.update('blocks', {
			fields: blocks.fields.filter((field) => field.name !== 'images')
		});
		const before = await admin.collections.getOne('blocks');

		const result = await seedSiteProject(port);

		expect(result.addedFields.blocks).toEqual(['images']);
		const after = await admin.collections.getOne('blocks');
		expect(after.fields.filter((field) => field.name !== 'images')).toEqual(before.fields);
		expect(after.fields.find((field) => field.name === 'images')).toMatchObject({
			type: 'relation',
			maxSelect: 99,
			required: false
		});
	});

	test('pages con otra forma aborta y conserva la instantánea lógica completa', async () => {
		await admin.collections.create({
			name: 'pages',
			type: 'base',
			fields: [{ name: 'title', type: 'number' }]
		});
		const record = await admin.collection('pages').create({ title: 7 });
		const before = await logicalSnapshot(admin);

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

		expect(await logicalSnapshot(admin)).toEqual(before);
		expect((await admin.collection('pages').getFullList()).map((item) => item.id)).toEqual([
			record.id
		]);
		const editorsMissing = await admin.collections
			.getOne('vega_editors')
			.then(() => false)
			.catch(isPocketBaseNotFound);
		expect(editorsMissing).toBe(true);
	});

	test('un manifiesto humano distinto aborta sin escribir y permanece intacto', async () => {
		await seedSiteProject(port);
		const record = (await admin.collection('vega').getFullList())[0]!;
		const humanManifest = {
			schemaVersion: 1,
			site: { name: 'Proyecto humano' },
			collections: {},
			blockTypes: {}
		};
		await admin.collection('vega').update(record.id, { manifest: humanManifest });
		const before = await logicalSnapshot(admin);

		await expect(seedSiteProject(port)).rejects.toBeInstanceOf(SiteSeedDivergenceError);

		expect(await logicalSnapshot(admin)).toEqual(before);
		expect((await admin.collection('vega').getOne(record.id)).manifest).toEqual(humanManifest);
	});

	test('una vega preexistente conserva sus reglas manuales aunque el sembrado guarde el manifiesto', async () => {
		await port.ensureCollections([VEGA_COLLECTION]);
		const manualListRule = '@request.auth.id != ""';
		const manualViewRule = 'id != ""';
		await admin.collections.update('vega', {
			listRule: manualListRule,
			viewRule: manualViewRule
		});
		const before = await admin.collections.getOne('vega');

		await seedSiteProject(port);

		const after = await admin.collections.getOne('vega');
		expect(after.listRule).toBe(manualListRule);
		expect(after.viewRule).toBe(manualViewRule);
		expect(after.fields).toEqual(before.fields);
		expect(await admin.collection('vega').getFullList()).toHaveLength(1);
	});

	test('vega_editors existente conserva campos, reglas y usuarios', async () => {
		await admin.collections.create({
			name: 'vega_editors',
			type: 'auth',
			fields: [{ name: 'displayName', type: 'text', required: true }],
			listRule: null,
			viewRule: '@request.auth.id = id'
		});
		const user = await admin.collection('vega_editors').create({
			email: 'editora@example.test',
			password: 'password-segura-123',
			passwordConfirm: 'password-segura-123',
			displayName: 'Editora'
		});
		const before = await admin.collections.getOne('vega_editors');

		await seedSiteProject(port);

		const after = await admin.collections.getOne('vega_editors');
		expect(after.fields).toEqual(before.fields);
		expect(after.listRule).toBe(before.listRule);
		expect(after.viewRule).toBe(before.viewRule);
		await expect(admin.collection('vega_editors').getOne(user.id)).resolves.toMatchObject({
			id: user.id,
			email: 'editora@example.test',
			displayName: 'Editora'
		});
	});

	test('pages conserva páginas y campos extra y añade solo la ruta canónica ausente', async () => {
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
					},
					{ name: 'ownerNote', type: 'text' }
				]
			}
		]);
		const humanPage = await admin.collection('pages').create({
			title: 'Quiénes somos',
			path: '/about',
			layout: 'content',
			status: 'published',
			ownerNote: 'No tocar'
		});

		await seedSiteProject(port);

		await expect(admin.collection('pages').getOne(humanPage.id)).resolves.toMatchObject({
			id: humanPage.id,
			path: '/about',
			ownerNote: 'No tocar'
		});
		const pages = await admin.collection('pages').getFullList({ sort: 'path' });
		expect(pages.map((page) => page.path)).toEqual(['/', '/about']);
		expect((await admin.collections.getOne('pages')).fields.map((field) => field.name)).toContain(
			'ownerNote'
		);
	});

	test('vega_editors con tipo base diverge antes de cualquier escritura', async () => {
		await admin.collections.create({
			name: 'vega_editors',
			type: 'base',
			fields: [{ name: 'legacy', type: 'text' }]
		});
		const before = await logicalSnapshot(admin);

		await expect(seedSiteProject(port)).rejects.toThrow(
			'La colección "vega_editors" ya existe como base, no como auth'
		);

		expect(await logicalSnapshot(admin)).toEqual(before);
	});

	test('pages auth falla de forma explícita aunque quede fuera de la garantía de no escritura', async () => {
		await admin.collections.create({ name: 'pages', type: 'auth', fields: [] });

		await expect(seedSiteProject(port)).rejects.toThrow(
			'La colección "pages" ya existe como auth, no como base'
		);

		await expect(admin.collections.getOne('pages')).resolves.toMatchObject({ type: 'auth' });
		await expect(admin.collections.getOne('vega_editors')).resolves.toMatchObject({
			type: 'auth'
		});
	});
});

async function logicalSnapshot(pb: SiteSeedingAdmin) {
	const allCollections = await pb.collections.getFullList();
	const nameById = new Map(allCollections.map((collection) => [collection.id, collection.name]));
	const byName = new Map(allCollections.map((collection) => [collection.name, collection]));
	const collections = Object.fromEntries(
		TOUCHED_COLLECTIONS.map((name) => {
			const collection = byName.get(name);
			return [name, collection ? collectionSnapshot(collection, nameById) : null];
		})
	);
	const records = Object.fromEntries(
		await Promise.all(
			RECORD_COLLECTIONS.map(async (name) => {
				if (!byName.has(name)) return [name, null];
				const items = await pb.collection(name).getFullList({ fields: 'id' });
				const ids = items.map((item) => item.id).sort();
				return [name, { count: ids.length, ids }];
			})
		)
	);
	return {
		collectionNames: allCollections.map((collection) => collection.name).sort(),
		collections,
		records
	};
}

function collectionSnapshot(
	collection: SiteSeedingCollectionModel,
	nameById: ReadonlyMap<string, string>
) {
	return {
		type: collection.type,
		listRule: collection.listRule ?? null,
		viewRule: collection.viewRule ?? null,
		fields: collection.fields
			.map((field) => ({
				name: field.name,
				type: field.type,
				target:
					field.type === 'relation'
						? (nameById.get(String(field.collectionId)) ?? String(field.collectionId))
						: null,
				multiple: Number(field.maxSelect ?? 0) > 1,
				required: Boolean(field.required),
				unique: hasSingleFieldUniqueIndex(collection.indexes, String(field.name))
			}))
			.sort((left, right) => left.name.localeCompare(right.name))
	};
}

function hasSingleFieldUniqueIndex(indexes: string[], fieldName: string): boolean {
	const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const fieldPattern = new RegExp(`\\(\\s*\`?${escaped}\`?\\s*\\)`, 'i');
	return indexes.some(
		(index) => /create\s+unique\s+index/i.test(index) && fieldPattern.test(index)
	);
}
