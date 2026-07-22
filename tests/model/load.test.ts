/**
 * Suite de `loadContentModel`/`saveManifest` contra `createMemoryBackend` (§9.11 del contrato
 * P2): ciclo completo de residencia del manifiesto (§6) — PB virgen, siembra, `multiple-vega-
 * records`, escritor estricto sin tocar red, reflejo tras guardar, y bootstrap de la colección
 * `vega` vía `ensureCollections` (Anexo A / D-P2.2 firmada).
 *
 * `memory` exige sesión viva igual que PocketBase real (§7 del contrato P1): cada test hace
 * login antes de tocar datos/esquema.
 */

import { describe, expect, test } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import type { MemorySeed } from '$lib/backend/adapters/memory';
import type { BackendPort } from '$lib/backend/port';
import { VEGA_COLLECTION } from '$lib/backend/collections';
import { loadContentModel, saveManifest, ManifestValidationError } from '$lib/model/load';
import { categoryType, postType } from './fixture';

const ADMIN_EMAIL = 'admin@vega.test';
const ADMIN_PASSWORD = 'vega-load-test-pw';

/** Seed SIN la colección `vega` (simula un PocketBase recién instalado, §6.6). */
function virginSeed(): MemorySeed {
	return {
		users: [{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }],
		contentTypes: [categoryType, postType],
		records: { category: [], post: [] }
	};
}

async function loggedInPort(seed: MemorySeed) {
	const port = createMemoryBackend(seed);
	await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
	return port;
}

// Manifiesto adaptado del ejemplo de referencia del contrato §3, con los nombres REALES del
// kitchen-sink (`post`/`category`, no `posts`/`ajustes`, que no existen en este fixture).
const EXAMPLE_MANIFEST = {
	schemaVersion: 1,
	site: { name: 'fodaveg.net', defaultTheme: 'grafito', locale: 'es' },
	nav: { groups: ['Contenido', 'Sitio'] },
	collections: {
		post: {
			label: 'Entradas',
			labelSingular: 'Entrada',
			icon: 'pencil',
			group: 'Contenido',
			order: 1,
			previewUrl: 'https://fodaveg.net/blog/{title}',
			listFields: ['title', 'status', 'publishedAt'],
			fields: {
				body: { widget: 'markdown', label: 'Cuerpo' },
				excerpt: { widget: 'textarea', help: 'Resumen para listados y RSS.' }
			}
		},
		category: { label: 'Categorías', icon: 'tag', group: 'Sitio' }
	}
};

