/**
 * Fixtures de test: reproducen lo que dejaba `seedSiteProject` en versiones anteriores del
 * sembrado — mismas colecciones, reglas y campos que su `site-seeding.ts`, el manifiesto de
 * entonces y la página canónica:
 * - `seedLikePrevious1bda988`: antes de SEO y redirecciones.
 * - `seedLikePrevious0ace139`: con SEO y redirecciones, antes de la publicación programada
 *   (`pages.publishAt`).
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
import { ensureMediaCollection } from '$lib/media/media-collection';
import { saveManifest } from '$lib/model/load';

export { previousStarterManifest, starterManifest0ace139 };

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

export async function seedLikePrevious1bda988(port: BackendPort): Promise<void> {
	await port.ensureCollections([{ name: 'vega_editors', type: 'auth', fields: [] }]);
	await port.ensureCollections([pagesSpec(PAGES_FIELDS_1BDA988)]);
	await ensureMediaCollection(port);
	await port.ensureCollections([BLOCKS_SPEC]);
	await port.ensureCollections([MANIFEST_SPEC]);
	await saveManifest(port, structuredClone(previousStarterManifest) as JsonValue);
	await port.create('pages', { ...SITE_SEED_CANONICAL_PAGE });
}

export async function seedLikePrevious0ace139(port: BackendPort): Promise<void> {
	await port.ensureCollections([{ name: 'vega_editors', type: 'auth', fields: [] }]);
	// `vega_media` antes que `pages`: `pages.socialImage` la enlaza (mismo orden que en 0ace139).
	await ensureMediaCollection(port);
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
