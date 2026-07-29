import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import {
	VEGA_COLLECTION,
	type CollectionRule,
	type CollectionSpec
} from '$lib/backend/collections';
import type { BackendPort } from '$lib/backend/port';
import {
	SITE_SEED_BLOCKS_READ_RULE,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_MANIFEST_READ_RULE,
	SITE_SEED_PAGES_READ_RULE,
	SiteSeedDivergenceError,
	seedSiteProject
} from '$lib/backend/site-seeding';
import { VEGA_MEDIA_EDITOR_ACCESS_RULE, VEGA_MEDIA_VIEW_RULE } from '$lib/media/media-collection';
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
		const pagesCollection = collections.find((collection) => collection.name === 'pages')!;
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
		expect(rawRules(pagesCollection)).toEqual({
			listRule: SITE_SEED_PAGES_READ_RULE,
			viewRule: SITE_SEED_PAGES_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(rawRules(blocks)).toEqual({
			listRule: SITE_SEED_BLOCKS_READ_RULE,
			viewRule: SITE_SEED_BLOCKS_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(rawRules(media)).toEqual({
			listRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
			viewRule: VEGA_MEDIA_VIEW_RULE,
			createRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
			updateRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
			deleteRule: VEGA_MEDIA_EDITOR_ACCESS_RULE
		});

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

	test('anónimo publica sin enumerar medios y editor obtiene CRUD de contenido', async () => {
		await seedSiteProject(port);
		const published = await admin.collection('pages').create({
			title: 'Publicada',
			path: '/publicada',
			layout: 'default',
			status: 'published'
		});
		const draft = await admin.collection('pages').create({
			title: 'Borrador privado',
			path: '/borrador',
			layout: 'default',
			status: 'draft'
		});
		const publishedMediaForm = pngFormData('publicada.png', {
			alt: 'Alt público',
			title: 'Título público',
			tags: JSON.stringify(['publicada'])
		});
		const publishedMedia = await admin.collection('vega_media').create(publishedMediaForm);
		await admin.collection('blocks').create({
			parent: published.id,
			order: 1,
			type: 'image',
			data: { caption: 'Visible' },
			image: publishedMedia.id
		});
		await admin.collection('blocks').create({
			parent: draft.id,
			order: 1,
			type: 'richtext',
			data: { html: '<p>Privado</p>' }
		});

		const anonymousPages = await requestJson(
			running!,
			'/api/collections/pages/records?perPage=100'
		);
		expect(anonymousPages.status).toBe(200);
		expect(recordItems(anonymousPages.body).map((record) => record.id)).toEqual([published.id]);

		const anonymousDraft = await requestJson(
			running!,
			`/api/collections/pages/records/${draft.id}`
		);
		expect(anonymousDraft.status).toBe(404);

		const anonymousCreate = await requestJson(running!, '/api/collections/pages/records', {
			method: 'POST',
			headers: jsonHeaders(),
			body: JSON.stringify({
				title: 'Intrusa',
				path: '/intrusa',
				layout: 'default',
				status: 'published'
			})
		});
		// Medido contra PocketBase real: ante una `createRule` que no casa, responde 400, NO 403.
		// Lo que hace que esta afirmación signifique algo no es el código en sí, sino su pareja de
		// más abajo: la editora manda un cuerpo de la misma forma y obtiene 200. Rechazo por
		// identidad, no por cuerpo mal formado.
		expect(anonymousCreate.status).toBe(400);

		const anonymousMediaList = await requestJson(
			running!,
			'/api/collections/vega_media/records?perPage=100'
		);
		// Medido contra PocketBase real: NO devuelve 403. Solo lo hace cuando la `listRule` es
		// `null` (`apis/record_crud.go:52`); con un FILTRO responde 200 y lo aplica, así que un
		// anónimo recibe una lista VACÍA. La propiedad que importa no es el código de estado, es
		// que no se pueda enumerar la biblioteca: por eso se afirma que no vuelve NI UN registro,
		// existiendo uno. Es más fuerte que el 403 que había aquí.
		expect(anonymousMediaList.status).toBe(200);
		expect(recordItems(anonymousMediaList.body)).toEqual([]);
		const anonymousMediaView = await requestJson(
			running!,
			`/api/collections/vega_media/records/${publishedMedia.id}`
		);
		expect(anonymousMediaView.status).toBe(200);
		expect(anonymousMediaView.body).toMatchObject({
			id: publishedMedia.id,
			alt: 'Alt público',
			title: 'Título público'
		});

		const publishedFilter = new URLSearchParams({
			perPage: '100',
			filter: `parent = "${published.id}"`,
			expand: 'image'
		});
		const anonymousPublishedBlocks = await requestJson(
			running!,
			`/api/collections/blocks/records?${publishedFilter}`
		);
		expect(anonymousPublishedBlocks.status).toBe(200);
		const [expandedBlock] = recordItems(anonymousPublishedBlocks.body);
		expect(expandedBlock?.expand).toMatchObject({
			image: { id: publishedMedia.id }
		});

		const draftFilter = new URLSearchParams({
			perPage: '100',
			filter: `parent = "${draft.id}"`
		});
		const anonymousDraftBlocks = await requestJson(
			running!,
			`/api/collections/blocks/records?${draftFilter}`
		);
		expect(anonymousDraftBlocks.status).toBe(200);
		expect(recordItems(anonymousDraftBlocks.body)).toEqual([]);

		await admin.collection('vega_editors').create({
			email: 'editora@example.test',
			password: 'password-segura-123',
			passwordConfirm: 'password-segura-123'
		});
		const auth = await requestJson(running!, '/api/collections/vega_editors/auth-with-password', {
			method: 'POST',
			headers: jsonHeaders(),
			body: JSON.stringify({
				identity: 'editora@example.test',
				password: 'password-segura-123'
			})
		});
		expect(auth.status).toBe(200);
		const token = String((auth.body as Record<string, unknown> | null)?.token ?? '');
		expect(token).not.toBe('');

		const editorDraft = await requestJson(running!, `/api/collections/pages/records/${draft.id}`, {
			headers: { Authorization: token }
		});
		expect(editorDraft.status).toBe(200);
		const editorMediaList = await requestJson(
			running!,
			'/api/collections/vega_media/records?perPage=100',
			{ headers: { Authorization: token } }
		);
		expect(editorMediaList.status).toBe(200);

		const editorPage = await requestJson(running!, '/api/collections/pages/records', {
			method: 'POST',
			headers: jsonHeaders(token),
			body: JSON.stringify({
				title: 'Página de editora',
				path: '/editora',
				layout: 'default',
				status: 'draft'
			})
		});
		expect(editorPage.status).toBe(200);
		const editorPageId = String((editorPage.body as Record<string, unknown> | null)?.id ?? '');
		const editorPageUpdate = await requestJson(
			running!,
			`/api/collections/pages/records/${editorPageId}`,
			{
				method: 'PATCH',
				headers: jsonHeaders(token),
				body: JSON.stringify({ title: 'Página editada' })
			}
		);
		expect(editorPageUpdate.status).toBe(200);

		const editorBlock = await requestJson(running!, '/api/collections/blocks/records', {
			method: 'POST',
			headers: jsonHeaders(token),
			body: JSON.stringify({
				parent: editorPageId,
				order: 1,
				type: 'richtext',
				data: { html: '<p>Editor</p>' }
			})
		});
		expect(editorBlock.status).toBe(200);
		const editorBlockId = String((editorBlock.body as Record<string, unknown> | null)?.id ?? '');
		expect(
			(
				await requestJson(running!, `/api/collections/blocks/records/${editorBlockId}`, {
					method: 'PATCH',
					headers: jsonHeaders(token),
					body: JSON.stringify({ order: 2 })
				})
			).status
		).toBe(200);
		expect(
			(
				await requestJson(running!, `/api/collections/blocks/records/${editorBlockId}`, {
					method: 'DELETE',
					headers: { Authorization: token }
				})
			).status
		).toBe(204);

		const editorMedia = await requestJson(running!, '/api/collections/vega_media/records', {
			method: 'POST',
			headers: { Authorization: token },
			body: pngFormData('editora.png', { alt: 'Editora' })
		});
		expect(editorMedia.status).toBe(200);
		const editorMediaId = String((editorMedia.body as Record<string, unknown> | null)?.id ?? '');
		expect(
			(
				await requestJson(running!, `/api/collections/vega_media/records/${editorMediaId}`, {
					method: 'PATCH',
					headers: jsonHeaders(token),
					body: JSON.stringify({ title: 'Editado' })
				})
			).status
		).toBe(200);
		expect(
			(
				await requestJson(running!, `/api/collections/vega_media/records/${editorMediaId}`, {
					method: 'DELETE',
					headers: { Authorization: token }
				})
			).status
		).toBe(204);

		expect(
			(
				await requestJson(running!, `/api/collections/pages/records/${editorPageId}`, {
					method: 'DELETE',
					headers: { Authorization: token }
				})
			).status
		).toBe(204);
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

	test('pages preexistente con lectura denegada y blocks ausente aborta antes de escribir', async () => {
		await port.ensureCollections([pagesCollectionSpec(null)]);
		const before = await logicalSnapshot(admin);

		await expect(seedSiteProject(port)).rejects.toThrow(
			'lectura de "pages" denegada; "blocks" quedaría imposible de listar'
		);

		expect(await logicalSnapshot(admin)).toEqual(before);
		expect(
			await admin.collections
				.getOne('blocks')
				.then(() => false)
				.catch(isPocketBaseNotFound)
		).toBe(true);
		expect(
			await admin.collections
				.getOne('vega_editors')
				.then(() => false)
				.catch(isPocketBaseNotFound)
		).toBe(true);

		await admin.collections.update('pages', { listRule: '' });
		await expect(seedSiteProject(port)).resolves.toMatchObject({
			createdCollections: expect.arrayContaining(['blocks'])
		});
		await expect(admin.collections.getOne('blocks')).resolves.toMatchObject({ type: 'base' });
	});

	test.each([
		['permitida', ''],
		['condicional', '@request.auth.id != ""']
	] as const)('pages preexistente con lectura %s permite crear blocks', async (_name, listRule) => {
		await port.ensureCollections([pagesCollectionSpec(listRule)]);

		await expect(seedSiteProject(port)).resolves.toMatchObject({
			createdCollections: expect.arrayContaining(['blocks'])
		});
		await expect(admin.collections.getOne('blocks')).resolves.toMatchObject({ type: 'base' });
	});

	test('blocks preexistente y pages ausente no dispara un aborto simétrico', async () => {
		await admin.collections.create({ name: 'blocks', type: 'base', fields: [] });

		await expect(seedSiteProject(port)).resolves.toMatchObject({
			createdCollections: expect.arrayContaining(['pages'])
		});
		await expect(admin.collections.getOne('pages')).resolves.toMatchObject({ type: 'base' });
		await expect(admin.collections.getOne('blocks')).resolves.toMatchObject({ type: 'base' });
	});

	test('pages preexistente conserva sus cinco reglas byte por byte', async () => {
		await port.ensureCollections([
			{
				...pagesCollectionSpec('@request.auth.id != ""'),
				viewRule: '',
				createRule: null,
				updateRule: '@request.auth.collectionName = "legacy_editors"',
				deleteRule: 'status = "draft"'
			}
		]);
		const before = rawRules(await admin.collections.getOne('pages'));

		await seedSiteProject(port);

		expect(rawRules(await admin.collections.getOne('pages'))).toEqual(before);
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
			// Lectura abierta a propósito: sin ella salta ADEMÁS la precondición de instalación
			// mixta y este test dejaría de aislar lo que quiere probar, que es la divergencia de
			// FORMA. Esa precondición ya tiene su propio test en este mismo fichero.
			listRule: '',
			viewRule: '',
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
				// Una `pages` ajena con la lectura DENEGADA ya no se puede completar: la precondición
				// de instalación mixta aborta antes de crear `blocks`, porque con `pages` cerrada
				// PocketBase no podría listar la colección cruzada. Aquí se le da lectura para probar
				// lo que este test quiere probar, que es que se conservan las páginas y los campos
				// ajenos.
				listRule: '',
				viewRule: '',
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

function rawRules(collection: SiteSeedingCollectionModel) {
	return {
		listRule: collection.listRule ?? null,
		viewRule: collection.viewRule ?? null,
		createRule: collection.createRule ?? null,
		updateRule: collection.updateRule ?? null,
		deleteRule: collection.deleteRule ?? null
	};
}

function pagesCollectionSpec(listRule: CollectionRule): CollectionSpec {
	return {
		name: 'pages',
		listRule,
		viewRule: listRule,
		createRule: SITE_SEED_EDITOR_ACCESS_RULE,
		updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
		deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
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
	};
}

type JsonBody = Record<string, unknown> | null;

async function requestJson(
	running: RunningPocketBase,
	path: string,
	init?: RequestInit
): Promise<{ status: number; body: JsonBody }> {
	const response = await fetch(`${running.url}${path}`, init);
	const text = await response.text();
	return {
		status: response.status,
		body: text ? (JSON.parse(text) as Record<string, unknown>) : null
	};
}

function recordItems(body: JsonBody): Array<Record<string, unknown>> {
	const items = body?.items;
	return Array.isArray(items)
		? items.filter(
				(item): item is Record<string, unknown> => typeof item === 'object' && item !== null
			)
		: [];
}

function jsonHeaders(token?: string): Record<string, string> {
	return token
		? { 'Content-Type': 'application/json', Authorization: token }
		: { 'Content-Type': 'application/json' };
}

function pngFormData(filename: string, fields: Record<string, string>): FormData {
	const bytes = Uint8Array.from(
		atob(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
		),
		(char) => char.charCodeAt(0)
	);
	const form = new FormData();
	form.append('file', new Blob([bytes], { type: 'image/png' }), filename);
	for (const [key, value] of Object.entries(fields)) form.append(key, value);
	return form;
}
