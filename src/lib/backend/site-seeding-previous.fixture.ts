/**
 * Fixtures de test: reproducen lo que dejaba `seedSiteProject` en versiones anteriores del
 * sembrado — mismas colecciones, reglas y campos que su `site-seeding.ts`, el manifiesto de
 * entonces y la página canónica:
 * - `seedLikePrevious1bda988`: antes de SEO, redirecciones y el punto focal de `vega_media`.
 * - `seedLikePrevious0ace139`: con SEO y redirecciones, antes del punto focal, de
 *   `vega_editors.created` y de la publicación programada (`pages.publishAt`).
 * Se escriben a mano, sin pasar por el sembrado actual, para que un test no pueda heredar por
 * accidente las piezas nuevas que quiere ver llegar.
 *
 * Lo comparten `site-seeding.test.ts` (adaptador en memoria) y
 * `tests/contract/pocketbase.site-seeding.test.ts` (PocketBase real). No lo importa código de app.
 */

import { VEGA_COLLECTION, type CollectionFieldSpec, type CollectionSpec } from './collections';
import type { BackendPort } from './port';
import {
	SITE_SEED_BLOCKS_READ_RULE,
	SITE_SEED_CANONICAL_PAGE,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_MANIFEST_READ_RULE,
	SITE_SEED_PAGES_READ_RULE,
	SITE_SEED_REDIRECTS_READ_RULE
} from './site-seeding';
import previousStarterManifest from './site-seeding-manifest.1bda988.json';
import starterManifest0ace139 from './site-seeding-manifest.0ace139.json';
import type { JsonValue } from './types';
import { VEGA_MEDIA_EDITOR_ACCESS_RULE, VEGA_MEDIA_VIEW_RULE } from '$lib/media/media-collection';
import { saveManifest } from '$lib/model/load';

export { previousStarterManifest, starterManifest0ace139 };

/**
 * Un manifiesto EDITADO A MANO sobre el inicial de `0ace139` (así que aún le faltan las entradas
 * de la publicación programada). Lo que una persona haría de verdad:
 * - etiquetas cambiadas: el sitio, `pages`, el campo `description` y el bloque `hero`;
 * - una columna quitada de `pages.listFields`;
 * - una colección propia (`recetas`) y un tipo de bloque propio (`receta`);
 * - una entrada de la base BORRADA a propósito: `collections.redirects`.
 * Devuelve una copia nueva cada vez.
 */
export function handEditedManifest(): JsonValue {
	const manifest = structuredClone(starterManifest0ace139) as unknown as {
		site: { name: string };
		collections: Record<string, Record<string, unknown>>;
		blockTypes: Record<string, Record<string, unknown>>;
	};
	manifest.site.name = 'Mi taller';
	manifest.collections.pages.label = 'Hojas';
	manifest.collections.pages.listFields = ['title', 'status'];
	(manifest.collections.pages.fields as Record<string, Record<string, unknown>>).description.label =
		'Entradilla';
	manifest.collections.recetas = { label: 'Recetas', icon: 'tag' };
	delete manifest.collections.redirects;
	manifest.blockTypes.hero.label = 'Cabecera';
	manifest.blockTypes.receta = {
		label: 'Receta',
		icon: 'tag',
		fields: [{ name: 'raciones', label: 'Raciones', widget: 'text', source: 'data', default: '' }]
	};
	return manifest as unknown as JsonValue;
}

const editorRule = SITE_SEED_EDITOR_ACCESS_RULE;

const PAGES_FIELDS_1BDA988: CollectionFieldSpec[] = [
	{ name: 'title', type: 'text', required: true, max: 200 },
	{ name: 'path', type: 'text', required: true, max: 200, unique: true },
	{ name: 'layout', type: 'text', max: 64 },
	{ name: 'status', type: 'select', options: ['draft', 'published'], multiple: false }
];

function pagesSpec(fields: CollectionFieldSpec[]): CollectionSpec {
	return {
		name: 'pages',
		listRule: SITE_SEED_PAGES_READ_RULE,
		viewRule: SITE_SEED_PAGES_READ_RULE,
		createRule: editorRule,
		updateRule: editorRule,
		deleteRule: editorRule,
		fields
	};
}

