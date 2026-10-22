import type { JsonValue } from './types';
import { describe, expect, test } from 'vitest';
import { createMemoryBackend } from './adapters/memory';
import {
	previewSiteSeed,
	seedSiteProject,
	SITE_SEED_AUTODATE_FIELDS,
	SITE_SEED_KEY_UPDATE_RULE,
	SITE_SEED_EDITOR_ACCESS_RULE
} from './site-seeding';
import {
	SITE_SEED_MENUS_MODULE,
	SITE_SEED_MENU_ITEMS_READ_RULE,
	SITE_SEED_MENU_URL_PATTERN
} from './site-seeding-menus';
import { SITE_SEED_SITE_SETTINGS_MODULE } from './site-seeding-site-settings';
import { mergeManifestFragment } from './site-seeding-merge';
import starterManifest from './site-seeding-manifest.json';
import { validateManifestStrict } from '$lib/model/validate';
import { resolveContentModel } from '$lib/model/resolve';

const modules = [SITE_SEED_MENUS_MODULE, SITE_SEED_SITE_SETTINGS_MODULE];

describe.each(modules)('módulo $id', (module) => {
	test('fragmento válido y fechas de cambios en todas sus colecciones', () => {
		const { manifest } = mergeManifestFragment(starterManifest as JsonValue, module.manifest);
		expect(validateManifestStrict(manifest)).toMatchObject({ ok: true });
		for (const collection of module.collections) {
			expect(collection.fields).toEqual(expect.arrayContaining([...SITE_SEED_AUTODATE_FIELDS]));
		}
	});

	test('siembra en limpio, resuelve el modelo y la segunda pasada no escribe', async () => {
		const port = createMemoryBackend();
		await port.login({ email: 'admin@vega.test', password: 'test-password' });
		const first = await seedSiteProject(port, { modules: [module] });
		expect(first.createdModuleRecords).toHaveLength(module.records!.length);
		const second = await seedSiteProject(port, { modules: [module] });
		expect(second).toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
		const preview = await previewSiteSeed(port, { modules: [module] });
		expect(preview).toMatchObject({ status: 'ready', plan: { upToDate: true } });
		const model = resolveContentModel({
			types: await port.listContentTypes(),
			manifestRaw: (await port.list('vega')).items[0]!.values.manifest,
			accessBypass: true
		});
		expect(model.warnings).toEqual([]);
	});
});

describe('Menús', () => {
	test('declara padre antes de hijos, claves protegidas y lectura por estado de página', () => {
		const [menus, items] = SITE_SEED_MENUS_MODULE.collections;
		expect(menus).toMatchObject({
			name: 'menus',
			listRule: '',
			viewRule: '',
			createRule: null,
			updateRule: SITE_SEED_KEY_UPDATE_RULE,
			deleteRule: null
		});
		expect(menus!.fields).toContainEqual({
			name: 'key',
			type: 'text',
			required: true,
			unique: true,
			max: 40,
			pattern: '^[a-z][a-z0-9-]*$'
		});
		expect(items).toMatchObject({
			name: 'menu_items',
			listRule: SITE_SEED_MENU_ITEMS_READ_RULE,
			viewRule: SITE_SEED_MENU_ITEMS_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(items!.fields).toEqual(
			expect.arrayContaining([
				{
					name: 'menu',
					type: 'relation',
					target: 'menus',
					required: true,
					multiple: false,
					cascadeDelete: true
				},
				{ name: 'page', type: 'relation', target: 'pages', multiple: false, cascadeDelete: false }
			])
		);
	});

	test.each([
		'/',
		'/blog',
		'#equipo',
		'https://example.test',
		'http://example.test',
		'mailto:ana@example.test'
	])('acepta dirección %s', (url) => {
		expect(new RegExp(SITE_SEED_MENU_URL_PATTERN).test(url)).toBe(true);
	});
	test.each([
		'javascript:alert(1)',
		'data:text/html,abc',
		'//evil.test',
		'/\\evil.test',
		'/\t/evil.test',
		'#',
		'mailto:'
	])('rechaza dirección %s', (url) => {
		expect(new RegExp(SITE_SEED_MENU_URL_PATTERN).test(url)).toBe(false);
	});
});

describe('Datos del sitio', () => {
	test('campos escalares, imagen sin cascada, registro vacío y singleton explícito', () => {
		const [collection] = SITE_SEED_SITE_SETTINGS_MODULE.collections;
		expect(collection).toMatchObject({
			name: 'site_settings',
			listRule: '',
			viewRule: '',
			createRule: null,
			updateRule: SITE_SEED_KEY_UPDATE_RULE,
			deleteRule: null
		});
		expect(collection!.fields).toEqual(
			expect.arrayContaining([
				{ name: 'siteTitle', type: 'text', max: 80 },
				{
					name: 'socialImage',
					type: 'relation',
					target: 'vega_media',
					multiple: false,
					cascadeDelete: false
				}
			])
		);
		expect(SITE_SEED_SITE_SETTINGS_MODULE.records).toEqual([
			{ collection: 'site_settings', keyField: 'key', key: 'default' }
		]);
		expect(SITE_SEED_SITE_SETTINGS_MODULE.manifest).toMatchObject({
			collections: { site_settings: { singleton: true, fields: { key: { hidden: true } } } }
		});
	});

	test('conserva campos bilingües y localizedFields del proyecto al añadir el módulo', () => {
		const own = {
			schemaVersion: 1,
			collections: {
				site_settings: {
					fields: { descriptionEn: { label: 'English description' } },
					localizedFields: {
						description: {
							label: 'Descripción',
							fields: { es: 'description', en: 'descriptionEn' }
						}
					}
				}
			}
		};
		const { manifest } = mergeManifestFragment(own, SITE_SEED_SITE_SETTINGS_MODULE.manifest);
		expect(manifest).toMatchObject(own);
		expect(validateManifestStrict(manifest)).toMatchObject({ ok: true });
	});

	test('socialImage como file bloquea todo antes de escribir', async () => {
		const port = createMemoryBackend();
		await port.login({ email: 'admin@vega.test', password: 'test-password' });
		await port.ensureCollections([
			{ name: 'site_settings', fields: [{ name: 'socialImage', type: 'file' }] }
		]);
		expect(
			await previewSiteSeed(port, { modules: [SITE_SEED_SITE_SETTINGS_MODULE] })
		).toMatchObject({
			status: 'blocked',
			divergences: [expect.objectContaining({ piece: 'campo "site_settings.socialImage"' })]
		});
		expect((await port.listContentTypes()).map((type) => type.name)).not.toContain('pages');
	});
});
