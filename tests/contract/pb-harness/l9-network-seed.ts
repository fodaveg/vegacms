/** Ephemeral real-PB dataset, exclusively for local browser network measurements. */
import PocketBase from 'pocketbase';
import { createPocketBaseBackend } from '../../../src/lib/backend/adapters/pocketbase';
import type { RunningPocketBase } from './server';
export const EDITOR_EMAIL = 'network-editor@vega.test';
export const EDITOR_PASSWORD = 'network-fixture-password-42';
export const PAGE_ID = 'page00000000001';
export const RAIL_LAST_ID = 'page00000000060';
export const idFor = (prefix: string, n: number) =>
	`${prefix}${String(n).padStart(15 - prefix.length, '0')}`;
const text = (name: string) => ({ name, type: 'text' });
const dates = [
	{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
	{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
];
const rule = '@request.auth.id != ""';
export async function seedL9(server: RunningPocketBase) {
	const admin = new PocketBase(server.url);
	admin.autoCancellation(false);
	await admin.collection('_superusers').authWithPassword(server.adminEmail, server.adminPassword);
	const create = async (name: string, fields: object[], rules: object = {}) =>
		admin.collections.create({
			name,
			type: 'base',
			fields,
			listRule: rule,
			viewRule: rule,
			createRule: rule,
			updateRule: rule,
			deleteRule: rule,
			...rules
		});
	await admin.collections.create({
		name: 'vega_editors',
		type: 'auth',
		fields: [text('name')],
		passwordAuth: { enabled: true, identityFields: ['email'] },
		listRule: rule,
		viewRule: rule
	});
	await admin.collection('vega_editors').create({
		email: EDITOR_EMAIL,
		password: EDITOR_PASSWORD,
		passwordConfirm: EDITOR_PASSWORD,
		verified: true,
		name: 'Network editor'
	});
	const tags = await create('tags', [text('name'), ...dates]);
	await create('pages', [
		text('title'),
		text('path'),
		{ name: 'body', type: 'text', max: 65536 },
		{ name: 'status', type: 'select', values: ['draft', 'published'], maxSelect: 1 },
		{ name: 'position', type: 'number' },
		{ name: 'links', type: 'relation', collectionId: tags.id, maxSelect: 99 },
		...dates
	]);
	await create('vega', [
		text('key'),
		{ name: 'manifestVersion', type: 'number' },
		{ name: 'manifest', type: 'json' },
		{ name: 'schemaSnapshot', type: 'json' }
	]);
	await create('vega_revisions', [
		text('collection'),
		text('recordId'),
		text('kind'),
		{ name: 'values', type: 'json' },
		text('label'),
		text('author'),
		{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
	]);
	const pageCollection = await admin.collections.getOne('pages');
	await create('blocks', [
		{ name: 'parent', type: 'relation', collectionId: pageCollection.id, maxSelect: 1 },
		text('type'),
		{ name: 'data', type: 'json' },
		{ name: 'order', type: 'number' },
		...dates
	]);
	const manifest = {
		schemaVersion: 1,
		site: { name: 'Network measurement', locale: 'es' },
		nav: { groups: ['Contenido'] },
		collections: {
			pages: {
				label: 'Páginas',
				labelSingular: 'Página',
				group: 'Contenido',
				order: 1,
				titleField: 'title',
				orderField: 'position',
				defaultSort: { field: 'position', dir: 'asc' },
				editorRail: true,
				page: { pathField: 'path' },
				listFields: ['title', 'status', 'position'],
				fields: {
					title: { label: 'Título' },
					body: { label: 'Texto', widget: 'textarea' },
					links: { label: 'Relaciones' },
					position: { label: 'Posición' }
				},
				blocks: {
					collection: 'blocks',
					parentField: 'parent',
					typeField: 'type',
					dataField: 'data',
					orderField: 'order'
				}
			},
			tags: {
				label: 'Etiquetas',
				labelSingular: 'Etiqueta',
				group: 'Contenido',
				order: 2,
				titleField: 'name'
			},
			blocks: { label: 'Bloques', labelSingular: 'Bloque', group: 'Contenido', order: 3 }
		},
		blockTypes: {
			hero: {
				label: 'Hero',
				fields: [{ name: 'title', label: 'Título', widget: 'text', source: 'data', default: '' }]
			}
		}
	};
	const backend = createPocketBaseBackend({ url: server.url });
	await backend.login({ email: server.adminEmail, password: server.adminPassword });
	const schemaSnapshot = await backend.listContentTypes();
	await admin
		.collection('vega')
		.create({ key: 'default', manifestVersion: 1, manifest, schemaSnapshot });
	await resetL9(admin);
	return admin;
}
export async function resetL9(admin: PocketBase, listMode = false) {
	// Only this fixture's data: never truncate a supplied external/production server.
	const config = await admin.collection('vega').getFirstListItem('key="default"');
	const manifest = structuredClone(config.manifest);
	if (listMode) delete manifest.collections.pages.defaultSort;
	else manifest.collections.pages.defaultSort = { field: 'position', dir: 'asc' };
	await admin.collection('vega').update(config.id, { manifest });
	for (const name of ['blocks', 'pages', 'tags', 'vega_revisions'])
		await admin.collections.truncate(name);
	const tagIds = [];
	for (let n = 1; n <= 50; n++) {
		const id = idFor('tag', n);
		tagIds.push(id);
		await admin.collection('tags').create({ id, name: `Link ${String(n).padStart(2, '0')}` });
	}
	for (let n = 1; n <= (listMode ? 10 : 60); n++)
		await admin.collection('pages').create({
			id: idFor('page', n),
			title: n <= 10 ? `Needle ${n}` : `Page ${n}`,
			path: `/page-${n}`,
			status: 'draft',
			position: n,
			body: n <= 10 ? 'x'.repeat(64 * 1024) : 'Body',
			links: n === 1 ? tagIds : []
		});
	await admin.collection('blocks').create({
		id: 'block0000000001',
		parent: PAGE_ID,
		type: 'hero',
		order: 1,
		data: { title: 'Visual measurement' }
	});
}
export async function seedTrash(admin: PocketBase, count = 201) {
	await admin.collections.truncate('vega_revisions');
	for (let n = 1; n <= count; n++)
		await admin.collection('vega_revisions').create({
			id: idFor('trash', n),
			collection: 'pages',
			recordId: idFor('deleted', n),
			kind: 'delete',
			values: { title: `Deleted ${n}`, body: 'x'.repeat(64 * 1024) },
			label: `Deleted ${n}`,
			author: EDITOR_EMAIL
		});
}
