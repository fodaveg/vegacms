/**
 * Menús planos del sitio: claves estables, elementos ordenados y destinos con relación real.
 * No se siembra en la base: los sitios existentes pueden tener ya su propia navegación.
 *
 * La relación `page` se vacía al borrar la página (PocketBase 0.39.9, sonda de contrato). Si queda
 * una `url`, incluido un ancla, se convierte en un enlace libre: el esquema no conserva su origen.
 */
import {
	SITE_SEED_AUTODATE_FIELDS,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_KEY_UPDATE_RULE,
	type SiteSeedModule
} from './site-seeding';
import type { CollectionSpec } from './collections';
import type { JsonValue } from './types';

export const SITE_SEED_MENU_ITEMS_READ_RULE = `page = "" || page.status = "published" || ${SITE_SEED_EDITOR_ACCESS_RULE}`;
/** Mismo límite de rutas seguras que redirects.to, más anclas y correo. */
export const SITE_SEED_MENU_URL_PATTERN = String.raw`^(/$|/[^/\\\x00-\x20]|#[^\x00-\x20]|https?://|mailto:[^\x00-\x20])`;

const MENUS_COLLECTION: CollectionSpec = {
	projectEditorRules: true,
	name: 'menus',
	listRule: '',
	viewRule: '',
	createRule: null,
	updateRule: SITE_SEED_KEY_UPDATE_RULE,
	deleteRule: null,
	fields: [
		{
			name: 'key',
			type: 'text',
			required: true,
			unique: true,
			max: 40,
			pattern: '^[a-z][a-z0-9-]*$'
		},
		{ name: 'name', type: 'text', required: true, max: 80 },
		...SITE_SEED_AUTODATE_FIELDS
	]
};

const MENU_ITEMS_COLLECTION: CollectionSpec = {
	projectEditorRules: true,
	name: 'menu_items',
	listRule: SITE_SEED_MENU_ITEMS_READ_RULE,
	viewRule: SITE_SEED_MENU_ITEMS_READ_RULE,
	createRule: SITE_SEED_EDITOR_ACCESS_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
	fields: [
		{
			name: 'menu',
			type: 'relation',
			target: 'menus',
			required: true,
			multiple: false,
			cascadeDelete: true
		},
		{ name: 'order', type: 'number' },
		{ name: 'label', type: 'text', max: 80 },
		{ name: 'page', type: 'relation', target: 'pages', multiple: false, cascadeDelete: false },
		{ name: 'url', type: 'text', max: 2000, pattern: SITE_SEED_MENU_URL_PATTERN },
		...SITE_SEED_AUTODATE_FIELDS
	]
};

const MENUS_MANIFEST: JsonValue = {
	nav: { groups: ['Sitio'] },
	collections: {
		menus: {
			label: 'Menús',
			labelSingular: 'Menú',
			icon: 'list',
			group: 'Sitio',
			order: 5,
			hideCreate: true,
			titleField: 'name',
			subtitleField: 'key',
			listFields: ['name', 'key'],
			fields: {
				name: { label: 'Nombre' },
				key: {
					label: 'Clave',
					help: 'La usa el código del sitio para encontrar este menú. Solo la puede cambiar un superusuario.'
				}
			},
			blocks: { collection: 'menu_items', parentField: 'menu', orderField: 'order' }
		},
		menu_items: {
			label: 'Elementos de menú',
			labelSingular: 'Elemento',
			icon: 'link',
			hidden: true,
			titleField: 'label',
			fields: {
				label: {
					label: 'Texto',
					help: 'Lo que se lee en el menú. Si eliges una página y lo dejas vacío, se usa el título de la página.'
				},
				page: {
					label: 'Página',
					help: 'El enlace sigue a la página aunque cambie su dirección. Mientras la página esté en borrador, el elemento no sale en el sitio.'
				},
				url: {
					label: 'Dirección',
					help: 'Para lo que no es una página: una ruta (/blog), un ancla (#equipo), una dirección completa (https://...) o un correo (mailto:...). Si también eliges página, solo cuenta un ancla, que lleva a esa parte de la página.'
				}
			}
		}
	}
};

export const SITE_SEED_MENUS_MODULE: SiteSeedModule = {
	id: 'menus',
	collections: [MENUS_COLLECTION, MENU_ITEMS_COLLECTION],
	manifest: MENUS_MANIFEST,
	records: [
		{ collection: 'menus', keyField: 'key', key: 'principal', values: { name: 'Menú principal' } },
		{ collection: 'menus', keyField: 'key', key: 'pie', values: { name: 'Pie' } }
	]
};
