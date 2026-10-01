import { describe, expect, test } from 'vitest';
import type { ContentType, VegaRecord } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { canDuplicateBlock, canDuplicatePage, duplicateInput, duplicatePage } from './records';

const pageType: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		{
			name: 'path',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: true
		},
		{
			name: 'slug',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: true
		},
		{
			name: 'cover',
			type: 'file',
			multiple: false,
			maxSelect: 1,
			protected: false,
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

const blockType: ContentType = {
	name: 'blocks',
	readonly: false,
	fields: [
		{
			name: 'parent',
			type: 'relation',
			target: 'pages',
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'order',
			type: 'number',
			integer: true,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'type',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		{
			name: 'data',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

function resolvedModel() {
	const model = resolveContentModel({
		types: [pageType, blockType],
		manifestRaw: {
			schemaVersion: 1,
			blockTypes: {
				hero: { label: 'Hero', fields: [{ name: 'title', label: 'Título', widget: 'text' }] }
			},
			collections: {
				pages: {
					titleField: 'title',
					slugField: 'slug',
					page: { pathField: 'path' },
					blocks: {
						collection: 'blocks',
						parentField: 'parent',
						orderField: 'order',
						typeField: 'type',
						dataField: 'data'
					}
				}
			}
		}
	});
	expect(model.warnings).toEqual([]);
	return model;
}

describe('duplicado de páginas y bloques', () => {
	test('duplicateInput clona JSON/relaciones pero omite file y readonly', () => {
		const type = resolvedModel().types.find((candidate) => candidate.name === 'pages')!;
		const source: VegaRecord = {
			id: 'home',
			type: 'pages',
			values: {
				title: 'Inicio',
				path: '/',
				slug: 'inicio',
				cover: 'hero.webp'
			}
		};

		const input = duplicateInput(type, source);

		expect(input).toEqual({ title: 'Inicio', path: '/', slug: 'inicio' });
	});

	test('no ofrece duplicar una página si no puede crear sus bloques', () => {
		const model = resolvedModel();
		const resolvedPage = model.types.find((candidate) => candidate.name === 'pages')!;
		const resolvedBlock = model.types.find((candidate) => candidate.name === 'blocks')!;
		const deniedBlock = {
			...resolvedBlock,
			permissions: { ...resolvedBlock.permissions, create: false }
		};

		expect(canDuplicatePage(resolvedPage, [resolvedPage, deniedBlock])).toBe(false);
		expect(
			canDuplicatePage(resolvedPage, [
				resolvedPage,
				{
					...resolvedBlock,
					permissions: { ...resolvedBlock.permissions, list: false }
				}
			])
		).toBe(false);
		expect(
			canDuplicatePage(
				{
					...resolvedPage,
					permissions: { ...resolvedPage.permissions, list: false }
				},
				model.types
			)
		).toBe(false);
		expect(canDuplicatePage(resolvedPage, model.types)).toBe(true);
	});

	test('duplicar un bloque exige crear y actualizar para poder insertarlo debajo', () => {
		const model = resolvedModel();
		const resolvedBlock = model.types.find((candidate) => candidate.name === 'blocks')!;

		expect(canDuplicateBlock(resolvedBlock)).toBe(true);
		expect(
			canDuplicateBlock({
				...resolvedBlock,
				permissions: { ...resolvedBlock.permissions, update: false }
			})
		).toBe(false);
		expect(
			canDuplicateBlock({
				...resolvedBlock,
				permissions: { ...resolvedBlock.permissions, create: false }
			})
		).toBe(false);
	});

	test('duplica página y todos sus bloques, preserva orden/data y desambigua path y slug', async () => {
		const model = resolvedModel();
		const resolvedPage = model.types.find((candidate) => candidate.name === 'pages')!;
		const port = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'test-pass' }],
			contentTypes: [pageType, blockType],
			records: {
				pages: [
					{
						id: 'home',
						values: { title: 'Inicio', path: '/', slug: 'inicio', cover: 'hero.webp' }
					},
					{
						id: 'copy1',
						values: { title: 'Copia previa', path: '/copia', slug: 'inicio-copia' }
					}
				],
				blocks: [
					{
						id: 'b1',
						values: {
							parent: 'home',
							order: 0,
							type: 'hero',
							data: { title: 'Hola' }
						}
					},
					{
						id: 'b2',
						values: {
							parent: 'home',
							order: 1,
							type: 'hero',
							data: { title: 'Segundo' }
						}
					}
				]
			}
		});
		await port.login({ email: 'admin@vega.test', password: 'test-pass' });
		const source = await port.get('pages', 'home');

		const duplicated = await duplicatePage(port, resolvedPage, source, model.types);

		expect(duplicated.page.values).toMatchObject({
			title: 'Inicio',
			path: '/copia-2',
			slug: 'inicio-copia-2'
		});
		expect(duplicated.page.values.cover).toBeNull();
		expect(duplicated.blocks).toHaveLength(2);
		const clonedBlocks = await port.list('blocks', {
			filter: {
				kind: 'cond',
				field: 'parent',
				op: 'eq',
				value: duplicated.page.id
			},
			sort: [{ field: 'order', dir: 'asc' }]
		});
		expect(clonedBlocks.items.map((record) => record.values)).toEqual([
			{
				parent: duplicated.page.id,
				order: 0,
				type: 'hero',
				data: { title: 'Hola' }
			},
			{
				parent: duplicated.page.id,
				order: 1,
				type: 'hero',
				data: { title: 'Segundo' }
			}
		]);
	});

	test('página con ruta BILINGÜE: desambigua las DOS columnas físicas, no solo la clave lógica', async () => {
		const pageTypeI18n: ContentType = {
			name: 'pages_i18n',
			readonly: false,
			fields: [
				{ ...pageType.fields[0] }, // title
				{
					name: 'pathEs',
					type: 'text',
					subtype: 'plain',
					required: true,
					readonly: false,
					presentable: true,
					hidden: false,
					unique: true
				},
				{
					name: 'pathEn',
					type: 'text',
					subtype: 'plain',
					required: false,
					readonly: false,
					presentable: true,
					hidden: false,
					unique: true
				}
			]
		};
		const model = resolveContentModel({
			types: [pageTypeI18n],
			manifestRaw: {
				schemaVersion: 1,
				locales: {
					default: 'es',
					available: [
						{ id: 'es', label: 'Español' },
						{ id: 'en', label: 'English' }
					]
				},
				collections: {
					pages_i18n: {
						titleField: 'title',
						localizedFields: { path: { fields: { es: 'pathEs', en: 'pathEn' } } },
						page: { pathField: 'path' }
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		const resolvedPage = model.types.find((candidate) => candidate.name === 'pages_i18n')!;
		expect(resolvedPage.page?.localizedPath).toEqual({
			defaultLocale: 'es',
			fields: { es: 'pathEs', en: 'pathEn' }
		});

		const port = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'test-pass' }],
			contentTypes: [pageTypeI18n],
			records: {
				pages_i18n: [
					{
						id: 'home',
						values: { title: 'Inicio', pathEs: '/', pathEn: '/en' }
					},
					{
						id: 'copy1',
						values: { title: 'Copia previa', pathEs: '/copia', pathEn: '/en-copia' }
					}
				]
			}
		});
		await port.login({ email: 'admin@vega.test', password: 'test-pass' });
		const source = await port.get('pages_i18n', 'home');

		const duplicated = await duplicatePage(port, resolvedPage, source, model.types);

		// Ninguna de las DOS columnas colisiona con "home" NI con "copy1": cada idioma se
		// desambigua por su cuenta.
		expect(duplicated.page.values).toMatchObject({
			title: 'Inicio',
			pathEs: '/copia-2',
			pathEn: '/en-copia-2'
		});
	});

	describe('publicación', () => {
		const publishable: ContentType = {
			...pageType,
			fields: [
				...pageType.fields,
				{
					name: 'status',
					type: 'select',
					options: ['draft', 'published'],
					multiple: false,
					maxSelect: 1,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{
					name: 'publishAt',
					type: 'date',
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				}
			]
		};

		function publishableModel() {
			const model = resolveContentModel({
				types: [publishable, blockType],
				manifestRaw: {
					schemaVersion: 1,
					collections: {
						pages: {
							titleField: 'title',
							slugField: 'slug',
							statusField: 'status',
							publishAtField: 'publishAt',
							page: { pathField: 'path' },
							blocks: {
								collection: 'blocks',
								parentField: 'parent',
								orderField: 'order',
								typeField: 'type',
								dataField: 'data'
							}
						}
					},
					blockTypes: {
						hero: { label: 'Hero', fields: [{ name: 'title', label: 'Título', widget: 'text' }] }
					}
				}
			});
			expect(model.warnings).toEqual([]);
			return model;
		}

		test('la copia de una página publicada nace en borrador y sin fecha programada', () => {
			const type = publishableModel().types.find((candidate) => candidate.name === 'pages')!;
			const input = duplicateInput(type, {
				id: 'home',
				type: 'pages',
				values: {
					title: 'Inicio',
					path: '/',
					slug: 'inicio',
					status: 'published',
					publishAt: '2026-12-01 10:00:00.000Z'
				}
			});

			expect(input).toMatchObject({ status: 'draft', publishAt: '' });
		});

		test('una página programada (draft + publishAt) tampoco hereda la programación', () => {
			const type = publishableModel().types.find((candidate) => candidate.name === 'pages')!;
			const input = duplicateInput(type, {
				id: 'home',
				type: 'pages',
				values: {
					title: 'Inicio',
					path: '/',
					slug: 'inicio',
					status: 'draft',
					publishAt: '2026-12-01 10:00:00.000Z'
				}
			});

			expect(input.publishAt).toBe('');
		});

		test('un override explícito del llamador gana sobre el borrador por defecto', () => {
			const type = publishableModel().types.find((candidate) => candidate.name === 'pages')!;
			const input = duplicateInput(
				type,
				{ id: 'home', type: 'pages', values: { title: 'Inicio', status: 'published' } },
				{ status: 'published' }
			);

			expect(input.status).toBe('published');
		});

		test('sin statusField no se inventan campos de estado', () => {
			const type = resolvedModel().types.find((candidate) => candidate.name === 'pages')!;
			const input = duplicateInput(type, {
				id: 'home',
				type: 'pages',
				values: { title: 'Inicio', path: '/', slug: 'inicio' }
			});

			expect(Object.keys(input).sort()).toEqual(['path', 'slug', 'title']);
		});

		test('duplicatePage persiste la copia como borrador sin publishAt', async () => {
			const model = publishableModel();
			const type = model.types.find((candidate) => candidate.name === 'pages')!;
			const port = createMemoryBackend({
				users: [{ email: 'admin@vega.test', password: 'test-pass' }],
				contentTypes: [publishable, blockType],
				records: {
					pages: [
						{
							id: 'home',
							values: {
								title: 'Inicio',
								path: '/',
								slug: 'inicio',
								status: 'published',
								publishAt: '2026-12-01 10:00:00.000Z'
							}
						}
					]
				}
			});
			await port.login({ email: 'admin@vega.test', password: 'test-pass' });

			const { page } = await duplicatePage(
				port,
				type,
				await port.get('pages', 'home'),
				model.types
			);

			expect(page.values.status).toBe('draft');
			expect(page.values.publishAt).toBeFalsy();
			expect((await port.get('pages', 'home')).values.status).toBe('published');
		});
	});

	test('rollback: si un bloque falla y el borrado de compensación también, manda el error original', async () => {
		const model = resolvedModel();
		const type = model.types.find((candidate) => candidate.name === 'pages')!;
		const memory = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'test-pass' }],
			contentTypes: [pageType, blockType],
			records: {
				pages: [{ id: 'home', values: { title: 'Inicio', path: '/', slug: 'inicio' } }],
				blocks: [{ id: 'b1', values: { parent: 'home', order: 0, type: 'hero', data: {} } }]
			}
		});
		await memory.login({ email: 'admin@vega.test', password: 'test-pass' });
		const original = new Error('create de bloque rechazado');
		const deletes: string[] = [];
		const port: typeof memory = {
			...memory,
			create: async (collection, input) => {
				if (collection === 'blocks') throw original;
				return memory.create(collection, input);
			},
			delete: async (collection, id) => {
				deletes.push(`${collection}:${id}`);
				throw new Error('compensación rota');
			}
		};

		await expect(
			duplicatePage(port, type, await memory.get('pages', 'home'), model.types)
		).rejects.toBe(original);

		// Se intentó retirar la página recién creada pese al fallo, y el error no se tapó.
		expect(deletes).toHaveLength(1);
		expect(deletes[0]).toMatch(/^pages:/);
	});
});
