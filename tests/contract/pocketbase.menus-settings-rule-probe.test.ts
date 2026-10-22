/** Reglas y relaciones de Menús y Datos del sitio, medidas sobre PocketBase real. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { SITE_SEED_KEY_UPDATE_RULE as KEY_UPDATE_RULE } from '$lib/backend/site-seeding';
import { SITE_SEED_MENU_ITEMS_READ_RULE as ITEMS_READ_RULE } from '$lib/backend/site-seeding-menus';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

describe.skipIf(!isPocketBaseBinaryAvailable())('Menús y Datos del sitio: sonda de reglas', () => {
	let pb: RunningPocketBase;
	let admin: SiteSeedingAdmin;
	let editor: string;
	let menu: string;
	let settings: string;
	let published: string;
	let draft: string;

	async function request(collection: string, method = 'GET', body?: object, token?: string) {
		const response = await fetch(`${pb.url}/api/collections/${collection}`, {
			method,
			headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
			...(body ? { body: JSON.stringify(body) } : {})
		});
		const text = await response.text();
		return { status: response.status, body: text ? JSON.parse(text) : null };
	}

	beforeAll(async () => {
		pb = await startPocketBase();
		admin = await createSiteSeedingAdmin(pb);
		const users = await admin.collections.create({ name: 'vega_editors', type: 'auth' });
		await admin.collection(users.id).create({
			email: 'editor@vega.test',
			password: 'editor-password',
			passwordConfirm: 'editor-password'
		});
		const auth = await request('vega_editors/auth-with-password', 'POST', {
			identity: 'editor@vega.test',
			password: 'editor-password'
		});
		editor = auth.body.token;
		const pages = await admin.collections.create({
			name: 'pages',
			type: 'base',
			listRule: 'status = "published"',
			viewRule: 'status = "published"',
			fields: [
				{ name: 'title', type: 'text' },
				{ name: 'status', type: 'text' }
			]
		});
		const media = await admin.collections.create({
			name: 'vega_media',
			type: 'base',
			listRule: '@request.auth.collectionName = "vega_editors"',
			viewRule: '',
			fields: [{ name: 'alt', type: 'text' }]
		});
		const menus = await admin.collections.create({
			name: 'menus',
			type: 'base',
			listRule: '',
			viewRule: '',
			updateRule: KEY_UPDATE_RULE,
			fields: [
				{ name: 'key', type: 'text', required: true },
				{ name: 'name', type: 'text' }
			]
		});
		await admin.collections.create({
			name: 'menu_items',
			type: 'base',
			listRule: ITEMS_READ_RULE,
			viewRule: ITEMS_READ_RULE,
			fields: [
				{
					name: 'menu',
					type: 'relation',
					collectionId: menus.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'page',
					type: 'relation',
					collectionId: pages.id,
					maxSelect: 1,
					cascadeDelete: false
				},
				{ name: 'url', type: 'text' },
				{ name: 'label', type: 'text' }
			]
		});
		await admin.collections.create({
			name: 'site_settings',
			type: 'base',
			listRule: '',
			viewRule: '',
			updateRule: KEY_UPDATE_RULE,
			fields: [
				{ name: 'key', type: 'text' },
				{ name: 'description', type: 'text' },
				{ name: 'socialImage', type: 'relation', collectionId: media.id, maxSelect: 1 }
			]
		});
		menu = (await admin.collection('menus').create({ key: 'principal', name: 'Principal' })).id;
		published = (await admin.collection('pages').create({ title: 'Pública', status: 'published' }))
			.id;
		draft = (await admin.collection('pages').create({ title: 'Borrador', status: 'draft' })).id;
		const image = await admin.collection('vega_media').create({ alt: 'Imagen social' });
		settings = (
			await admin.collection('site_settings').create({ key: 'default', socialImage: image.id })
		).id;
	}, 30_000);
	afterAll(async () => {
		await pb?.stop();
	});

	test('lectura pública oculta borradores, expande páginas públicas y conserva direcciones libres', async () => {
		const live = await admin.collection('menu_items').create({ menu, page: published });
		const hidden = await admin.collection('menu_items').create({ menu, page: draft });
		const free = await admin
			.collection('menu_items')
			.create({ menu, url: '#equipo', label: 'Equipo' });
		const result = await request('menu_items/records?expand=menu,page');
		expect(result.status).toBe(200);
		expect(result.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
			[live.id, free.id].sort()
		);
		expect(
			result.body.items.find((item: { id: string }) => item.id === live.id).expand.page.id
		).toBe(published);
		expect((await request(`menu_items/records/${hidden.id}`)).status).toBe(404);
	});

	test('borrar página vacía la relación y conserva el ancla: ya es indistinguible de un enlace libre', async () => {
		const page = await admin.collection('pages').create({ title: 'Se borra', status: 'published' });
		const item = await admin
			.collection('menu_items')
			.create({ menu, page: page.id, url: '#equipo', label: 'Equipo' });
		expect(
			(await request(`pages/records/${page.id}`, 'DELETE', undefined, admin.authStore.token)).status
		).toBe(204);
		const result = await request(`menu_items/records/${item.id}`);
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ page: '', url: '#equipo', label: 'Equipo' });
	});

	test.each(['menus', 'site_settings'])(
		'%s: editor cambia contenido; incluir key igual o distinta se rechaza; superusuario puede cambiarla',
		async (collection) => {
			const id = collection === 'menus' ? menu : settings;
			const change =
				collection === 'menus' ? { name: 'Renombrado' } : { description: 'Descripción' };
			expect((await request(`${collection}/records/${id}`, 'PATCH', change, editor)).status).toBe(
				200
			);
			for (const key of [collection === 'menus' ? 'principal' : 'default', 'cambiada']) {
				expect(
					(await request(`${collection}/records/${id}`, 'PATCH', { key }, editor)).status
				).toBe(404);
			}
			expect(
				(
					await request(
						`${collection}/records/${id}`,
						'PATCH',
						{ key: 'superusuario' },
						admin.authStore.token
					)
				).status
			).toBe(200);
		}
	);

	test('editor no crea ni borra Datos del sitio; su imagen se expande sin sesión', async () => {
		expect((await request('site_settings/records', 'POST', { key: 'otro' }, editor)).status).toBe(
			403
		);
		expect(
			(await request(`site_settings/records/${settings}`, 'DELETE', undefined, editor)).status
		).toBe(403);
		const result = await request(`site_settings/records/${settings}?expand=socialImage`);
		expect(result.status).toBe(200);
		expect(result.body.expand.socialImage.alt).toBe('Imagen social');
	});

	test('borrar menú elimina sus elementos por cascada', async () => {
		const temporary = await admin.collection('menus').create({ key: 'temporal' });
		const item = await admin.collection('menu_items').create({ menu: temporary.id, url: '/' });
		await admin.collection('menus').delete(temporary.id);
		expect((await request(`menu_items/records/${item.id}`)).status).toBe(404);
	});
});
