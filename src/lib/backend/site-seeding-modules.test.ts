import { describe, expect, test } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import {
	previewSiteSeed,
	seedSiteProject,
	SITE_SEED_BASE_MODULE,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_PAGES_READ_RULE,
	type SiteSeedModule
} from './site-seeding';
import { SITE_SEED_BLOG_MODULE, SITE_SEED_TAGS_READ_RULE } from './site-seeding-blog';
import { CONTACT_CREATE_RULE, SITE_SEED_CONTACT_MODULE } from './site-seeding-contact';
import starterManifest from './site-seeding-manifest.json';
import { mergeManifestFragment } from './site-seeding-merge';
import {
	findSiteSeedModule,
	SITE_SEED_MODULES,
	SITE_SEED_OPTIONAL_MODULES
} from './site-seeding-modules';
import {
	handEditedManifest,
	previousStarterManifest,
	seedLikePrevious0ace139,
	starterManifest0ace139
} from './site-seeding-previous.fixture';
import type { JsonValue } from './types';
import { resolveContentModel } from '$lib/model/resolve';
import { validateManifestStrict } from '$lib/model/validate';

type JsonObject = { [key: string]: JsonValue };

async function authedMemory(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

async function savedManifest(port: MemoryBackendPort): Promise<JsonObject> {
	return (await port.list('vega', { perPage: 1 })).items[0]!.values.manifest as JsonObject;
}

/** Los grupos del menú que resuelve el modelo, con las colecciones de cada uno, en orden. */
async function resolvedNav(port: MemoryBackendPort): Promise<Array<[string | null, string[]]>> {
	const model = resolveContentModel({
		types: await port.listContentTypes(),
		manifestRaw: await savedManifest(port),
		accessBypass: true
	});
	return model.nav.groups.map((group) => [group.label, group.items.map((item) => item.type)]);
}

const SAVED_MANIFESTS: Array<[string, () => JsonValue]> = [
	['el inicial actual', () => structuredClone(starterManifest) as JsonValue],
	['el inicial de 1bda988', () => structuredClone(previousStarterManifest) as JsonValue],
	['el inicial de 0ace139', () => structuredClone(starterManifest0ace139) as JsonValue],
	['el editado a mano', handEditedManifest]
];

const MODULES: Array<[string, SiteSeedModule, string[]]> = [
	['blog', SITE_SEED_BLOG_MODULE, ['collections.posts', 'collections.tags']],
	['contacto', SITE_SEED_CONTACT_MODULE, ['collections.messages']]
];

describe('registro de módulos de sembrado', () => {
	test('la base va la primera y los opcionales son `blog` y `contacto`, en ese orden', () => {
		expect(SITE_SEED_MODULES.map((module) => module.id)).toEqual(['base', 'blog', 'contacto']);
		expect(SITE_SEED_OPTIONAL_MODULES).toEqual([SITE_SEED_BLOG_MODULE, SITE_SEED_CONTACT_MODULE]);
		expect(SITE_SEED_OPTIONAL_MODULES).not.toContain(SITE_SEED_BASE_MODULE);
		expect(findSiteSeedModule('blog')).toBe(SITE_SEED_BLOG_MODULE);
		expect(findSiteSeedModule('contacto')).toBe(SITE_SEED_CONTACT_MODULE);
		expect(findSiteSeedModule('tienda')).toBeUndefined();
	});

	test('sin pedirlos, sembrar no crea ninguna colección de los opcionales', async () => {
		const port = await authedMemory();

		await seedSiteProject(port);

		const names = (await port.listContentTypes()).map((type) => type.name);
		for (const name of ['posts', 'tags', 'messages']) expect(names).not.toContain(name);
	});
});

describe.each(MODULES)('fragmento de manifiesto del módulo %s', (_id, module, entries) => {
	test.each(SAVED_MANIFESTS)(
		'sobre %s (ya con la base) añade sus entradas, no toca nada y sigue siendo válido',
		(_name, saved) => {
			const withBase = mergeManifestFragment(saved(), SITE_SEED_BASE_MODULE.manifest).manifest;
			const before = JSON.stringify(withBase);

			const { manifest, added, skipped } = mergeManifestFragment(withBase, module.manifest);

			expect(validateManifestStrict(manifest)).toMatchObject({ ok: true });
			expect(added).toEqual(entries);
			expect(skipped).toEqual([]);
			// Lo que había sigue igual y delante: lo nuevo va al final de `collections`.
			expect(JSON.stringify(withBase)).toBe(before);
			const collections = Object.keys((manifest as JsonObject).collections as JsonObject);
			const previous = Object.keys((withBase as JsonObject).collections as JsonObject);
			expect(collections).toEqual([...previous, ...entries.map((entry) => entry.split('.')[1]!)]);
			expect(mergeManifestFragment(manifest, module.manifest).added).toEqual([]);
		}
	);

	test('sobre un manifiesto vacío (base y módulo a la vez) forma un manifiesto válido', () => {
		const base = mergeManifestFragment({}, SITE_SEED_BASE_MODULE.manifest).manifest;

		const { manifest } = mergeManifestFragment(base, module.manifest);

		expect(validateManifestStrict(manifest)).toMatchObject({ ok: true });
	});

	test('cada colección del módulo tiene su entrada de manifiesto, y al revés', () => {
		const declared = Object.keys((module.manifest as JsonObject).collections as JsonObject);

		expect(declared.sort()).toEqual(module.collections.map((spec) => spec.name).sort());
	});
});

describe('módulo blog', () => {
	test('`posts` usa las reglas de `pages` y `tags` se lee sin sesión; solo los editores escriben', () => {
		const [tags, posts] = SITE_SEED_BLOG_MODULE.collections;

		expect([tags!.name, posts!.name]).toEqual(['tags', 'posts']);
		expect(posts).toMatchObject({
			listRule: SITE_SEED_PAGES_READ_RULE,
			viewRule: SITE_SEED_PAGES_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(tags).toMatchObject({
			listRule: SITE_SEED_TAGS_READ_RULE,
			viewRule: SITE_SEED_TAGS_READ_RULE,
			createRule: SITE_SEED_EDITOR_ACCESS_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
	});

	test('los campos de publicación y SEO de `posts` son los MISMOS objetos que los de `pages`', () => {
		const pages = SITE_SEED_BASE_MODULE.collections.find((spec) => spec.name === 'pages')!;
		const posts = SITE_SEED_BLOG_MODULE.collections.find((spec) => spec.name === 'posts')!;

		for (const name of ['status', 'publishAt', 'description', 'socialImage', 'noindex']) {
			const shared = pages.fields.find((field) => field.name === name);
			expect(shared).toBeDefined();
			expect(posts.fields.find((field) => field.name === name)).toBe(shared);
		}
		expect(posts.fields.map((field) => field.name)).toEqual([
			'title',
			'slug',
			'excerpt',
			'body',
			'cover',
			'status',
			'publishAt',
			'date',
			'tags',
			'description',
			'socialImage',
			'noindex',
			'created',
			'updated'
		]);
	});

	test('la ayuda del campo de etiquetas dice dónde se crean', () => {
		const posts = ((SITE_SEED_BLOG_MODULE.manifest as JsonObject).collections as JsonObject)
			.posts as { fields: { tags: { help: string } }; listFields: string[] };

		expect(posts.fields.tags.help).toContain('«Etiquetas»');
		expect(posts.listFields).toEqual(['title', 'status', 'date']);
	});

	test('añadido a un sitio en memoria: crea `tags` y `posts`, el `slug` es único y la segunda pasada no hace nada', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);

		const result = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		expect(result).toEqual({
			createdCollections: ['tags', 'posts'],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: ['manifest'],
			manifestEntries: { blog: ['collections.posts', 'collections.tags'] }
		});
		const tag = await port.create('tags', { name: 'Taller', slug: 'taller' });
		await port.create('posts', { title: 'Hola', slug: 'hola', tags: [tag.id] });
		await expect(port.create('posts', { title: 'Otra', slug: 'hola' })).rejects.toMatchObject({
			kind: 'validation'
		});
		await expect(seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] })).resolves.toEqual({
			createdCollections: [],
			addedFields: {},
			createdRecords: [],
			upgradedRecords: []
		});
	});
});

