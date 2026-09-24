/**
 * Fixture de test: reproduce lo que dejaba `seedSiteProject` en `1bda988` (antes de SEO y
 * redirecciones): mismas colecciones, reglas y campos que su `site-seeding.ts`, el manifiesto de
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
import type { JsonValue } from './types';
import { ensureMediaCollection } from '$lib/media/media-collection';
import { saveManifest } from '$lib/model/load';

export { previousStarterManifest };

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
	await ensureMediaCollection(port);
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