describe('11. Ciclo completo con memory (§9.11)', () => {
	test('PB virgen (sin colección vega) → loadContentModel resuelve con defaults', async () => {
		const port = await loggedInPort(virginSeed());
		const model = await loadContentModel(port);

		expect(model.manifest).toEqual({ status: 'absent' });
		expect(model.warnings).toEqual([]);
		expect(model.types.map((t) => t.name).sort()).toEqual(['category', 'post']);
		expect(model.types.find((t) => t.name === 'post')!.label).toBe('Post');
	});

	test('sembrar vega con el ejemplo del §3 (adaptado) → labels/orden/markdown aplicados', async () => {
		const port = await loggedInPort(virginSeed());
		await port.ensureCollections([VEGA_COLLECTION]);
		await port.create('vega', { manifest: EXAMPLE_MANIFEST });

		const model = await loadContentModel(port);

		expect(model.warnings).toEqual([]);
		expect(model.site.name).toBe('fodaveg.net');
		expect(model.site.defaultTheme).toBe('grafito');

		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.label).toBe('Entradas');
		expect(post.group).toBe('Contenido');
		expect(post.listFields).toEqual(['title', 'status', 'publishedAt']);

		const body = post.fields.find((f) => f.name === 'body')!;
		expect(body.widget).toBe('markdown');
		expect(body.subtype).toBe('markdown');
		const excerpt = post.fields.find((f) => f.name === 'excerpt')!;
		expect(excerpt.widget).toBe('textarea');

		const category = model.types.find((t) => t.name === 'category')!;
		expect(category.label).toBe('Categorías');
		expect(category.group).toBe('Sitio');
	});

	test('2 registros en vega → se usa el primero (orden por defecto) + multiple-vega-records', async () => {
		const port = await loggedInPort(virginSeed());
		await port.ensureCollections([VEGA_COLLECTION]);
		await port.create('vega', { manifest: { schemaVersion: 1, site: { name: 'Sitio A' } } });
		await port.create('vega', { manifest: { schemaVersion: 1, site: { name: 'Sitio B' } } });

		// El "primero" es el mismo que resolvería `list('vega', { perPage: 1 })` con el puerto:
		// se calcula aquí para no depender del orden interno (los ids incluyen un componente
		// aleatorio) y así comprobar la consistencia, no adivinar cuál gana.
		const firstPage = await port.list('vega', { perPage: 1 });
		const expectedName = (firstPage.items[0].values.manifest as { site?: { name?: string } }).site!
			.name;

		const model = await loadContentModel(port);

		expect(model.site.name).toBe(expectedName);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'multiple-vega-records', collection: 'vega' })
		]);
	});

	test('contrato v1: el registro key=default gana a cualquier registro legacy', async () => {
		const port = await loggedInPort(virginSeed());
		await port.ensureCollections([VEGA_COLLECTION]);
		await port.create('vega', {
			manifest: { schemaVersion: 1, site: { name: 'Legacy' } }
		});
		await port.create('vega', {
			key: 'default',
			manifestVersion: 1,
			manifest: { schemaVersion: 1, site: { name: 'Canónico' } }
		});

		const model = await loadContentModel(port);

		expect(model.site.name).toBe('Canónico');
		expect(model.warnings).toEqual([]);
	});

	test('contrato v1: una key descubierta no-default gobierna lectura y escritura', async () => {
		const basePort = await loggedInPort(virginSeed());
		const port: BackendPort = { ...basePort, manifestKey: 'fodaveg-main' };
		await port.ensureCollections([VEGA_COLLECTION]);
		await port.create('vega', {
			key: 'default',
			manifestVersion: 1,
			manifest: { schemaVersion: 1, site: { name: 'Otro proyecto' } }
		});
		await port.create('vega', {
			key: 'fodaveg-main',
			manifestVersion: 1,
			manifest: { schemaVersion: 1, site: { name: 'Fodaveg' } }
		});

		expect((await loadContentModel(port)).site.name).toBe('Fodaveg');
		await saveManifest(port, { schemaVersion: 1, site: { name: 'Fodaveg editado' } });

		const records = await port.list('vega', { perPage: 10 });
		const byKey = Object.fromEntries(records.items.map((record) => [record.values.key, record]));
		expect((byKey.default.values.manifest as { site: { name: string } }).site.name).toBe(
			'Otro proyecto'
		);
		expect((byKey['fodaveg-main'].values.manifest as { site: { name: string } }).site.name).toBe(
			'Fodaveg editado'
		);
	});

	test('saveManifest con JSON inválido → rechaza SIN escribir (el registro no cambia)', async () => {
		const port = await loggedInPort(virginSeed());
		await port.ensureCollections([VEGA_COLLECTION]);
		const original = { schemaVersion: 1, site: { name: 'Original' } };
		await port.create('vega', { manifest: original });

		await expect(saveManifest(port, { schemaVersion: 1, snapshot: {} })).rejects.toBeInstanceOf(
			ManifestValidationError
		);
		await expect(saveManifest(port, { schemaVersion: 1, foo: 'bar' })).rejects.toMatchObject({
			errors: expect.arrayContaining([expect.objectContaining({ path: '/foo' })])
		});

		const page = await port.list('vega', { perPage: 2 });
		expect(page.totalItems).toBe(1);
		expect(page.items[0].values.manifest).toEqual(original);
	});

	test('saveManifest con JSON válido → escribe y el siguiente loadContentModel lo refleja', async () => {
		const port = await loggedInPort(virginSeed());
		await port.ensureCollections([VEGA_COLLECTION]);
		await port.create('vega', { manifest: { schemaVersion: 1, site: { name: 'Antes' } } });

		await saveManifest(port, { schemaVersion: 1, site: { name: 'Después' } });

		const page = await port.list('vega', { perPage: 2 });
		expect(page.totalItems).toBe(1);
		expect(page.items[0].values.key).toBe('default');
		expect(page.items[0].values.manifestVersion).toBe(1);

		const model = await loadContentModel(port);
		expect(model.site.name).toBe('Después');
		expect(model.manifest).toEqual({ status: 'loaded', schemaVersion: 1 });
	});

	test('bootstrap: saveManifest sobre un backend sin la colección vega la crea y persiste', async () => {
		const port = await loggedInPort(virginSeed());

		expect((await port.listContentTypes()).some((t) => t.name === 'vega')).toBe(false);

		await saveManifest(port, { schemaVersion: 1, site: { name: 'Recién instalado' } });

		expect((await port.listContentTypes()).some((t) => t.name === 'vega')).toBe(true);
		const model = await loadContentModel(port);
		expect(model.site.name).toBe('Recién instalado');
		expect(model.warnings).toEqual([]);
	});

	// ————— L6b: `schemaSnapshot` — el `ContentType[]` que un superuser deja cacheado junto al
	// manifiesto, para que el adaptador `pocketbase` lo sirva en modo editor (`schemaDiscovery:
	// false`, `GET /api/collections` vedado). `memory` tiene `capabilities.schemaDiscovery: true`
	// SIEMPRE, así que estos tests ejercitan el camino "se escribe" de `saveManifest`. —————

	test('saveManifest (bootstrap) persiste schemaSnapshot con vega YA incluida (fix de code-review, bug bloqueante)', async () => {
		const port = await loggedInPort(virginSeed());

		await saveManifest(port, { schemaVersion: 1, site: { name: 'Con snapshot' } });

		const page = await port.list('vega', { perPage: 1 });
		const snapshot = page.items[0].values.schemaSnapshot as unknown as { name: string }[];
		// `vega` se crea DENTRO de `saveManifest` (vía `ensureCollections`) antes de escribir el
		// snapshot: éste DEBE re-leer `listContentTypes()` tras crearla, igual que vería una
		// introspección real en vivo — si no, un editor (modo snapshot) leería un esquema sin
		// `vega` y `loadContentModel` (§6.2) decidiría "manifiesto ausente" pese a que SÍ existe
		// (bug bloqueante corregido: ver el test de regresión de abajo).
		expect(snapshot.map((t) => t.name).sort()).toEqual(['category', 'post', 'vega']);
	});

	test('REGRESIÓN: snapshot de bootstrap + loadContentModel en modo editor (schemaDiscovery:false) NO ve el manifiesto como ausente', async () => {
		const port = await loggedInPort(virginSeed());
		await saveManifest(port, { schemaVersion: 1, site: { name: 'Sitio del editor' } });

		// Simula el adaptador `pocketbase` en modo editor (L6b): `listContentTypes()` sirve
		// EXCLUSIVAMENTE desde el `schemaSnapshot` ya persistido (nunca introspección en vivo),
		// tal como haría `fetchContentTypesFromSnapshot` — el resto del puerto (list/get/…) sigue
		// siendo el `memory` real, solo se sustituye la fuente del esquema.
		const page = await port.list('vega', { perPage: 1 });
		const snapshot = page.items[0].values.schemaSnapshot as unknown as Awaited<
			ReturnType<BackendPort['listContentTypes']>
		>;
		const editorPort: BackendPort = {
			...port,
			capabilities: { ...port.capabilities, schemaDiscovery: false },
			listContentTypes: async () => snapshot
		};

		const model = await loadContentModel(editorPort);

		expect(model.manifest).toEqual({ status: 'loaded', schemaVersion: 1 });
		expect(model.site.name).toBe('Sitio del editor');
	});

	test('saveManifest (colección vega ya existente) persiste schemaSnapshot con el esquema COMPLETO, `vega` incluida', async () => {
		const port = await loggedInPort(virginSeed());
		await port.ensureCollections([VEGA_COLLECTION]);

		await saveManifest(port, { schemaVersion: 1, site: { name: 'Con snapshot 2' } });

		const page = await port.list('vega', { perPage: 1 });
		const snapshot = page.items[0].values.schemaSnapshot as unknown as { name: string }[];
		expect(snapshot.map((t) => t.name).sort()).toEqual(['category', 'post', 'vega']);

		const postSnapshot = snapshot.find((t) => t.name === 'post');
		const livePost = (await port.listContentTypes()).find((t) => t.name === 'post')!;
		// Fidelidad estructural: el snapshot no es un resumen, es el `ContentType` REAL serializado.
		expect(postSnapshot).toEqual(livePost);
	});

	test('saveManifest sobre un backend SIN capabilities.schemaDiscovery no escribe schemaSnapshot (no-op defensivo)', async () => {
		const port = await loggedInPort(virginSeed());
		const noDiscoveryPort: BackendPort = {
			...port,
			capabilities: { ...port.capabilities, schemaDiscovery: false }
		};
		await port.ensureCollections([VEGA_COLLECTION]);

		await saveManifest(noDiscoveryPort, { schemaVersion: 1, site: { name: 'Modo editor' } });

		const page = await port.list('vega', { perPage: 1 });
		expect(page.items[0].values.schemaSnapshot ?? null).toBeNull();
	});
});
