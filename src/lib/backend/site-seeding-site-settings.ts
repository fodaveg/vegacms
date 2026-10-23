/**
 * Datos públicos comunes del sitio, como singleton opcional. El nombre del proyecto en el admin
 * (`site.name`) y el nombre público (`siteTitle`) se editan por separado.
 * Toda columna añadida a esta colección también es pública salvo que PocketBase la oculte.
 */
import {
	SITE_SEED_AUTODATE_FIELDS,
	SITE_SEED_KEY_UPDATE_RULE,
	type SiteSeedModule
} from './site-seeding';
import type { CollectionSpec } from './collections';
import type { JsonValue } from './types';

const SITE_SETTINGS_COLLECTION: CollectionSpec = {
	projectEditorRules: true,
	name: 'site_settings',
	listRule: '',
	viewRule: '',
	createRule: null,
	updateRule: SITE_SEED_KEY_UPDATE_RULE,
	deleteRule: null,
	fields: [
		{ name: 'key', type: 'text', required: true, unique: true, max: 40 },
		{ name: 'siteTitle', type: 'text', max: 80 },
		{ name: 'description', type: 'text', max: 300 },
		{
			name: 'socialImage',
			type: 'relation',
			target: 'vega_media',
			multiple: false,
			cascadeDelete: false
		},
		{ name: 'footerText', type: 'text', max: 300 },
		...SITE_SEED_AUTODATE_FIELDS
	]
};

const SITE_SETTINGS_MANIFEST: JsonValue = {
	nav: { groups: ['Sitio'] },
	collections: {
		site_settings: {
			label: 'Datos del sitio',
			labelSingular: 'Datos del sitio',
			icon: 'gear',
			group: 'Sitio',
			order: 6,
			singleton: true,
			titleField: 'siteTitle',
			fieldGroups: [{ name: 'SEO', placement: 'aside' }],
			fields: {
				// Las fechas automáticas no forman parte del contenido editorial.
				created: { hidden: true },
				updated: { hidden: true },
				key: { hidden: true },
				siteTitle: {
					label: 'Nombre del sitio',
					help: 'El nombre público del sitio. Lo usan la cabecera, los títulos de las pestañas y las tarjetas al compartir.'
				},
				footerText: { label: 'Texto del pie', widget: 'textarea' },
				description: {
					label: 'Descripción general',
					help: 'Una o dos frases para buscadores y redes. Se usa en las páginas y entradas que no tienen descripción propia.',
					widget: 'textarea',
					group: 'SEO'
				},
				socialImage: {
					mediaKind: 'image',
					label: 'Imagen para redes por defecto',
					help: 'Aparece al compartir una página que no tiene imagen propia. Mejor apaisada, de unos 1200 × 630 px.',
					group: 'SEO'
				}
			}
		}
	}
};

export const SITE_SEED_SITE_SETTINGS_MODULE: SiteSeedModule = {
	id: 'datos-del-sitio',
	collections: [SITE_SETTINGS_COLLECTION],
	manifest: SITE_SETTINGS_MANIFEST,
	records: [{ collection: 'site_settings', keyField: 'key', key: 'default' }]
};
