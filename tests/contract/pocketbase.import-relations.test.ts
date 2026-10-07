import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { resolveContentModel } from '$lib/model/resolve';
import { buildImportPreview, runImport } from '$lib/transfer/import-collection';
import type { TransferRecord } from '$lib/transfer/record-serializer';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';

describe.skipIf(!isPocketBaseBinaryAvailable())(
	'importar relaciones cíclicas — PocketBase real',
	() => {
		let running: RunningPocketBase;
		let admin: SiteSeedingAdmin;

		beforeAll(async () => {
			running = await startPocketBase();
			admin = await createSiteSeedingAdmin(running);
		}, 30_000);

		afterAll(async () => {
			await running?.stop();
		});

		async function fixture(name: string, required = false) {
			const collection = await admin.collections.create({
				name,
				type: 'base',
				fields: [{ name: 'title', type: 'text' }]
			});
			await admin.collections.update(collection.id, {
				fields: [
					...collection.fields,
					{ name: 'refs', type: 'relation', collectionId: collection.id, maxSelect: 99, required }
				]
			});
			const port = createPocketBaseBackend({ url: running.url });
			await port.login({ email: running.adminEmail, password: running.adminPassword });
			const model = resolveContentModel({
				types: await port.listContentTypes(),
				manifestRaw: null
			});
			// El actor del test es superuser; las reglas null no restringen sus permisos.
			const type = { ...model.types.find((t) => t.name === name)!, permissions: ALL_PERMISSIONS };
			const preview = (records: TransferRecord[]) =>
				buildImportPreview(port, [{ contentType: type, collection: { type: name, records } }]);
			return { port, preview };
		}

		test('autorreferencia opcional conserva id y relación', async () => {
			const { port, preview } = await fixture('import_self');
			const id = 'self00000000001';
			const report = await runImport(
				port,
				await preview([{ id, values: { title: 'Self', refs: [id] } }]),
				{ overwriteConfirmed: false }
			);
			expect(report).toMatchObject({ success: true, createdCount: 1, failedCount: 0 });
			expect(await admin.collection('import_self').getOne(id)).toMatchObject({ id, refs: [id] });
		});

		test('ciclo opcional de dos conserva los dos ids y relaciones', async () => {
			const { port, preview } = await fixture('import_cycle');
			const a = 'cycle0000000001';
			const b = 'cycle0000000002';
			const report = await runImport(
				port,
				await preview([
					{ id: a, values: { title: 'A', refs: [b] } },
					{ id: b, values: { title: 'B', refs: [a] } }
				]),
				{ overwriteConfirmed: false }
			);
			expect(report).toMatchObject({ success: true, createdCount: 2, failedCount: 0 });
			expect(await admin.collection('import_cycle').getOne(a)).toMatchObject({ id: a, refs: [b] });
			expect(await admin.collection('import_cycle').getOne(b)).toMatchObject({ id: b, refs: [a] });
		});

		test('dos colecciones: crea primero la que permite diferir y no actualiza la otra', async () => {
			const a = await admin.collections.create({ name: 'import_cut_a', type: 'base', fields: [] });
			const b = await admin.collections.create({
				name: 'import_cut_b',
				type: 'base',
				fields: [{ name: 'ref', type: 'relation', collectionId: a.id, maxSelect: 1 }]
			});
			await admin.collections.update(a.id, {
				fields: [...a.fields, { name: 'ref', type: 'relation', collectionId: b.id, maxSelect: 1 }]
			});
			const backend = createPocketBaseBackend({ url: running.url });
			await backend.login({ email: running.adminEmail, password: running.adminPassword });
			const model = resolveContentModel({
				types: await backend.listContentTypes(),
				manifestRaw: null
			});
			const writes: string[] = [];
			const port = {
				...backend,
				create: (async (type, values, options) => {
					writes.push(`create:${type}`);
					return backend.create(type, values, options);
				}) as typeof backend.create,
				update: (async (type, id, values, options) => {
					if (type === a.name) throw new Error('A no permite update');
					writes.push(`update:${type}`);
					return backend.update(type, id, values, options);
				}) as typeof backend.update
			};
			const aid = 'cut000000000001';
			const bid = 'cut000000000002';
			const preview = await buildImportPreview(
				port,
				[a, b].map((c) => ({
					contentType: {
						...model.types.find((t) => t.name === c.name)!,
						permissions: { ...ALL_PERMISSIONS, update: c.id === b.id }
					},
					collection: {
						type: c.name,
						records: [{ id: c.id === a.id ? aid : bid, values: { ref: c.id === a.id ? bid : aid } }]
					}
				}))
			);
			expect(await runImport(port, preview, { overwriteConfirmed: false })).toMatchObject({
				success: true,
				createdCount: 2,
				failedCount: 0
			});
			expect(writes).toEqual(['create:import_cut_b', 'create:import_cut_a', 'update:import_cut_b']);
			expect(await admin.collection(a.name).getOne(aid)).toMatchObject({ id: aid, ref: bid });
			expect(await admin.collection(b.name).getOne(bid)).toMatchObject({ id: bid, ref: aid });
		});

		test('frontera required: no se puede crear sin relación ni apuntar a un destino futuro', async () => {
			const { port, preview } = await fixture('import_required', true);
			await expect(
				port.create('import_required', { title: 'Vacío' }, { id: 'required0000001' })
			).rejects.toMatchObject({ kind: 'validation' });
			await expect(
				port.create(
					'import_required',
					{ title: 'Futuro', refs: ['required0000002'] },
					{ id: 'required0000001' }
				)
			).rejects.toMatchObject({ kind: 'validation' });
			expect((await admin.collection('import_required').getList()).totalItems).toBe(0);
			const plan = await preview([
				{ id: 'required0000001', values: { title: 'A', refs: ['required0000002'] } },
				{ id: 'required0000002', values: { title: 'B', refs: ['required0000001'] } }
			]);
			expect(plan.collections[0].entries.map((e) => e.reasons)).toEqual([
				[{ kind: 'required-relation-cycle' }],
				[{ kind: 'required-relation-cycle' }]
			]);
			expect(await runImport(port, plan, { overwriteConfirmed: true })).toMatchObject({
				createdCount: 0,
				skippedCount: 2,
				failedCount: 0,
				success: false
			});
			expect((await admin.collection('import_required').getList()).totalItems).toBe(0);
		});
		test('fallo de enlazado conserva el registro y el reintento fresco exige PISA', async () => {
			const { port, preview } = await fixture('import_retry');
			const id = 'retry0000000001';
			const records = [{ id, values: { title: 'Original', refs: [id] } }];
			const first = await preview(records);
			const failed = await runImport(
				{
					...port,
					update: async () => {
						throw new Error('enlazado rechazado');
					}
				},
				first,
				{ overwriteConfirmed: false }
			);
			expect(failed).toMatchObject({ createdCount: 0, failedCount: 1, success: false });
			expect(failed.outcomes[0]).toMatchObject({ id, status: 'failed', partialWrite: 'created' });
			expect(await admin.collection('import_retry').getOne(id)).toMatchObject({
				title: 'Original',
				refs: []
			});
			const fresh = await preview(records);
			expect(fresh.collections[0].entries[0].status).toBe('overwrite');
			expect(await runImport(port, fresh, { overwriteConfirmed: false })).toMatchObject({
				skippedCount: 1,
				updatedCount: 0
			});
			expect(await runImport(port, fresh, { overwriteConfirmed: true })).toMatchObject({
				updatedCount: 1,
				failedCount: 0,
				success: true
			});
			expect(await admin.collection('import_retry').getOne(id)).toMatchObject({
				id,
				title: 'Original',
				refs: [id]
			});
		});
	}
);
