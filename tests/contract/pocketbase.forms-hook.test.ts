/** Bandejas reales creadas por el mismo módulo que el asistente; hook y SMTP de producto. */
import { afterEach, expect, test } from 'vitest';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { SITE_SEED_CONTACT_MODULE } from '$lib/backend/site-seeding-contact';
import { buildFormInbox } from '$lib/forms/form-inbox';
import { enableInboxRateLimit } from '$lib/forms/form-rate-limits';
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
import { startSmtpSink, type SmtpSink } from './pb-harness/smtp-sink';
let instance: PocketBaseInstanceDir;
let server: PocketBaseServerHandle;
let sink: SmtpSink;
let token = '';
async function api(method: string, route: string, body?: object, auth = token) {
	const response = await fetch(`${server.url}/api/${route}`, {
		method,
		headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	const raw = await response.text();
	return { status: response.status, body: raw ? JSON.parse(raw) : {} };
}
async function start(retention = '', max = '5', excluded = '') {
	instance = createPocketBaseInstanceDir();
	await createPocketBaseSuperuser(instance.dataDir);
	sink = await startSmtpSink();
	server = await startPocketBaseServerOn(instance, {
		hooksDir: path.resolve('infra/production/pb_hooks'),
		env: {
			VEGA_CONTACT_NOTIFY_TO: 'team@vega.test',
			VEGA_FORMS_RETENTION_DAYS: retention,
			VEGA_CONTACT_NOTIFY_MAX: max,
			VEGA_FORMS_EXCLUDE_COLLECTIONS: excluded
		}
	});
	const port = createPocketBaseBackend({ url: server.url });
	await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
	token = port.currentSession()!.token;
	await seedSiteProject(port);
	const field = (name: string, type: 'text' | 'email' | 'bool', label: string) => ({
		label,
		longText: false,
		draft: { ...newFieldDraft(), name, type, required: true }
	});
	const module = buildFormInbox({
		name: 'inscripciones',
		label: 'Inscripciones',
		singular: 'Inscripción',
		fields: [
			field('person', 'text', 'Persona'),
			field('email', 'email', 'Correo de respuesta'),
			field('consent', 'bool', 'Consentimiento')
		]
	});
	await seedSiteProject(port, { modules: [module] });
	await api('PATCH', 'settings', {
		smtp: { enabled: true, host: '127.0.0.1', port: sink.port, tls: false },
		meta: { appName: 'Prueba', senderAddress: 'noreply@vega.test', senderName: 'Prueba' }
	});
	return port;
}
afterEach(async () => {
	await server?.stop();
	await sink?.stop();
	if (instance) destroyPocketBaseInstanceDir(instance);
});
const body = { person: 'Ada', email: 'ada@vega.test', consent: true };
test('bandeja pública: reglas, validación y control oculto', async () => {
	await start();
	const made = await api(
		'POST',
		'collections/inscripciones/records',
		{ ...body, website: '', notifyState: 'sent' },
		''
	);
	expect(made.status).toBe(200);
	expect(made.body).not.toHaveProperty('notifyState');
	expect(
		(await api('GET', `collections/inscripciones/records/${made.body.id}`)).body.notifyState
	).toBe('pending');
	for (const invalid of [
		{ website: 'spam' },
		{ read: true },
		{ email: 'bad' },
		{ consent: false },
		{ person: 'x'.repeat(201) }
	])
		expect(
			(await api('POST', 'collections/inscripciones/records', { ...body, ...invalid }, '')).status
		).toBe(400);
	expect((await api('GET', 'collections/inscripciones/records', undefined, '')).body.items).toEqual(
		[]
	);
});
test('segunda bandeja usa título/etiquetas del manifiesto y Reply-To, otra colección no se marca', async () => {
	const port = await start();
	await api('POST', 'collections/inscripciones/records', { ...body, person: '<Ada>' }, '');
	await api('POST', 'crons/vega-contact-notify');
	const mail = (await sink.waitForMessages(1))[0];
	expect(mail).toContain('Inscripciones');
	expect(mail).toContain('Persona');
	expect(mail).toContain('&lt;Ada&gt;');
	expect(mail).toContain('Reply-To: ada@vega.test');
	await port.ensureCollections([
		{ name: 'plain', createRule: '', fields: [{ name: 'title', type: 'text' }] }
	]);
	expect((await api('POST', 'collections/plain/records', { title: 'Normal' }, '')).status).toBe(
		200
	);
	expect((await port.list('plain')).items[0].values).not.toHaveProperty('notifyState');
});
test('messages con columnas propias conserva todos los campos y sus etiquetas', async () => {
	const port = await start();
	await seedSiteProject(port, {
		modules: [
			buildFormInbox({
				name: 'messages',
				label: 'Solicitudes',
				singular: 'Solicitud',
				fields: [
					{
						label: 'Taller elegido',
						longText: false,
						draft: { ...newFieldDraft(), name: 'taller', required: true }
					}
				]
			})
		]
	});
	await api('POST', 'collections/messages/records', { taller: '<Ceramica>' }, '');
	await api('POST', 'crons/vega-contact-notify');
	const mail = (await sink.waitForMessages(1))[0];
	expect(mail).toContain('Solicitudes');
	expect(mail).toContain('Taller elegido');
	expect(mail).toContain('&lt;Ceramica&gt;');
});
test('manifiesto null conserva el aviso con nombres de campos', async () => {
	const port = await start();
	const config = (await port.list('vega')).items[0];
	await port.update('vega', config.id, { manifest: null });
	await api('POST', 'collections/inscripciones/records', body, '');
	await api('POST', 'crons/vega-contact-notify');
	const mail = (await sink.waitForMessages(1))[0];
	expect(mail).toContain('inscripciones');
	expect(mail).toContain('person');
	expect(mail).toContain('Ada');
});
test('el tope del aviso es independiente en dos bandejas', async () => {
	const port = await start('', '1');
	await seedSiteProject(port, {
		modules: [
			buildFormInbox({
				name: 'presupuestos',
				label: 'Presupuestos',
				singular: 'Presupuesto',
				fields: [
					{
						label: 'Persona',
						longText: false,
						draft: { ...newFieldDraft(), name: 'person' }
					}
				]
			})
		]
	});
	for (let n = 0; n < 3; n++) {
		await api('POST', 'collections/inscripciones/records', body, '');
		await api('POST', 'collections/presupuestos/records', { person: 'Ada' }, '');
	}
	await api('POST', 'crons/vega-contact-notify');
	await sink.waitForMessages(4);
	for (const collection of ['inscripciones', 'presupuestos']) {
		await expect
			.poll(async () =>
				(await api('GET', `collections/${collection}/records`)).body.items
					.map((row: { notifyState: string }) => row.notifyState)
					.sort()
			)
			.toEqual(['capped', 'more', 'sent']);
	}
	expect(sink.messages).toHaveLength(4);
});
test('límite escrito por Vega conserva users:auth y el sexto visitante recibe429', async () => {
	const port = await start();
	await port.serverSettings!.update({
		rateLimits: {
			enabled: false,
			rules: [{ label: 'users:auth', audience: '', duration: 60, maxRequests: 10 }]
		}
	});
	await enableInboxRateLimit(port.serverSettings!, 'inscripciones');
	const statuses = [];
	for (let i = 0; i < 6; i++)
		statuses.push((await api('POST', 'collections/inscripciones/records', body, '')).status);
	expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
	expect(
		(await port.serverSettings!.get()).rateLimits!.rules.some((rule) => rule.label === 'users:auth')
	).toBe(true);
});
async function oldRows(retention: string) {
	const port = await start(retention);
	await api('POST', 'collections/inscripciones/records', body, '');
	await api('POST', 'collections/inscripciones/records', { ...body, person: 'Reciente' }, '');
	await port.ensureCollections([
		{ name: 'unrelated', fields: [{ name: 'created', type: 'autodate' }] },
		{
			name: 'vega_revisions',
			fields: [
				{ name: 'collection', type: 'text' },
				{ name: 'kind', type: 'text' },
				{ name: 'created', type: 'autodate' }
			]
		}
	]);
	for (const collection of ['inscripciones', 'unrelated'])
		await port.create('vega_revisions', { collection, kind: 'delete' });
	await port.create('unrelated', {});
	const db = new DatabaseSync(path.join(instance.dataDir, 'data.db'));
	db.exec(
		"UPDATE inscripciones SET created='2000-01-01 00:00:00.000Z' WHERE person='Ada'; UPDATE vega_revisions SET created='2000-01-01 00:00:00.000Z'; UPDATE unrelated SET created='2000-01-01 00:00:00.000Z'"
	);
	db.close();
	await api('POST', 'crons/vega-forms-retention');
	return port;
}
test('retención opt-in elimina antiguos y sus revisiones sin tocar otros datos', async () => {
	const port = await oldRows('7');
	await expect.poll(async () => (await port.list('inscripciones')).items.length).toBe(1);
	expect((await port.list('inscripciones')).items[0].values.person).toBe('Reciente');
	expect((await port.list('vega_revisions')).items.map((row) => row.values.collection)).toEqual([
		'unrelated'
	]);
	expect((await port.list('unrelated')).items).toHaveLength(1);
});
test.each(['', '0', '-1', '1.5', 'no'])(
	'retención inválida o vacía %s conserva envíos y revisiones',
	async (value) => {
		const port = await oldRows(value);
		expect((await port.list('inscripciones')).items).toHaveLength(2);
		expect((await port.list('vega_revisions')).items).toHaveLength(2);
	}
);

test('excluded messages is never marked, notified or purged; another inbox still works', async () => {
	const port = await start('7', '5', ' messages , *, inscrip* , invalid-name ');
	await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });
	const contact = await api(
		'POST',
		'collections/messages/records',
		{
			name: 'Own contact policy',
			email: 'contact@vega.test',
			message: 'Keep contact'
		},
		''
	);
	expect(contact.status).toBe(200);
	const contactRoute = `collections/messages/records/${contact.body.id}`;
	expect((await api('GET', contactRoute)).body.notifyState).toBe('');
	// A pending row left by the collection's own handler must also be ignored by the cron.
	expect((await api('PATCH', contactRoute, { notifyState: 'pending' })).status).toBe(200);
	const other = await api('POST', 'collections/inscripciones/records', body, '');
	expect(other.status).toBe(200);
	await api('POST', 'crons/vega-contact-notify');
	await expect
		.poll(
			async () =>
				(await api('GET', `collections/inscripciones/records/${other.body.id}`)).body.notifyState
		)
		.toBe('sent');
	expect(sink.messages).toHaveLength(1);
	expect(sink.messages[0]).toContain('Inscripciones');
	expect((await api('GET', contactRoute)).body.notifyState).toBe('pending');
	await port.ensureCollections([
		{
			name: 'vega_revisions',
			fields: [
				{ name: 'collection', type: 'text' },
				{ name: 'created', type: 'autodate' }
			]
		}
	]);
	for (const collection of ['messages', 'inscripciones'])
		await port.create('vega_revisions', { collection });
	const db = new DatabaseSync(path.join(instance.dataDir, 'data.db'));
	db.exec(
		"UPDATE messages SET created='2000-01-01 00:00:00.000Z'; UPDATE inscripciones SET created='2000-01-01 00:00:00.000Z'; UPDATE vega_revisions SET created='2000-01-01 00:00:00.000Z'"
	);
	db.close();
	await api('POST', 'crons/vega-forms-retention');
	await expect
		.poll(async () => (await port.list('vega_revisions')).items.map((row) => row.values.collection))
		.toEqual(['messages']);
	expect((await port.list('inscripciones')).items).toHaveLength(0);
	expect((await port.list('messages')).items).toHaveLength(1);
	expect((await api('GET', contactRoute)).body.notifyState).toBe('pending');
});
