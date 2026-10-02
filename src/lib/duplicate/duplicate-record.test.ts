/**
 * `duplicateRecord` / `canDuplicateRecord` (`records.ts`, Lote 12, lámina 7): la regla campo a
 * campo de «Duplicar» desde la fila del listado, medida contra el adaptador `memory` real — lo que
 * no se copia tal cual (único, fichero, readonly, estado publicado, fecha programada) y lo que sí.
 * La parte de páginas con bloques ya la cubre `records.test.ts` (`duplicatePage`).
 */
import { describe, expect, test } from 'vitest';
import type { ContentType, VegaRecord } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import type { ResolvedContentType } from '$lib/model/types';
import { canDuplicateRecord, duplicateRecord } from './records';

const postType: ContentType = {
	name: 'posts',
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
			name: 'slug',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: true
		},
		{
			name: 'code',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: true
		},
		{
			name: 'contactEmail',
			type: 'email',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: true
		},
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false,
			maxSelect: 1,
			required: true,
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
		},
		{
			name: 'cover',
			type: 'file',
			multiple: false,
			maxSelect: 1,
			protected: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'tags',
			type: 'relation',
			target: 'tags',
			multiple: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'meta',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'created',
			type: 'date',
			required: false,
			readonly: true,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const tagType: ContentType = {
	name: 'tags',
	readonly: false,
	fields: [
		{
			name: 'name',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

function resolvedPosts(): { type: ResolvedContentType; types: ResolvedContentType[] } {
	const model = resolveContentModel({
		types: [postType, tagType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				posts: {
					titleField: 'title',
					slugField: 'slug',
					statusField: 'status',
					publishAtField: 'publishAt'
				}
			}
		}
	});
	expect(model.warnings).toEqual([]);
	const type = model.types.find((candidate) => candidate.name === 'posts')!;
	return { type, types: model.types };
}

async function backendWithSource() {
	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [postType, tagType],
		records: {
			tags: [{ id: 't1', values: { name: 'Huerto' } }],
			posts: [
				{
					id: 'p1',
					values: {
						title: 'Notas del huerto',
						slug: 'notas-del-huerto',
						code: 'NH-1',
						contactEmail: 'huerto@example.org',
						status: 'published',
						publishAt: '2026-10-12 10:00:00.000Z',
						cover: 'portada.webp',
						tags: ['t1'],
						meta: { destacado: true }
					}
				},
				{
					id: 'p2',
					values: {
						title: 'Copia previa',
						slug: 'notas-del-huerto-copia',
						status: 'draft'
					}
				}
			]
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });
	const source = await port.get('posts', 'p1');
	return { port, source };
}

describe('duplicateRecord — regla campo a campo (lámina 7)', () => {
	test('la copia nace en borrador, sin fecha programada, sin fichero, con relaciones y JSON clonados', async () => {
		const { type, types } = resolvedPosts();
		const { port, source } = await backendWithSource();

		const copy = await duplicateRecord(port, type, source, types);

		expect(copy.id).not.toBe('p1');
		expect(copy.values).toMatchObject({
			title: 'Notas del huerto',
			status: 'draft',
			tags: ['t1'],
			meta: { destacado: true }
		});
		expect(copy.values.publishAt ?? '').toBe('');
		expect(copy.values.cover ?? null).toBeNull();
		// El original no se toca.
		const original = await port.get('posts', 'p1');
		expect(original.values.status).toBe('published');
	});

	test('slugField y cualquier texto único reciben el primer sufijo -copia libre', async () => {
		const { type, types } = resolvedPosts();
		const { port, source } = await backendWithSource();

		const copy = await duplicateRecord(port, type, source, types);

		// `notas-del-huerto-copia` ya existe (p2): salta a `-copia-2`.
		expect(copy.values.slug).toBe('notas-del-huerto-copia-2');
		expect(copy.values.code).toBe('NH-1-copia');
	});

	test('un campo único que NO es texto (email) no se copia: queda vacío en vez de romper su formato', async () => {
		const { type, types } = resolvedPosts();
		const { port, source } = await backendWithSource();

		const copy = await duplicateRecord(port, type, source, types);

		expect(copy.values.contactEmail ?? '').toBe('');
	});

	test('readonly (autodate) nunca viaja en el input: el servidor pone el suyo', async () => {
		const { type, types } = resolvedPosts();
		const { port, source } = await backendWithSource();
		const sourceCreated = source.values.created;

		const copy = await duplicateRecord(port, type, source, types);

		expect(copy.values.created).not.toBe(sourceCreated);
	});

	test('sin permiso de crear o de listar no se ofrece ni se ejecuta', async () => {
		const { type, types } = resolvedPosts();
		const { port, source } = await backendWithSource();
		const noCreate = { ...type, permissions: { ...type.permissions, create: false } };
		const noList = { ...type, permissions: { ...type.permissions, list: false } };

		expect(canDuplicateRecord(type, types)).toBe(true);
		expect(canDuplicateRecord(noCreate, types)).toBe(false);
		expect(canDuplicateRecord(noList, types)).toBe(false);
		await expect(duplicateRecord(port, noCreate, source, types)).rejects.toMatchObject({
			kind: 'forbidden'
		});
		await expect(duplicateRecord(port, noList, source, types)).rejects.toMatchObject({
			kind: 'forbidden'
		});
	});

	test('un texto único VACÍO en el original recibe valor («copia»): el índice de text es completo y dos vacíos colisionan', async () => {
		const { type, types } = resolvedPosts();
		const { port } = await backendWithSource();
		const source: VegaRecord = await port.get('posts', 'p2');

		const copy = await duplicateRecord(port, type, source, types);

		// El slug de p2 ya acaba en `-copia`: se le cuelga otro sufijo, nunca se renumera el suyo.
		expect(copy.values.slug).toBe('notas-del-huerto-copia-copia');
		expect(copy.values.code).toBe('copia');
	});
});
