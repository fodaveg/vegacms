/**
 * Suite de `migration.ts` (lote "esquema", mitad 2, "emitir la migración"): el nombre de
 * fichero determinista (`<segundos-unix>_<slug>.js`), la forma `migrate(up, down)` con
 * `new Collection({...})`/`app.delete(...)` para crear, `collection.fields.add(new Field({...}))`/
 * `removeByName(...)` para añadir campos, y que el mapeo de cada `CollectionFieldSpec` produzca
 * exactamente el mismo payload que `collectionFieldSpecToPbField` del adaptador `pocketbase`
 * (paridad DELIBERADA con lo que ejecutaría el adaptador por red). Esta suite cubre el flujo
 * directo de `/settings`, donde la migración documenta lo mismo que el adaptador acaba de
 * ejecutar por red, nunca otra cosa; el camino de reconciliación de columnas de bloque reutiliza
 * el mismo generador para proponer esa migración ANTES de ejecutar nada, y se cubre aparte en
 * `block-schema.test.ts`.
 */
import { describe, expect, test } from 'vitest';
import { collectionSpecToPocketBasePayload } from './adapters/pocketbase/collections';
import { collectionSpecToMigrationPayload, generateSchemaMigration } from './migration';
import type { CollectionFieldSpec, CollectionSpec } from './collections';

const FIXED_NOW = new Date('2026-07-25T12:00:00.000Z'); // 1784980800 segundos unix

