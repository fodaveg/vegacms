/** Contrato real: las sondas de arranque, callbacks aislados, multipart y batch son producto. */
import { afterEach, describe, expect, test } from 'vitest';
import { chmodSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { activityQuery, EMPTY_ACTIVITY_FILTERS } from '$lib/activity/activity-query';
import { hasActivityCollection } from '$lib/activity/activity-collection';
import { DatabaseSync } from 'node:sqlite';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	createPocketBaseInstanceDir,
	createPocketBaseSuperuser,
	destroyPocketBaseInstanceDir,
	startPocketBaseServerOn,
	type PocketBaseInstanceDir,
	type PocketBaseServerHandle
} from './pb-harness/server';

const HOOKS_DIR = path.resolve('infra/production/pb_hooks');
let instance: PocketBaseInstanceDir;
let server: PocketBaseServerHandle;
let token = '';
let output = '';

async function api(method: string, route: string, body?: object | FormData, auth = token) {
	const form = body instanceof FormData;
	const response = await fetch(`${server.url}/api/${route}`, {
		method,
		headers: {
			...(!form ? { 'content-type': 'application/json' } : {}),
			...(auth ? { authorization: auth } : {})
		},
		body: form ? body : body ? JSON.stringify(body) : undefined
	});
	const raw = await response.text();
	return { status: response.status, body: raw ? JSON.parse(raw) : {} };
}
async function start(env: Record<string, string> = {}) {
	instance = createPocketBaseInstanceDir();
	await createPocketBaseSuperuser(instance.dataDir);
	chmodSync(instance.migrationsDir, 0o555);
	// Prueba negativa del propio filesystem, no basta con mirar sus bits de modo.
	expect(() => writeFileSync(path.join(instance.migrationsDir, 'write-probe.js'), '')).toThrow(
		/EACCES|EPERM/
	);
	output = '';
	server = await startPocketBaseServerOn(instance, {
		hooksDir: HOOKS_DIR,
		env,
		onOutput: (text) => {
			output += text;
		}
	});
	token = (
		await api(
			'POST',
			'collections/_superusers/auth-with-password',
			{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
			''
		)
	).body.token;
}
async function content(name = 'posts', extra: object[] = []) {
	return api('POST', 'collections', {
		name,
		type: 'base',
		listRule: '@request.auth.id != ""',
		viewRule: '@request.auth.id != ""',
		createRule: '@request.auth.id != ""',
		updateRule: '@request.auth.id != ""',
		deleteRule: '@request.auth.id != ""',
		fields: [
			{ name: 'title', type: 'text', required: true },
			{ name: 'status', type: 'select', values: ['draft', 'published'] },
			{ name: 'body', type: 'text' },
			{ name: 'file', type: 'file', maxSelect: 1 },
			{ name: 'created', type: 'autodate', onCreate: true },
			{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			...extra
		]
	});
}
const rows = async () =>
	(await api('GET', 'collections/vega_activity/records?perPage=200&sort=created,id')).body.items;

afterEach(async () => {
	await server?.stop();
	if (instance) {
		chmodSync(instance.migrationsDir, 0o755);
		destroyPocketBaseInstanceDir(instance);
	}
});

describe('hook de actividad contra PocketBase real', () => {
	test('crea esquema cerrado con automigrate y migraciones read-only; segundo arranque conserva esquema', async () => {
		await start();
		const first = await api('GET', 'collections/vega_activity');
		expect(first.status, output).toBe(200);
		expect(first.body.fields.map((f: { name: string }) => f.name)).toContain('actorCollection');
		for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
			expect(first.body[rule]).toBeNull();
		expect(first.body.indexes).toHaveLength(3);
		expect(readdirSync(instance.migrationsDir)).toEqual([]);
		await server.stop();
		server = await startPocketBaseServerOn(instance, { hooksDir: HOOKS_DIR });
		token = (
			await api(
				'POST',
				'collections/_superusers/auth-with-password',
				{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
				''
			)
		).body.token;
		const second = await api('GET', 'collections/vega_activity');
		expect(second.body).toEqual(first.body);
	});
	test('create/update multipart/delete; from/to solo vocabulario; lote dispara peticiones', async () => {
		await start();
		expect((await content()).status).toBe(200);
		const post = await api('POST', 'collections/posts/records', {
			title: 'Primero',
			status: 'draft',
			body: 'privado'
		});
		expect(post.status, output + JSON.stringify(post.body)).toBe(200);
		const form = new FormData();
		form.set('title', 'Segundo');
		form.set('status', 'published');
		form.set('file', new File(['bytes'], 'test.txt', { type: 'text/plain' }));
		expect((await api('PATCH', `collections/posts/records/${post.body.id}`, form)).status).toBe(
			200
		);
		expect((await api('DELETE', `collections/posts/records/${post.body.id}`)).status).toBe(204);
		const entries = await rows();
		expect(entries, output).toHaveLength(3);
		expect(entries.map((row: { action: string }) => row.action)).toEqual([
			'create',
			'update',
			'delete'
		]);
		expect(entries[1].changes).toEqual(
			expect.arrayContaining([
				{ field: 'title' },
				{ field: 'status', from: 'draft', to: 'published' },
				{ field: 'file' }
			])
		);
		expect(JSON.stringify(entries)).not.toContain('privado');
		await api('PATCH', 'settings', { batch: { enabled: true } });
		const batch = await api('POST', 'batch', {
			requests: [{ method: 'POST', url: '/api/collections/posts/records', body: { title: 'Lote' } }]
		});
		expect(batch.status).toBe(200);
		expect(await rows()).toHaveLength(4);
	});
	test('editor, permisos cerrados, sin sesión y validación; elimina correo al borrar auth configurable', async () => {
		await start();
		await content();
		await content('messages', [{ name: 'email', type: 'email' }]);
		await api('PATCH', 'collections/messages', { createRule: '' });
		await api('POST', 'collections', {
			name: 'custom_auth',
			type: 'auth',
			passwordAuth: { enabled: true, identityFields: ['email'] }
		});
		const account = (
			await api('POST', 'collections/custom_auth/records', {
				email: 'editor@vega.test',
				password: 'editor-pass-123',
				passwordConfirm: 'editor-pass-123'
			})
		).body;
		const auth = (
			await api(
				'POST',
				'collections/custom_auth/auth-with-password',
				{ identity: 'editor@vega.test', password: 'editor-pass-123' },
				''
			)
		).body.token;
		expect(auth).toBeTruthy();
		await api('POST', 'collections/posts/records', { title: 'Editor' }, auth);
		expect((await rows())[0].actorEmail).toBe('editor@vega.test');
		for (const [method, route, body] of [
			['GET', 'collections/vega_activity/records', undefined],
			['POST', 'collections/vega_activity/records', { action: 'create' }],
			['GET', `collections/vega_activity/records/${(await rows())[0].id}`, undefined]
		] as const) {
			expect((await api(method, route, body, auth)).status).toBeGreaterThanOrEqual(400);
		}
		expect((await api('POST', 'collections/posts/records', { title: '' }, auth)).status).toBe(400);
		await api(
			'POST',
			'collections/messages/records',
			{ title: 'Visitante', email: 'visitor@vega.test' },
			''
		);
		await api('POST', 'collections/messages/records', {
			title: 'Nombre privado',
			email: 'visitor@vega.test'
		});
		expect((await rows()).at(-1).label).toBe('');
		expect(await rows()).toHaveLength(2);
		await api('DELETE', `collections/custom_auth/records/${account.id}`);
		expect((await rows())[0].actorEmail).toBe('');
	});
	test('exclusiones, medios, fallo de registro no rompe escritura ni filtra valores y esquema ajeno se conserva', async () => {
		await start();
		await content('vega');
		await content('vega_revisions');
		await content('vega_media');
		await content();
		for (const collection of ['vega', 'vega_revisions', 'vega_media'])
			await api('POST', `collections/${collection}/records`, { title: 'Registro' });
		expect(await rows()).toHaveLength(1);
		const schema = (await api('GET', 'collections/vega_activity')).body;
		schema.fields.push({ name: 'forced', type: 'text', required: true });
		await api('PATCH', 'collections/vega_activity', schema);
		expect(
			(await api('POST', 'collections/posts/records', { title: 'SECRETO_SENTINELA' })).status
		).toBe(200);
		expect(await rows()).toHaveLength(1);
		// Logger de PB persiste en _logs; no se depende de stdout del proceso.
		await expect
			.poll(
				async () =>
					(await api('GET', 'logs?filter=' + encodeURIComponent('message ~ "vega-activity"'))).body
						.totalItems,
				{ timeout: 10000 }
			)
			.toBeGreaterThan(0);
		const logs = await api('GET', 'logs?filter=' + encodeURIComponent('message ~ "vega-activity"'));
		expect(JSON.stringify(logs.body)).not.toContain('SECRETO_SENTINELA');
		expect(
			logs.body.items.some((log: { message: string }) => log.message.includes('no se pudo guardar'))
		).toBe(true);
		await server.stop();
		server = await startPocketBaseServerOn(instance, { hooksDir: HOOKS_DIR });
		token = (
			await api(
				'POST',
				'collections/_superusers/auth-with-password',
				{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
				''
			)
		).body.token;
		// Otro tipo incompatible: no tocarlo y apagar el registro del proceso.
		const bad = (await api('GET', 'collections/vega_activity')).body;
		bad.fields.find((field: { name: string }) => field.name === 'action').required = false;
		await api('PATCH', 'collections/vega_activity', bad);
		await server.stop();
		server = await startPocketBaseServerOn(instance, { hooksDir: HOOKS_DIR });
		token = (
			await api(
				'POST',
				'collections/_superusers/auth-with-password',
				{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
				''
			)
		).body.token;
		expect(
			(await api('GET', 'collections/vega_activity')).body.fields.find(
				(field: { name: string }) => field.name === 'action'
			).required
		).toBe(false);
		await api('POST', 'collections/posts/records', { title: 'Sin actividad' });
		expect(await rows()).toHaveLength(1);
	}, 15000);
	test('poda días y tope por tandas; conserva filas recientes', async () => {
		await start({ VEGA_ACTIVITY_DAYS: '7', VEGA_ACTIVITY_MAX_ROWS: '2' });
		await content();
		for (let i = 0; i < 5; i++)
			await api('POST', 'collections/posts/records', { title: `Entrada ${i}` });
		const entries = await rows();
		const db = new DatabaseSync(path.join(instance.dataDir, 'data.db'));
		db.prepare('UPDATE vega_activity SET created = ? WHERE id = ?').run(
			'2000-01-01 00:00:00.000Z',
			entries[0].id
		);
		db.close();
		expect((await api('POST', 'crons/vega-activity-prune')).status).toBe(204);
		await expect.poll(async () => (await rows()).length).toBe(2);
		expect((await rows()).some((row: { id: string }) => row.id === entries[0].id)).toBe(false);
	});
	test('retención inválida usa defaults; 100000 filas y medida de consulta sin umbral de tiempo', async () => {
		await start({ VEGA_ACTIVITY_DAYS: '0', VEGA_ACTIVITY_MAX_ROWS: 'no-entero' });
		const db = new DatabaseSync(path.join(instance.dataDir, 'data.db'));
		const before =
			Number((db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count) *
			Number((db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size);
		const insert = db.prepare(
			"INSERT INTO vega_activity (id,action,collection,recordId,label,actorId,actorCollection,actorEmail,changes,created) VALUES (?,'create','posts',?,'Una entrada de tamaño representativo','editor_1','vega_editors','editor@vega.test','[]',?)"
		);
		db.exec('BEGIN');
		const baseline = Date.now();
		for (let i = 0; i < 100005; i++)
			insert.run(
				'a' + String(i).padStart(14, '0'),
				'p' + String(i).padStart(14, '0'),
				new Date(baseline - 86400000 - (i < 100 ? 0 : i * 1000)).toISOString().replace('T', ' ')
			);
		insert.run('old000000000001', 'old000000000001', '2000-01-01 00:00:00.000Z');
		db.exec('COMMIT');
		expect((await api('POST', 'crons/vega-activity-prune')).status).toBe(204);
		await expect
			.poll(() =>
				Number((db.prepare('SELECT count(*) AS n FROM vega_activity').get() as { n: number }).n)
			)
			.toBe(100000);
		expect(
			db.prepare('SELECT id FROM vega_activity WHERE id = ?').get('old000000000001')
		).toBeUndefined();
		const plan = db
			.prepare('EXPLAIN QUERY PLAN SELECT id FROM vega_activity ORDER BY created DESC LIMIT 50')
			.all();
		expect(JSON.stringify(plan)).toContain('idx_vega_activity_created');
		const started = performance.now();
		const page = await api('GET', 'collections/vega_activity/records?sort=-created,id&perPage=50');
		const queryMs = performance.now() - started;
		const after =
			Number((db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count) *
			Number((db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size);
		const port = createPocketBaseBackend({ url: server.url });
		await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
		expect(hasActivityCollection(await port.listContentTypes())).toBe(true);
		const first = await port.list('vega_activity', activityQuery(EMPTY_ACTIVITY_FILTERS));
		const cursor = first.items.at(-1)!;
		insert.run('new000000000001', 'new000000000001', new Date().toISOString().replace('T', ' '));
		const second = await port.list(
			'vega_activity',
			activityQuery(EMPTY_ACTIVITY_FILTERS, {
				id: cursor.id,
				created: String(cursor.values.created)
			})
		);
		expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(100);
		expect(second.items[0].id).toBe('a' + String(50).padStart(14, '0'));

		expect(page.body.items).toHaveLength(50);
		expect(page.body.totalItems).toBe(100000);

		const measurement = {
			rows: 100000,
			tableAndIndexesBytes: after - before,
			bytesPerRow: (after - before) / 100000,
			apiPage50Ms: queryMs,
			node: process.version
		};
		console.log('ACTIVITY_MEASUREMENT ' + JSON.stringify(measurement));
		if (process.env.VEGA_ACTIVITY_EVIDENCE_DIR)
			writeFileSync(
				path.join(process.env.VEGA_ACTIVITY_EVIDENCE_DIR, 'pocketbase-measurement.json'),
				JSON.stringify(measurement, null, 2)
			);
		db.close();
	}, 20000);
});