describe('módulo contacto', () => {
	test('`messages`: crea cualquiera que cumpla la regla medida; el resto, solo editores', () => {
		const [messages] = SITE_SEED_CONTACT_MODULE.collections;

		expect(CONTACT_CREATE_RULE).toBe('@request.body.website = "" && @request.body.read != true');
		expect(messages).toMatchObject({
			name: 'messages',
			listRule: SITE_SEED_EDITOR_ACCESS_RULE,
			viewRule: SITE_SEED_EDITOR_ACCESS_RULE,
			createRule: CONTACT_CREATE_RULE,
			updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
			deleteRule: SITE_SEED_EDITOR_ACCESS_RULE
		});
		expect(messages!.fields).toEqual([
			{ name: 'name', type: 'text', required: true, max: 200 },
			{ name: 'email', type: 'email', required: true },
			{ name: 'message', type: 'text', required: true, max: 5000 },
			{ name: 'read', type: 'bool' },
			{ name: 'created', type: 'autodate' }
		]);
		// El campo trampa NO es un campo de la colección.
		expect(messages!.fields.map((field) => field.name)).not.toContain('website');
	});

	test('el listado enseña nombre, correo, fecha y leído', () => {
		const messages = ((SITE_SEED_CONTACT_MODULE.manifest as JsonObject).collections as JsonObject)
			.messages as { listFields: string[]; fields: { email: { label: string } } };

		expect(messages.listFields).toEqual(['name', 'email', 'created', 'read']);
		expect(messages.fields.email.label).toBe('Correo');
	});
});

