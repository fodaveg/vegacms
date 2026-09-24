/**
 * ¿Sabe Vega si el servidor publica lo programado (`extensions/vegaschedule`)? Contra el binario
 * OFICIAL de PocketBase, que es el que usa la imagen de Vega y el que NO tiene el cron: aquí el
 * resultado correcto es `'inactive'`, y el fallo silencioso que se evita es anunciar «Programada»
 * en un servidor que nunca publicará la página.
 *
 * Cubre las dos mitades: el superusuario lo pregunta a `GET /api/crons`, y el editor (que no puede)
 * lo lee del `vega.schemaSnapshot` que dejó escrito el superusuario.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend/port';
import type { ContentType } from '$lib/backend/types';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { loadContentModel } from '$lib/model/load';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

const AVAILABLE = isPocketBaseBinaryAvailable();
const EDITOR_EMAIL = 'editora@vega.test';
const EDITOR_PASSWORD = 'contraseña-de-editora';

describe.skipIf(!AVAILABLE)(
	'publicación programada contra PocketBase real (sin vegaschedule)',
	() => {
		let running: RunningPocketBase | undefined;
		let admin: SiteSeedingAdmin;
		let superuser: BackendPort;

		beforeEach(async () => {
			running = await startPocketBase();
			admin = await createSiteSeedingAdmin(running);
			superuser = createPocketBaseBackend({ url: running.url });
			await superuser.login({ email: running.adminEmail, password: running.adminPassword });
		}, 30_000);

		afterEach(async () => {
			await running?.stop();
			running = undefined;
		});

		async function editorPort(): Promise<BackendPort> {
			const port = createPocketBaseBackend({ url: running!.url, authCollection: 'vega_editors' });
			await port.login({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
			return port;
		}

		async function createEditor(): Promise<void> {
			await admin.collection('vega_editors').create({
				email: EDITOR_EMAIL,
				password: EDITOR_PASSWORD,
				passwordConfirm: EDITOR_PASSWORD,
				verified: true
			});
		}

		test('GET /api/crons: solo superusuario, y el binario oficial no trae el job', async () => {
			const anonymous = await fetch(`${running!.url}/api/crons`);
			expect(anonymous.status).toBe(401);

			await seedSiteProject(superuser);
			await createEditor();
			const editorToken = (
				await (
					await fetch(`${running!.url}/api/collections/vega_editors/auth-with-password`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ identity: EDITOR_EMAIL, password: EDITOR_PASSWORD })
					})
				).json()
			).token as string;
			const asEditor = await fetch(`${running!.url}/api/crons`, {
				headers: { Authorization: editorToken }
			});
			expect(asEditor.status).toBe(403);

			const jobs = (await admin.send('/api/crons', { method: 'GET' })) as Array<{ id: string }>;
			expect(jobs.map((job) => job.id)).not.toContain('vegaschedule');
			expect(jobs.length).toBeGreaterThan(0);

			await expect(superuser.scheduledPublishing!()).resolves.toBe('inactive');
		});

		test('el superusuario lo deja escrito y el editor lo lee: inactiva en los dos lados', async () => {
			await seedSiteProject(superuser);
			await createEditor();

			const superModel = await loadContentModel(superuser);
			expect(superModel.types.find((t) => t.name === 'pages')?.publishAtField).toBe('publishAt');
			expect(superModel.scheduledPublishing).toBe('inactive');

			const [vegaRecord] = await admin.collection('vega').getFullList();
			const snapshot = vegaRecord.schemaSnapshot as ContentType[];
			expect(snapshot.find((t) => t.name === 'vega')?.serverFeatures).toEqual({
				scheduledPublishing: false
			});

			const editor = await editorPort();
			await expect(editor.scheduledPublishing!()).resolves.toBe('inactive');
			const editorModel = await loadContentModel(editor);
			expect(editorModel.types.find((t) => t.name === 'pages')?.publishAtField).toBe('publishAt');
			expect(editorModel.scheduledPublishing).toBe('inactive');
		});

		test('un snapshot anterior a esta comprobación: el editor ve unknown, no inactive ni active', async () => {
			await seedSiteProject(superuser);
			await createEditor();
			const [vegaRecord] = await admin.collection('vega').getFullList();
			const legacy = (vegaRecord.schemaSnapshot as ContentType[]).map((type) => {
				const { serverFeatures: _dropped, ...rest } = type;
				void _dropped;
				return rest;
			});
			await admin.collection('vega').update(vegaRecord.id, { schemaSnapshot: legacy });

			const editor = await editorPort();
			await expect(editor.scheduledPublishing!()).resolves.toBe('unknown');
			expect((await loadContentModel(editor)).scheduledPublishing).toBe('unknown');

			// La siguiente entrada de un superusuario lo vuelve a dejar escrito.
			await loadContentModel(superuser);
			const [after] = await admin.collection('vega').getFullList();
			expect(
				(after.schemaSnapshot as ContentType[]).find((t) => t.name === 'vega')?.serverFeatures
			).toEqual({ scheduledPublishing: false });
		});
	}
);