describe('generateSchemaMigration — create', () => {
	test('nombre de fichero determinista: <segundos-unix>_create_<name>.js', () => {
		const spec: CollectionSpec = { name: 'posts', fields: [] };
		const { filename } = generateSchemaMigration({ kind: 'create', specs: [spec] }, FIXED_NOW);
		expect(filename).toBe('1784980800_create_posts.js');
	});

	test('varias colecciones a la vez: slug genérico "create_collections"', () => {
		const specs: CollectionSpec[] = [
			{ name: 'posts', fields: [] },
			{ name: 'authors', fields: [] }
		];
		const { filename } = generateSchemaMigration({ kind: 'create', specs }, FIXED_NOW);
		expect(filename).toBe('1784980800_create_collections.js');
	});

	test('contenido: migrate(up, down), new Collection({...}) con los campos mapeados', () => {
		const spec: CollectionSpec = {
			name: 'posts',
			fields: [
				{ name: 'title', type: 'text', required: true, max: 120 },
				{ name: 'rating', type: 'number', required: false }
			]
		};
		const { contents } = generateSchemaMigration({ kind: 'create', specs: [spec] }, FIXED_NOW);

		expect(contents).toContain('migrate((app) => {');
		expect(contents).toContain('new Collection({');
		expect(contents).toContain('"name": "posts"');
		expect(contents).toContain('"type": "base"');
		expect(contents).toContain('"name": "title"');
		expect(contents).toContain('"max": 120');
		expect(contents).toContain('"name": "rating"');
		expect(contents).toContain('app.save(collection);');
		// down: borra por nombre, nunca modifica/renombra.
		expect(contents).toContain('app.delete(app.findCollectionByNameOrId("posts"));');
	});

	test('auth y las siete reglas conservan paridad literal con el payload de red', () => {
		const spec: CollectionSpec = {
			name: 'editors',
			type: 'auth',
			fields: [],
			listRule: null,
			viewRule: '',
			createRule: '@request.auth.id != null',
			updateRule: 'id = @request.auth.id',
			deleteRule: null,
			authRule: 'verified = true',
			manageRule: 'id = @request.auth.id'
		};

		expect(collectionSpecToMigrationPayload(spec)).toEqual(
			collectionSpecToPocketBasePayload(spec, [])
		);

		const { contents } = generateSchemaMigration({ kind: 'create', specs: [spec] }, FIXED_NOW);
		expect(contents).toContain('"type": "auth"');
		expect(contents).toContain('"listRule": null');
		expect(contents).toContain('"viewRule": ""');
		expect(contents).toContain('"createRule": "@request.auth.id != null"');
		expect(contents).toContain('"updateRule": "id = @request.auth.id"');
		expect(contents).toContain('"deleteRule": null');
		expect(contents).toContain('"authRule": "verified = true"');
		expect(contents).toContain('"manageRule": "id = @request.auth.id"');
	});

	test('varias colecciones: down las borra en orden INVERSO al de creación', () => {
		const specs: CollectionSpec[] = [
			{ name: 'posts', fields: [] },
			{ name: 'authors', fields: [] }
		];
		const { contents } = generateSchemaMigration({ kind: 'create', specs }, FIXED_NOW);
		const upIndex = contents.indexOf('}, (app) => {');
		const down = contents.slice(upIndex);
		expect(down.indexOf('"authors"')).toBeLessThan(down.indexOf('"posts"'));
	});

	test('ordena topológicamente: crea el destino antes que quien lo referencia', () => {
		const specs: CollectionSpec[] = [
			{
				name: 'blocks',
				fields: [
					{
						name: 'parent',
						type: 'relation',
						target: 'pages',
						multiple: false,
						cascadeDelete: false
					}
				]
			},
			{ name: 'pages', fields: [] }
		];
		const { contents } = generateSchemaMigration({ kind: 'create', specs }, FIXED_NOW);
		const downStart = contents.indexOf('}, (app) => {');
		const up = contents.slice(0, downStart);
		const down = contents.slice(downStart);

		expect(up.indexOf('"name": "pages"')).toBeLessThan(up.indexOf('"name": "blocks"'));
		expect(down.indexOf('"blocks"')).toBeLessThan(down.indexOf('"pages"'));
		expect(() => new Function(contents)).not.toThrow();
	});

	test('rechaza ciclos relation nombrando las colecciones implicadas', () => {
		const specs: CollectionSpec[] = [
			{
				name: 'pages',
				fields: [
					{
						name: 'primaryBlock',
						type: 'relation',
						target: 'blocks',
						multiple: false,
						cascadeDelete: false
					}
				]
			},
			{
				name: 'blocks',
				fields: [
					{
						name: 'parent',
						type: 'relation',
						target: 'pages',
						multiple: false,
						cascadeDelete: false
					}
				]
			}
		];

		expect(() => generateSchemaMigration({ kind: 'create', specs }, FIXED_NOW)).toThrow(
			'Ciclo de dependencias relation entre colecciones: pages -> blocks -> pages.'
		);
	});

	test('una autorreferencia no se considera ciclo', () => {
		const spec: CollectionSpec = {
			name: 'pages',
			fields: [
				{
					name: 'parent',
					type: 'relation',
					target: 'pages',
					multiple: false,
					cascadeDelete: false
				}
			]
		};

		const { contents } = generateSchemaMigration({ kind: 'create', specs: [spec] }, FIXED_NOW);

		expect(contents).toContain('app.save(collection);');
		expect(contents).toContain('collection.fields.add(new Field({');
		expect(contents).toContain('"collectionId": collection.id');
		expect(() => new Function(contents)).not.toThrow();
	});

	test('es JS válido: ninguna llave/paréntesis desbalanceado (parseo con `new Function`)', () => {
		const spec: CollectionSpec = {
			name: 'posts',
			fields: [{ name: 'title', type: 'text' }]
		};
		const { contents } = generateSchemaMigration({ kind: 'create', specs: [spec] }, FIXED_NOW);
		// `migrate`/`Collection`/`Field`/`app` no existen en Node: solo se comprueba que PARSEA
		// (SyntaxError si no), nunca se ejecuta.
		expect(() => new Function(contents)).not.toThrow();
	});

	test('select e índice unique viajan dentro del Collection creado', () => {
		const spec: CollectionSpec = {
			name: 'pages',
			fields: [
				{ name: 'path', type: 'text', unique: true },
				{
					name: 'status',
					type: 'select',
					options: ['draft', 'published'],
					multiple: false
				}
			]
		};
		const { contents } = generateSchemaMigration({ kind: 'create', specs: [spec] }, FIXED_NOW);

		expect(contents).toContain('"type": "select"');
		expect(contents).toContain('"values"');
		expect(contents).toContain('"draft"');
		expect(contents).toContain('"maxSelect": 1');
		expect(contents).toContain(
			'CREATE UNIQUE INDEX `idx_vega_unique_5_pages_4_path` ON `pages` (`path`)'
		);
	});
});

