/**
 * Fixture de test: reproduce lo que dejaba `seedSiteProject` en `1bda988` (antes de SEO,
 * redirecciones y el punto focal de `vega_media`): mismas colecciones, reglas y campos que su
 * `site-seeding.ts`, el manifiesto de
 * entonces y la página canónica. Se escribe a mano, sin pasar por el sembrado actual, para que un
 * test no pueda heredar por accidente las piezas nuevas que quiere ver llegar.
 *
 * Lo comparten `site-seeding.test.ts` (adaptador en memoria) y
 * `tests/contract/pocketbase.site-seeding.test.ts` (PocketBase real). No lo importa código de app.
 */

import { VEGA_COLLECTION } from './collections';
import type { BackendPort } from './port';
import {
	SITE_SEED_BLOCKS_READ_RULE,
	SITE_SEED_CANONICAL_PAGE,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_MANIFEST_READ_RULE,
	SITE_SEED_PAGES_READ_RULE
} from './site-seeding';
import previousStarterManifest from './site-seeding-manifest.1bda988.json';
import type { CollectionSpec } from './collections';
import type { JsonValue } from './types';
import { VEGA_MEDIA_EDITOR_ACCESS_RULE, VEGA_MEDIA_VIEW_RULE } from '$lib/media/media-collection';
import { saveManifest } from '$lib/model/load';

export { previousStarterManifest };

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
	const editorRule = SITE_SEED_EDITOR_ACCESS_RULE;
	await port.ensureCollections([{ name: 'vega_editors', type: 'auth', fields: [] }]);
	await port.ensureCollections([
		{
			name: 'pages',
			listRule: SITE_SEED_PAGES_READ_RULE,
			viewRule: SITE_SEED_PAGES_READ_RULE,
			createRule: editorRule,
			updateRule: editorRule,
			deleteRule: editorRule,
			fields: [
				{ name: 'title', type: 'text', required: true, max: 200 },
				{ name: 'path', type: 'text', required: true, max: 200, unique: true },
				{ name: 'layout', type: 'text', max: 64 },
				{ name: 'status', type: 'select', options: ['draft', 'published'], multiple: false }
			]
		}
	]);
	await port.ensureCollections([VEGA_MEDIA_COLLECTION_BEFORE_FOCAL]);
	await port.ensureCollections([
		{
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
		}
	]);
	await port.ensureCollections([
		{
			...VEGA_COLLECTION,
			fields: [...VEGA_COLLECTION.fields],
			listRule: SITE_SEED_MANIFEST_READ_RULE,
			viewRule: SITE_SEED_MANIFEST_READ_RULE
		}
	]);
	await saveManifest(port, structuredClone(previousStarterManifest) as JsonValue);
	await port.create('pages', { ...SITE_SEED_CANONICAL_PAGE });
}
