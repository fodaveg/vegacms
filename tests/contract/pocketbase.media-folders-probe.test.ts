/** Sonda previa: relación añadida con medios existentes y borrado de una carpeta con2000medios. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { ensureMediaCollection } from '$lib/media/media-collection';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

describe.skipIf(!isPocketBaseBinaryAvailable())('sonda de carpetas en biblioteca real', () => {
	let running: RunningPocketBase;
	let admin: SiteSeedingAdmin;
	beforeAll(async () => {
		running = await startPocketBase();
		admin = await createSiteSeedingAdmin(running);
	}, 30_000);
	afterAll(async () => {
		await running?.stop();
	});
	test('añadir relación conserva datos y borrar2000referencias vacía folder sin borrar archivos', async () => {
		const port = createPocketBaseBackend({ url: running.url });
		await port.login({ email: running.adminEmail, password: running.adminPassword });
		await ensureMediaCollection(port);
		const file = () => new File(['%PDF-1.4\nprobe'], 'prueba.pdf', { type: 'application/pdf' });
		const original = await port.create('vega_media', {
			file: file(),
			alt: 'Anterior',
			title: 'Antes',
			focal: { x: 0.2, y: 0.3 }
		});
		const collectionBefore = await admin.collections.getOne('vega_media');
		const folderCollection = await admin.collections.create({
			name: 'vega_media_folders',
			type: 'base',
			fields: [{ name: 'name', type: 'text' }]
		});
		await port.addCollectionFields('vega_media', [
			{
				name: 'folder',
				type: 'relation',
				target: folderCollection.name,
				multiple: false,
				cascadeDelete: false
			}
		]);
		const after = await port.get('vega_media', original.id);
		expect(after.values).toMatchObject({
			alt: 'Anterior',
			title: 'Antes',
			focal: { x: 0.2, y: 0.3 },
			folder: null
		});
		expect(after.values.file).toEqual(original.values.file);
		const collectionAfter = await admin.collections.getOne('vega_media');
		for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'] as const)
			expect(collectionAfter[key]).toEqual(collectionBefore[key]);
		expect(collectionAfter.fields.filter((field) => field.name !== 'folder')).toEqual(
			collectionBefore.fields
		);
		const folder = await admin.collection('vega_media_folders').create({ name: 'Prueba2000' });
		const started = performance.now();
		for (let i = 0; i < 2000; i++)
			await port.create('vega_media', { file: file(), title: `Archivo ${i}`, folder: folder.id });
		const deleting = performance.now();
		await admin.collection('vega_media_folders').delete(folder.id);
		const elapsed = performance.now() - deleting;
		const remaining = await port.list('vega_media', { perPage: 1 });
		expect(remaining.totalItems).toBe(2001);
		expect(
			(
				await port.list('vega_media', {
					perPage: 1,
					filter: { kind: 'cond', field: 'folder', op: 'empty', value: null }
				})
			).totalItems
		).toBe(2001);
		const metrics = {
			probe: 'media-folders-2000',
			records: 2000,
			createMilliseconds: deleting - started,
			deleteMilliseconds: elapsed
		};
		if (process.env.VEGA_MEDIA_FOLDERS_METRICS)
			writeFileSync(process.env.VEGA_MEDIA_FOLDERS_METRICS, JSON.stringify(metrics, null, 2));
		console.info(JSON.stringify(metrics));
	}, 30_000);
});