describe('generateSchemaMigration — add-fields', () => {
	test('nombre de fichero determinista: <segundos-unix>_add_fields_to_<collection>.js', () => {
		const fields: CollectionFieldSpec[] = [{ name: 'excerpt', type: 'text' }];
		const { filename } = generateSchemaMigration(
			{ kind: 'add-fields', collection: 'posts', fields },
			FIXED_NOW
		);
		expect(filename).toBe('1784980800_add_fields_to_posts.js');
	});

	test('contenido: findCollectionByNameOrId + fields.add(new Field({...})) por campo', () => {
		const fields: CollectionFieldSpec[] = [
			{ name: 'excerpt', type: 'text', required: false },
			{ name: 'featured', type: 'bool', required: true },
			{ name: 'path', type: 'text', unique: true }
		];
		const { contents } = generateSchemaMigration(
			{ kind: 'add-fields', collection: 'posts', fields },
			FIXED_NOW
		);

		expect(contents).toContain('app.findCollectionByNameOrId("posts")');
		expect(contents).toContain('collection.fields.add(new Field({');
		expect(contents).toContain('"name": "excerpt"');
		expect(contents).toContain('"name": "featured"');
		expect(contents).toContain('"type": "bool"');
		expect(contents).toContain('"required": true');
		// down: quita SOLO por nombre, nunca toca otro campo.
		expect(contents).toContain('collection.fields.removeByName("excerpt");');
		expect(contents).toContain('collection.fields.removeByName("featured");');
		expect(contents).toContain('collection.indexes.push(');
		expect(contents).toContain('collection.indexes = collection.indexes.filter(');
		expect(contents.indexOf('collection.indexes = collection.indexes.filter(')).toBeLessThan(
			contents.indexOf('collection.fields.removeByName("path");')
		);
	});

	test('es JS válido (parseo con `new Function`)', () => {
		const fields: CollectionFieldSpec[] = [{ name: 'excerpt', type: 'text' }];
		const { contents } = generateSchemaMigration(
			{ kind: 'add-fields', collection: 'posts', fields },
			FIXED_NOW
		);
		expect(() => new Function(contents)).not.toThrow();
	});
});

describe('generateSchemaMigration — mapeo de campos (paridad con el adaptador pocketbase)', () => {
	test('json/text/select/bool/number/date/file/autodate producen el payload esperado', () => {
		const fields: CollectionFieldSpec[] = [
			{ name: 'metadata', type: 'json' },
			{ name: 'slug', type: 'text', required: true, max: 64, unique: true },
			{
				name: 'status',
				type: 'select',
				options: ['draft', 'published'],
				multiple: false
			},
			{ name: 'featured', type: 'bool', required: true },
			{ name: 'rating', type: 'number', required: false },
			{ name: 'publishedAt', type: 'date', required: false },
			{
				name: 'cover',
				type: 'file',
				required: false,
				multiple: true,
				maxSizeBytes: 1024,
				mimeTypes: ['image/png'],
				thumbs: ['300x300']
			},
			{ name: 'createdAt', type: 'autodate', onUpdate: false }
		];
		const { contents } = generateSchemaMigration(
			{ kind: 'add-fields', collection: 'posts', fields },
			FIXED_NOW
		);

		expect(contents).toContain('"type": "json"');
		expect(contents).toContain('"max": 64');
		expect(contents).toContain('"values"');
		expect(contents).toContain('"published"');
		expect(contents).toContain(
			'CREATE UNIQUE INDEX `idx_vega_unique_5_posts_4_slug` ON `posts` (`slug`)'
		);
		expect(contents).toContain('"maxSelect": 99'); // file multiple: true → 99 (mismo criterio que el adaptador)
		expect(contents).toContain('"maxSize": 1024');
		expect(contents).toContain('"mimeTypes"');
		expect(contents).toContain('"image/png"');
		expect(contents).toContain('"thumbs"');
		expect(contents).toContain('"300x300"');
		expect(contents).toContain('"onCreate": true');
		expect(contents).toContain('"onUpdate": false');
	});

	test('relation resuelve collectionId por nombre en runtime y conserva cardinalidad/borrado', () => {
		const fields: CollectionFieldSpec[] = [
			{
				name: 'parent',
				type: 'relation',
				target: 'pages',
				required: true,
				multiple: false,
				cascadeDelete: true
			}
		];
		const { contents } = generateSchemaMigration(
			{ kind: 'add-fields', collection: 'blocks', fields },
			FIXED_NOW
		);

		expect(contents).toContain('"collectionId": app.findCollectionByNameOrId("pages").id');
		expect(contents).toContain('"maxSelect": 1');
		expect(contents).toContain('"cascadeDelete": true');
		expect(() => new Function(contents)).not.toThrow();
	});
});