const BLOCKS_SPEC: CollectionSpec = {
	name: 'blocks',
	listRule: SITE_SEED_BLOCKS_READ_RULE,
	viewRule: SITE_SEED_BLOCKS_READ_RULE,
	createRule: editorRule,
	updateRule: editorRule,
	deleteRule: editorRule,
	fields: [
		{
			name: 'parent',
			type: 'relation',
			target: 'pages',
			required: true,
			multiple: false,
			cascadeDelete: true
		},
		{ name: 'order', type: 'number' },
		{ name: 'type', type: 'text', required: true, max: 64 },
		{ name: 'data', type: 'json' },
		{
			name: 'image',
			type: 'relation',
			target: 'vega_media',
			required: false,
			multiple: false,
			cascadeDelete: false
		},
		{
			name: 'images',
			type: 'relation',
			target: 'vega_media',
			required: false,
			multiple: true,
			cascadeDelete: false
		}
	]
};

const MANIFEST_SPEC: CollectionSpec = {
	...VEGA_COLLECTION,
	fields: [...VEGA_COLLECTION.fields],
	listRule: SITE_SEED_MANIFEST_READ_RULE,
	viewRule: SITE_SEED_MANIFEST_READ_RULE
};

/**
 * `vega_media` tal como la creaba `ensureMediaCollection` antes del punto focal: los cinco campos
 * de entonces, escritos a mano. Llamar hoy a `ensureMediaCollection` crearía ya `focal`, y el
 * fixture dejaría de reproducir una biblioteca previa sin que ningún test lo notara.
 */
export const VEGA_MEDIA_COLLECTION_BEFORE_FOCAL: CollectionSpec = {
	name: 'vega_media',
	listRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	viewRule: VEGA_MEDIA_VIEW_RULE,
	createRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	updateRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	deleteRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	fields: [
		{
			name: 'file',
			type: 'file',
			required: true,
			multiple: false,
			maxSizeBytes: 10 * 1024 * 1024,
			mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'],
			thumbs: ['300x300', '120x120', '28x28']
		},
		{ name: 'alt', type: 'text' },
		{ name: 'title', type: 'text' },
		{ name: 'tags', type: 'json' },
		{ name: 'created', type: 'autodate' }
	]
};

export async function seedLikePrevious1bda988(port: BackendPort): Promise<void> {
	await port.ensureCollections([{ name: 'vega_editors', type: 'auth', fields: [] }]);
	await port.ensureCollections([pagesSpec(PAGES_FIELDS_1BDA988)]);
	await port.ensureCollections([VEGA_MEDIA_COLLECTION_BEFORE_FOCAL]);
	await port.ensureCollections([BLOCKS_SPEC]);
	await port.ensureCollections([MANIFEST_SPEC]);
	await saveManifest(port, structuredClone(previousStarterManifest) as JsonValue);
	await port.create('pages', { ...SITE_SEED_CANONICAL_PAGE });
}

export async function seedLikePrevious0ace139(port: BackendPort): Promise<void> {
	await port.ensureCollections([{ name: 'vega_editors', type: 'auth', fields: [] }]);
	// `vega_media` antes que `pages`: `pages.socialImage` la enlaza (mismo orden que en 0ace139).
	await port.ensureCollections([VEGA_MEDIA_COLLECTION_BEFORE_FOCAL]);
	await port.ensureCollections([
		pagesSpec([
			...PAGES_FIELDS_1BDA988,
			{ name: 'description', type: 'text', max: 300 },
			{
				name: 'socialImage',
				type: 'relation',
				target: 'vega_media',
				multiple: false,
				cascadeDelete: false
			},
			{ name: 'noindex', type: 'bool' }
		])
	]);
	await port.ensureCollections([BLOCKS_SPEC]);
	await port.ensureCollections([
		{
			name: 'redirects',
			listRule: SITE_SEED_REDIRECTS_READ_RULE,
			viewRule: SITE_SEED_REDIRECTS_READ_RULE,
			createRule: editorRule,
			updateRule: editorRule,
			deleteRule: editorRule,
			fields: [
				{ name: 'from', type: 'text', required: true, max: 200, unique: true },
				{ name: 'to', type: 'text', required: true, max: 2000 },
				{ name: 'code', type: 'select', options: ['301', '308'], multiple: false, required: true }
			]
		}
	]);
	await port.ensureCollections([MANIFEST_SPEC]);
	await saveManifest(port, structuredClone(starterManifest0ace139) as JsonValue);
	await port.create('pages', { ...SITE_SEED_CANONICAL_PAGE });
}
