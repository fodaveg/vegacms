/** Carpetas reales: permisos privados, filtro, unicidad, actualización aditiva y snapshot editor. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend/port';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { ensureMediaCollection } from '$lib/media/media-collection';
import { ensureMediaFolders, mediaFoldersState, loadMediaFolders } from '$lib/media/media-folders';
import { buildMediaListQuery } from '$lib/media/media-query';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

describe.skipIf(!isPocketBaseBinaryAvailable())('carpetas de medios en PocketBase real', () => {
	let running: RunningPocketBase, admin: SiteSeedingAdmin, port: BackendPort;
	beforeEach(async () => {
		running = await startPocketBase();
		admin = await createSiteSeedingAdmin(running);
		port = createPocketBaseBackend({ url: running.url });
		await port.login({ email: running.adminEmail, password: running.adminPassword });
	}, 30_000);
	afterEach(async () => {
		await running?.stop();
	});
	const file = () => new File(['%PDF-1.4\nmedia'], 'media.pdf', { type: 'application/pdf' });
	test('semilla incluye ambas piezas; editores gestionan y filtran pero anónimos no ven carpetas', async () => {
		await seedSiteProject(port);
		expect(mediaFoldersState(await port.listContentTypes())).toBe('ready');
		const collection = await admin.collections.getOne('vega_media_folders');
		for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
			expect(collection[key]).toBe('@request.auth.collectionName = "vega_editors"');
		const media = await admin.collections.getOne('vega_media');
		expect(media.fields.find((f) => f.name === 'folder')).toMatchObject({
			collectionId: collection.id,
			required: false,
			cascadeDelete: false,
			maxSelect: 1
		});
		const manifest = (await admin.collection('vega').getList(1, 1)).items[0]!;
		expect(manifest.schemaSnapshot.map((t: { name: string }) => t.name)).toEqual(
			expect.arrayContaining(['vega_media_folders', 'vega_media'])
		);
		expect(
			manifest.schemaSnapshot
				.find((t: { name: string }) => t.name === 'vega_media')
				.fields.some((f: { name: string }) => f.name === 'folder')
		).toBe(true);
		await admin.collection('vega_editors').create({
			email: 'editor@vega.test',
			password: 'correct-password123',
			passwordConfirm: 'correct-password123'
		});
		const editor = createPocketBaseBackend({ url: running.url, authCollection: 'vega_editors' });
		await editor.login({ email: 'editor@vega.test', password: 'correct-password123' });
		expect(mediaFoldersState(await editor.listContentTypes())).toBe('ready');
		const folder = await editor.create('vega_media_folders', { name: 'Viajes' });
		await expect(editor.create('vega_media_folders', { name: 'Viajes' })).rejects.toMatchObject({
			kind: 'validation'
		});
		await editor.update('vega_media_folders', folder.id, { name: 'Retratos' });
		const item = await editor.create('vega_media', {
			file: file(),
			folder: folder.id,
			title: 'Mar'
		});
		await editor.create('vega_media', { file: file(), title: 'Mar libre' });
		expect(
			(
				await editor.list(
					'vega_media',
					buildMediaListQuery(1, { folder: folder.id, search: 'Mar' })
				)
			).items.map((i) => i.id)
		).toEqual([item.id]);
		expect(
			(await editor.list('vega_media', buildMediaListQuery(1, { folder: 'none' }))).totalItems
		).toBe(1);
		expect(await loadMediaFolders(editor)).toEqual([{ id: folder.id, name: 'Retratos' }]);
		const publicList = await fetch(`${running.url}/api/collections/vega_media_folders/records`);
		expect((await publicList.json()).items).toEqual([]);
		expect(
			(await fetch(`${running.url}/api/collections/vega_media_folders/records/${folder.id}`)).status
		).toBe(404);
		await editor.delete('vega_media_folders', folder.id);
		const kept = await editor.get('vega_media', item.id);
		expect(kept.values.folder).toBeNull();
		expect(kept.values.file).toBe(item.values.file);
		expect(
			(
				await fetch(
					port.fileUrl({ type: 'vega_media', id: item.id }, 'file', item.values.file as string)
				)
			).status
		).toBe(200);
	});
	test('actualizar biblioteca conserva ids, binarios, metadatos y reglas personalizadas', async () => {
		await ensureMediaCollection(port);
		const old = await port.create('vega_media', {
			file: file(),
			alt: 'Alternativo',
			title: 'Original',
			tags: ['conservar'],
			focal: { x: 0.4, y: 0.6 }
		});
		const collection = await admin.collections.getOne('vega_media');
		await admin.collections.update(collection.id, {
			listRule: '@request.auth.id != ""',
			updateRule: null
		});
		const before = await admin.collections.getOne(collection.id);
		await ensureMediaFolders(port);
		await ensureMediaFolders(port);
		const after = await admin.collections.getOne(collection.id);
		for (const key of ['id', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
			expect(after[key]).toEqual(before[key]);
		expect(after.fields.filter((f) => f.name !== 'folder')).toEqual(before.fields);
		const record = await port.get('vega_media', old.id);
		expect(record.values).toMatchObject({ ...old.values, folder: null });
	});
});