describe('navegación de un módulo añadido a un sitio ya sembrado', () => {
	test('sitio sembrado tal cual: las colecciones nuevas salen en «Sitio», detrás de las de la base', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);

		await seedSiteProject(port, { modules: [...SITE_SEED_OPTIONAL_MODULES] });

		expect(await resolvedNav(port)).toEqual([
			['Sitio', ['pages', 'redirects', 'posts', 'tags', 'messages']]
		]);
		// El grupo ya estaba declarado: `nav` no cambia.
		expect((await savedManifest(port)).nav).toEqual({ groups: ['Sitio'] });
	});

	test.each([
		['1bda988', previousStarterManifest],
		['0ace139', starterManifest0ace139]
	])('con el manifiesto inicial de %s también salen en el menú', async (_name, manifest) => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const record = (await port.list('vega', { perPage: 1 })).items[0]!;
		await port.update('vega', record.id, { manifest: structuredClone(manifest) as JsonValue });

		await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		const sitio = (await resolvedNav(port)).find(([label]) => label === 'Sitio')!;
		expect(sitio[1]).toEqual(expect.arrayContaining(['pages', 'posts', 'tags']));
	});

	test('menú editado a mano (reordenado, con un grupo propio y sin «Sitio»): conserva su orden y recibe el grupo al final', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const record = (await port.list('vega', { perPage: 1 })).items[0]!;
		const edited = structuredClone(record.values.manifest) as {
			nav: { groups: string[] };
			collections: Record<string, { group?: string }>;
		};
		edited.nav.groups = ['Taller', 'Web'];
		edited.collections.pages.group = 'Web';
		edited.collections.redirects.group = 'Taller';
		await port.update('vega', record.id, { manifest: edited as unknown as JsonValue });

		const preview = await previewSiteSeed(port, { modules: [SITE_SEED_BLOG_MODULE] });
		if (preview.status !== 'ready') throw new Error('se esperaba un plan');
		// La base también declara «Sitio»: es ella quien lo añade, y el blog ya lo encuentra.
		expect(preview.modules.map((module) => [module.id, module.manifestEntries])).toEqual([
			['base', ['nav.groups.Sitio']],
			['blog', ['collections.posts', 'collections.tags']]
		]);
		await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		expect((await savedManifest(port)).nav).toEqual({ groups: ['Taller', 'Web', 'Sitio'] });
		expect(await resolvedNav(port)).toEqual([
			['Taller', ['redirects']],
			['Web', ['pages']],
			['Sitio', ['posts', 'tags']]
		]);
		// Segunda pasada: nada que añadir, y el menú no se mueve.
		const again = await previewSiteSeed(port, { modules: [SITE_SEED_BLOG_MODULE] });
		expect(again).toMatchObject({ status: 'ready', plan: { upToDate: true } });
	});
});
