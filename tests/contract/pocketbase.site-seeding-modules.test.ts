/**
 * Los módulos de sembrado `blog` y `contacto` contra PocketBase real: que las colecciones nacen con
 * las reglas declaradas y que esas reglas hacen lo que dicen para quien no ha iniciado sesión y
 * para un editor de `vega_editors`. La regla de creación pública de `messages` se midió antes, a
 * solas, en `pocketbase.contact-rule-probe.test.ts`; aquí se comprueba sobre la colección que crea
 * el sembrado de verdad.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend/port';
import {
	previewSiteSeed,
	seedSiteProject,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_PAGES_READ_RULE
} from '$lib/backend/site-seeding';
import { SITE_SEED_BLOG_MODULE, SITE_SEED_TAGS_READ_RULE } from '$lib/backend/site-seeding-blog';
import { CONTACT_CREATE_RULE, SITE_SEED_CONTACT_MODULE } from '$lib/backend/site-seeding-contact';
import { SITE_SEED_OPTIONAL_MODULES } from '$lib/backend/site-seeding-modules';
import {
	handEditedManifest,
	seedLikePrevious0ace139
} from '$lib/backend/site-seeding-previous.fixture';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

const AVAILABLE = isPocketBaseBinaryAvailable();
const EDITOR = { email: 'editora@example.test', password: 'password-segura-123' };
const MESSAGE = { name: 'Ana', email: 'ana@example.com', message: 'Hola' };

type Json = Record<string, unknown>;

describe.skipIf(!AVAILABLE)('módulos de sembrado contra PocketBase real', () => {
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

	/** Petición cruda, sin SDK: lo que haría el sitio publicado o un editor desde su navegador. */
	async function request(
		path: string,
		init: { method?: string; body?: object; token?: string } = {}
	): Promise<{ status: number; body: Json }> {
		const response = await fetch(`${running!.url}${path}`, {
			method: init.method ?? 'GET',
			headers: {
				'content-type': 'application/json',
				...(init.token ? { authorization: init.token } : {})
			},
			...(init.body ? { body: JSON.stringify(init.body) } : {})
		});
		const text = await response.text();
		return { status: response.status, body: text ? (JSON.parse(text) as Json) : {} };
	}

	async function editorToken(): Promise<string> {
		await admin.collection('vega_editors').create({ ...EDITOR, passwordConfirm: EDITOR.password });
		const auth = await request('/api/collections/vega_editors/auth-with-password', {
			method: 'POST',
			body: { identity: EDITOR.email, password: EDITOR.password }
		});
		expect(auth.status).toBe(200);
		return String(auth.body.token);
	}

	function rules(collection: Json) {
		return {
			listRule: collection.listRule,
			viewRule: collection.viewRule,
			createRule: collection.createRule,
			updateRule: collection.updateRule,
			deleteRule: collection.deleteRule
		};
	}

	const items = (body: Json) => body.items as Json[];

	test('base + blog: crea `tags` y `posts` con sus reglas, el `slug` es único y sin sesión solo se lee lo publicado', async () => {
		const result = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		expect(result.createdCollections).toEqual([
			'vega_editors',
			'vega_media',
			'pages',
			'blocks',
			'redirects',
			'vega',
			'tags',
			'posts'
		]);
		const posts = await admin.collections.getOne('posts');
		const tags = await admin.collections.getOne('tags');
		expect(rules(posts)).toEqual({
			listRule: SITE_SEED_PAGES_READ_RULE,
			viewRule: SITE_SEED_PAGES_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(rules(tags)).toEqual({
			listRule: SITE_SEED_TAGS_READ_RULE,
			viewRule: SITE_SEED_TAGS_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(posts.fields.map((field) => [field.name, field.type])).toEqual(
			expect.arrayContaining([
				['title', 'text'],
				['slug', 'text'],
				['excerpt', 'text'],
				['body', 'editor'],
				['cover', 'relation'],
				['status', 'select'],
				['publishAt', 'date'],
				['date', 'date'],
				['tags', 'relation'],
				['description', 'text'],
				['socialImage', 'relation'],
				['noindex', 'bool'],
				['created', 'autodate'],
				['updated', 'autodate']
			])
		);

		const token = await editorToken();
		const tag = await request('/api/collections/tags/records', {
			method: 'POST',
			token,
			body: { name: 'Taller', slug: 'taller' }
		});
		expect(tag.status).toBe(200);
		const published = await request('/api/collections/posts/records', {
			method: 'POST',
			token,
			body: { title: 'Hola', slug: 'hola', status: 'published', tags: [tag.body.id] }
		});
		expect([published.status, published.body.tags]).toEqual([200, [tag.body.id]]);
		const draft = await request('/api/collections/posts/records', {
			method: 'POST',
			token,
			body: { title: 'En el horno', slug: 'en-el-horno', status: 'draft' }
		});
		expect(draft.status).toBe(200);

		// `slug` duplicado: lo rechaza el índice único, en las dos colecciones.
		const duplicatedPost = await request('/api/collections/posts/records', {
			method: 'POST',
			token,
			body: { title: 'Otra', slug: 'hola', status: 'draft' }
		});
		expect(duplicatedPost.status, 'un `slug` repetido en `posts`').toBe(400);
		expect(Object.keys(duplicatedPost.body.data as object)).toEqual(['slug']);
		const duplicatedTag = await request('/api/collections/tags/records', {
			method: 'POST',
			token,
			body: { name: 'Otro taller', slug: 'taller' }
		});
		expect(duplicatedTag.status).toBe(400);

		// Sin sesión: se lee lo publicado (con su etiqueta) y no se escribe.
		const anonymous = await request('/api/collections/posts/records?expand=tags');
		expect(anonymous.status).toBe(200);
		expect(items(anonymous.body).map((item) => item.slug)).toEqual(['hola']);
		expect((items(anonymous.body)[0]!.expand as Json).tags).toMatchObject([{ slug: 'taller' }]);
		expect((await request(`/api/collections/posts/records/${String(draft.body.id)}`)).status).toBe(
			404
		);
		const anonymousCreate = await request('/api/collections/posts/records', {
			method: 'POST',
			body: { title: 'Colada', slug: 'colada', status: 'published' }
		});
		expect(anonymousCreate.status).toBe(400);
		expect(
			(
				await request('/api/collections/tags/records', {
					method: 'POST',
					body: { name: 'x', slug: 'x' }
				})
			).status
		).toBe(400);
		// El editor sí ve el borrador.
		const asEditor = await request('/api/collections/posts/records', { token });
		expect(items(asEditor.body)).toHaveLength(2);
	});

	test('base + contacto: `messages` nace con la regla de creación pública y el resto solo para editores', async () => {
		const result = await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });

		expect(result.createdCollections).toContain('messages');
		const messages = await admin.collections.getOne('messages');
		// Literales, no las constantes: si alguien cambia una regla, este test lo tiene que notar.
		expect(rules(messages)).toEqual({
			listRule: '@request.auth.collectionName = "vega_editors"',
			viewRule: '@request.auth.collectionName = "vega_editors"',
			createRule: '@request.body.website = "" && @request.body.read != true',
			updateRule: '@request.auth.collectionName = "vega_editors"',
			deleteRule: '@request.auth.collectionName = "vega_editors"'
		});
		expect(CONTACT_CREATE_RULE).toBe(messages.createRule);
		// `website` es una trampa del cuerpo de la petición, no un campo.
		expect(messages.fields.map((field) => field.name)).not.toContain('website');
	});

	// Sin aserción sobre las reglas declaradas: aquí se mide lo que el servidor HACE con ellas.
	test('base + contacto: sin sesión se envía un mensaje normal, la trampa y `read: true` dan 400 y listar sale vacío; un editor lista y marca como leído', async () => {
		await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });

		const send = (body: object) =>
			request('/api/collections/messages/records', { method: 'POST', body });
		const sent = await send(MESSAGE);
		expect([sent.status, sent.body.read]).toEqual([200, false]);
		expect((await send({ ...MESSAGE, website: '' })).status).toBe(200);
		const trapped = await send({ ...MESSAGE, website: 'http://spam.example' });
		expect([trapped.status, trapped.body.message]).toEqual([400, 'Failed to create record.']);
		// El rechazo de la regla no dice qué condición falló: `data` va vacío.
		expect(trapped.body.data).toEqual({});
		const preRead = await send({ ...MESSAGE, read: true });
		expect([preRead.status, preRead.body.message]).toEqual([400, 'Failed to create record.']);
		// El tope del mensaje sí nombra el campo.
		const tooLong = await send({ ...MESSAGE, message: 'x'.repeat(5001) });
		expect([tooLong.status, Object.keys(tooLong.body.data as object)]).toEqual([400, ['message']]);
		expect((await send({ ...MESSAGE, email: 'no-es-un-correo' })).status).toBe(400);

		const anonymousList = await request('/api/collections/messages/records');
		expect([anonymousList.status, anonymousList.body.totalItems]).toEqual([200, 0]);
		expect(items(anonymousList.body)).toEqual([]);
		const id = String(sent.body.id);
		expect((await request(`/api/collections/messages/records/${id}`)).status).toBe(404);
		const anonymousPatch = await request(`/api/collections/messages/records/${id}`, {
			method: 'PATCH',
			body: { read: true }
		});
		expect(anonymousPatch.status).toBe(404);

		const token = await editorToken();
		const inbox = await request('/api/collections/messages/records', { token });
		expect(inbox.status).toBe(200);
		expect(items(inbox.body)).toHaveLength(2);
		expect(items(inbox.body).every((item) => item.read === false)).toBe(true);
		const marked = await request(`/api/collections/messages/records/${id}`, {
			method: 'PATCH',
			token,
			body: { read: true }
		});
		expect([marked.status, marked.body.read]).toEqual([200, true]);
		expect((await admin.collection('messages').getOne(id)).read).toBe(true);
	});

	test('base + contacto: `notifyState` es un campo oculto que ni el visitante ni un editor leen ni fijan', async () => {
		await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });
		const field = (await admin.collections.getOne('messages')).fields.find(
			(candidate) => candidate.name === 'notifyState'
		);
		expect(field).toMatchObject({ type: 'text', hidden: true, max: 20 });

		const sent = await request('/api/collections/messages/records', {
			method: 'POST',
			body: { ...MESSAGE, notifyState: 'sent' }
		});
		expect(sent.status).toBe(200);
		expect(sent.body).not.toHaveProperty('notifyState');
		const id = String(sent.body.id);
		// El superusuario sí lo ve y está vacío: lo que mandó el visitante se descartó.
		expect((await admin.collection('messages').getOne(id)).notifyState).toBe('');

		const token = await editorToken();
		const asEditor = await request(`/api/collections/messages/records/${id}`, { token });
		expect(asEditor.body).not.toHaveProperty('notifyState');
		const patched = await request(`/api/collections/messages/records/${id}`, {
			method: 'PATCH',
			token,
			body: { read: true, notifyState: 'pending' }
		});
		expect(patched.status).toBe(200);
		expect((await admin.collection('messages').getOne(id)).notifyState).toBe('');
	});

	test('los dos módulos sobre un sitio ya sembrado y con el manifiesto editado a mano: conserva lo editado, van al menú y la segunda pasada no añade nada', async () => {
		await seedLikePrevious0ace139(port);
		const record = (await admin.collection('vega').getFullList())[0]!;
		const edited = handEditedManifest() as {
			nav: { groups: string[] };
			collections: Record<string, Json>;
		};
		// Además de lo que trae el fixture, un menú propio: reordenado y con un grupo suyo.
		edited.nav.groups = ['Taller', 'Sitio'];
		edited.collections.recetas!.group = 'Taller';
		await admin.collection('vega').update(record.id, { manifest: edited });
		const modules = [...SITE_SEED_OPTIONAL_MODULES];

		const preview = await previewSiteSeed(port, { modules });
		if (preview.status !== 'ready') throw new Error('se esperaba un plan');
		expect(
			preview.modules.map((module) => [
				module.id,
				module.createdCollections,
				module.manifestEntries
			])
		).toEqual([
			[
				'base',
				[],
				[
					'collections.pages.publishAtField',
					'collections.pages.fields.publishAt',
					'collections.redirects'
				]
			],
			['blog', ['tags', 'posts'], ['collections.posts', 'collections.tags']],
			['contacto', ['messages'], ['collections.messages']]
		]);
		expect(preview.modules.flatMap((module) => module.manifestSkipped)).toEqual([]);

		const result = await seedSiteProject(port, { modules });

		expect(result.createdCollections).toEqual(['tags', 'posts', 'messages']);
		expect(result.upgradedRecords).toEqual(['manifest']);
		expect(result.manifestEntries).toMatchObject({
			blog: ['collections.posts', 'collections.tags'],
			contacto: ['collections.messages']
		});
		const manifests = await admin.collection('vega').getFullList();
		expect(manifests).toHaveLength(1);
		expect(manifests[0]!.id).toBe(record.id);
		const saved = manifests[0]!.manifest as {
			site: { name: string };
			nav: { groups: string[] };
			collections: Record<string, Json>;
			blockTypes: Record<string, Json>;
		};
		// Todo lo editado sigue, ruta a ruta: el manifiesto previo es un subconjunto del guardado.
		expect(saved).toMatchObject(edited);
		expect(saved.site.name).toBe('Mi taller');
		expect(saved.collections.pages!.label).toBe('Hojas');
		expect(saved.collections.pages!.listFields).toEqual(['title', 'status']);
		expect(saved.collections.recetas).toEqual({ label: 'Recetas', icon: 'tag', group: 'Taller' });
		expect(saved.blockTypes.hero!.label).toBe('Cabecera');
		// El menú propio no se mueve: el grupo de los módulos ya estaba declarado.
		expect(saved.nav.groups).toEqual(['Taller', 'Sitio']);
		// Están las de antes y las nuevas, y cada colección nueva dice su grupo del menú. El ORDEN de
		// las claves no se comprueba aquí: PocketBase devuelve un objeto JSON con las claves ordenadas
		// alfabéticamente (medido: `blocks, messages, pages, posts…`), así que «lo nuevo, al final»
		// es una propiedad de la fusión pura, no de lo que se lee del servidor. Las listas
		// (`nav.groups`) sí conservan su orden.
		expect(Object.keys(saved.collections).sort()).toEqual(
			[...Object.keys(edited.collections), 'redirects', 'posts', 'tags', 'messages'].sort()
		);
		for (const name of ['posts', 'tags', 'messages']) {
			expect(saved.collections[name]!.group).toBe('Sitio');
		}

		const rawBefore = await admin.collection('vega').getOne(record.id);
		await expect(seedSiteProject(port, { modules })).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
		const rawAfter = await admin.collection('vega').getOne(record.id);
		expect(JSON.stringify(rawAfter.manifest)).toBe(JSON.stringify(rawBefore.manifest));
		expect(rawAfter.updated).toBe(rawBefore.updated);
		const again = await previewSiteSeed(port, { modules });
		expect(again).toMatchObject({ status: 'ready', plan: { upToDate: true } });
	});

	test('un menú guardado sin el grupo del módulo lo recibe AL FINAL, sin reordenar los suyos', async () => {
		await seedSiteProject(port);
		const record = (await admin.collection('vega').getFullList())[0]!;
		const edited = structuredClone(record.manifest) as {
			nav: { groups: string[] };
			collections: Record<string, Json>;
		};
		edited.nav.groups = ['Taller', 'Web'];
		edited.collections.pages!.group = 'Web';
		edited.collections.redirects!.group = 'Taller';
		await admin.collection('vega').update(record.id, { manifest: edited });

		const result = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		// La base también declara «Sitio» en su fragmento: es ella quien lo añade.
		expect(result.manifestEntries).toEqual({
			base: ['nav.groups.Sitio'],
			blog: ['collections.posts', 'collections.tags']
		});
		const saved = (await admin.collection('vega').getOne(record.id)).manifest as typeof edited;
		expect(saved.nav.groups).toEqual(['Taller', 'Web', 'Sitio']);
		expect(saved).toMatchObject({
			collections: { pages: { group: 'Web' }, redirects: { group: 'Taller' } }
		});
		await expect(
			seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] })
		).resolves.toMatchObject({ createdCollections: [], upgradedRecords: [] });
		const afterSecond = (await admin.collection('vega').getOne(record.id))
			.manifest as typeof edited;
		expect(afterSecond.nav.groups).toEqual(['Taller', 'Web', 'Sitio']);
	});
});
