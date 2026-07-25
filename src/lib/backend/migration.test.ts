/**
 * Suite de `migration.ts` (lote "esquema", mitad 2, "emitir la migración"): el nombre de
 * fichero determinista (`<segundos-unix>_<slug>.js`), la forma `migrate(up, down)` con
 * `new Collection({...})`/`app.delete(...)` para crear, `collection.fields.add(new Field({...}))`/
 * `removeByName(...)` para añadir campos, y que el mapeo de cada `CollectionFieldSpec` produzca
 * exactamente el mismo payload que `collectionFieldSpecToPbField` del adaptador `pocketbase`
 * (paridad DELIBERADA con lo que el adaptador acaba de ejecutar por red — la migración documenta
 * lo mismo que ya pasó, nunca otra cosa).
 */
import { describe, expect, test } from 'vitest';
import { generateSchemaMigration } from './migration';
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
			{ name: 'featured', type: 'bool', required: true }
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
	test('json/text/bool/number/date/file/autodate producen el payload esperado', () => {
		const fields: CollectionFieldSpec[] = [
			{ name: 'metadata', type: 'json' },
			{ name: 'slug', type: 'text', required: true, max: 64 },
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
		expect(contents).toContain('"maxSelect": 99'); // file multiple: true → 99 (mismo criterio que el adaptador)
		expect(contents).toContain('"maxSize": 1024');
		expect(contents).toContain('"mimeTypes"');
		expect(contents).toContain('"image/png"');
		expect(contents).toContain('"thumbs"');
		expect(contents).toContain('"300x300"');
		expect(contents).toContain('"onCreate": true');
		expect(contents).toContain('"onUpdate": false');
	});
});
