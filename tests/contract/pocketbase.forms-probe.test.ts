/** Sondas previas: semántica nativa de límites, PATCH de listas y consentimiento obligatorio. */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { previewSiteSeed, seedSiteProject } from '$lib/backend/site-seeding';
import { SITE_SEED_OPTIONAL_MODULES } from '$lib/backend/site-seeding-modules';
import { buildFormInbox } from '$lib/forms/form-inbox';
import { newFieldDraft } from '$lib/model/editor/field-draft';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	createPocketBaseInstanceDir,
	createPocketBaseSuperuser,
	startPocketBaseServerOn,
	destroyPocketBaseInstanceDir,
	type PocketBaseInstanceDir,
	type PocketBaseServerHandle
} from './pb-harness/server';
let instance: PocketBaseInstanceDir;
let server: PocketBaseServerHandle;
let token = '';
let editor = '';
async function api(method: string, route: string, body?: object, auth = token) {
	const res = await fetch(`${server.url}/api/${route}`, {
		method,
		headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	const raw = await res.text();
	return { status: res.status, body: raw ? JSON.parse(raw) : {} };
}
beforeAll(async () => {
	instance = createPocketBaseInstanceDir();
	await createPocketBaseSuperuser(instance.dataDir);
	const hooks = path.join(instance.dataDir, 'hooks');
	mkdirSync(hooks);
	writeFileSync(
		path.join(hooks, 'probe.pb.js'),
		'onRecordCreateRequest((e)=>{if(e.record.collection().fields.getByName("probe")) e.record.set("probe","seen");e.next();});'
	);
	server = await startPocketBaseServerOn(instance, { hooksDir: hooks });
	token = (
		await api(
			'POST',
			'collections/_superusers/auth-with-password',
			{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
			''
		)
	).body.token;
	await api('POST', 'collections', {
		name: 'vega_editors',
		type: 'auth',
		passwordAuth: { enabled: true, identityFields: ['email'] }
	});
	await api('POST', 'collections/vega_editors/records', {
		email: 'editor@vega.test',
		password: 'test-password-1',
		passwordConfirm: 'test-password-1'
	});
	editor = (
		await api(
			'POST',
			'collections/vega_editors/auth-with-password',
			{ identity: 'editor@vega.test', password: 'test-password-1' },
			''
		)
	).body.token;
	for (const name of ['inscripciones', 'other'])
		expect(
			(
				await api('POST', 'collections', {
					name,
					type: 'base',
					createRule: '',
					fields: [
						{ name: 'consent', type: 'bool', required: true },
						{ name: 'probe', type: 'text' }
					]
				})
			).status
		).toBe(200);
});
afterAll(async () => {
	await server?.stop();
	if (instance) destroyPocketBaseInstanceDir(instance);
});
test('bool required rechaza false; callback sin filtro alcanza ambas colecciones', async () => {
	expect(
		(await api('POST', 'collections/inscripciones/records', { consent: false }, '')).status
	).toBe(400);
	for (const collection of ['inscripciones', 'other']) {
		const res = await api('POST', `collections/${collection}/records`, { consent: true }, '');
		expect(res.status).toBe(200);
		expect(res.body.probe).toBe('seen');
	}
});
test('PATCH rules reemplaza la lista; regla guest limita sexto anónimo y conserva editor', async () => {
	const unrelated = { label: 'users:auth', audience: '', maxRequests: 10, duration: 60 };
	const own = { label: 'inscripciones:create', audience: '@guest', maxRequests: 5, duration: 60 };
	expect(
		(await api('PATCH', 'settings', { rateLimits: { enabled: true, rules: [unrelated] } })).status
	).toBe(200);
	expect((await api('PATCH', 'settings', { rateLimits: { rules: [own] } })).status).toBe(200);
	const replaced = (await api('GET', 'settings')).body.rateLimits.rules;
	expect(replaced).toHaveLength(1);
	expect(replaced[0].label).toBe('inscripciones:create');
	expect(
		(await api('PATCH', 'settings', { rateLimits: { enabled: true, rules: [unrelated, own] } }))
			.status
	).toBe(200);
	const statuses = [];
	for (let i = 0; i < 6; i++)
		statuses.push(
			(await api('POST', 'collections/inscripciones/records', { consent: true }, '')).status
		);
	expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
	for (let i = 0; i < 6; i++)
		expect(
			(await api('POST', 'collections/inscripciones/records', { consent: true }, editor)).status
		).toBe(200);
	expect(
		(await api('GET', 'settings')).body.rateLimits.rules.some(
			(rule: { label: string }) => rule.label === 'users:auth'
		)
	).toBe(true);
});

test('custom users: new forms and modules work without changing auth or redirecting raw rules', async () => {
	// PocketBase's initial migration already provides users; do not recreate or reconfigure it.
	const existingUsers = await api('GET', 'collections/users');
	expect(existingUsers.status).toBe(200);
	expect(existingUsers.body.type).toBe('auth');
	expect(
		(
			await api('POST', 'collections/users/records', {
				email: 'custom@vega.test',
				password: 'test-password-2',
				passwordConfirm: 'test-password-2'
			})
		).status
	).toBe(200);
	const authBefore = (await api('GET', 'collections/users')).body;
	const legacyBefore = (await api('GET', 'collections/vega_editors')).body;
	const usersToken = (
		await api(
			'POST',
			'collections/users/auth-with-password',
			{ identity: 'custom@vega.test', password: 'test-password-2' },
			''
		)
	).body.token;
	const port = createPocketBaseBackend({ url: server.url, editorAuthCollection: 'users' });
	await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
	const form = buildFormInbox({
		name: 'registro_custom_auth',
		label: 'Registro',
		singular: '',
		fields: [
			{
				label: 'Nombre',
				draft: { ...newFieldDraft(), name: 'name', required: true },
				longText: false
			}
		]
	});
	const modules = [...SITE_SEED_OPTIONAL_MODULES, form];
	await seedSiteProject(port, { modules, passwordResetUrl: 'https://example.test/reset' });
	const preview = await previewSiteSeed(port, { modules });
	expect(preview.status).toBe('ready');
	if (preview.status === 'ready') {
		expect(preview.plan.upToDate).toBe(true);
		expect(preview.modules.flatMap((module) => module.ruleDifferences)).toEqual([]);
	}
	expect((await api('GET', 'collections/users')).body).toEqual(authBefore);
	expect((await api('GET', 'collections/vega_editors')).body).toEqual(legacyBefore);
	const made = await api(
		'POST',
		'collections/registro_custom_auth/records',
		{ name: 'Ada', website: '' },
		''
	);
	expect(made.status).toBe(200);
	const route = `collections/registro_custom_auth/records/${made.body.id}`;
	expect((await api('GET', route, undefined, usersToken)).status).toBe(200);
	expect((await api('GET', route, undefined, '')).status).toBe(404);
	expect((await api('GET', route, undefined, editor)).status).toBe(404);
	expect((await api('PATCH', route, { read: true }, usersToken)).status).toBe(200);
	expect(
		(
			await api(
				'POST',
				'collections/registro_custom_auth/records',
				{ name: 'Bot', website: 'spam' },
				''
			)
		).status
	).toBe(400);
	expect(
		(await api('POST', 'collections/registro_custom_auth/records', { name: 'Bot', read: true }, ''))
			.status
	).toBe(400);
	expect(
		(
			await api(
				'POST',
				'collections/vega_media_folders/records',
				{ name: 'Editor folder' },
				usersToken
			)
		).status
	).toBe(200);
	expect(
		(await api('POST', 'collections/vega_media_folders/records', { name: 'Legacy folder' }, editor))
			.status
	).toBe(400);
	const menu = (await api('GET', 'collections/menus/records')).body.items[0];
	expect(
		(await api('PATCH', `collections/menus/records/${menu.id}`, { name: 'Renamed' }, usersToken))
			.status
	).toBe(200);
	expect(
		(await api('PATCH', `collections/menus/records/${menu.id}`, { key: 'changed' }, usersToken))
			.status
	).toBe(404);
	await port.ensureCollections([
		{ name: 'literal_rules', fields: [], listRule: '@request.auth.collectionName = "vega_editors"' }
	]);
	expect((await api('GET', 'collections/literal_rules')).body.listRule).toBe(
		'@request.auth.collectionName = "vega_editors"'
	);
});
