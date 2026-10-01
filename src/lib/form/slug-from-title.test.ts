/**
 * Tests de `slugWriteForTitleEdit`: el slug sigue al título SOLO al crear y solo hasta que la
 * persona toca el slug (audit 30 sep). Al editar un registro existente no se toca nunca.
 */
import { describe, expect, test } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField, ResolvedLocalization } from '$lib/model/types';
import { slugWriteForTitleEdit } from './slug-from-title';

function makeField(name: string): ResolvedField {
	const schema: Field = {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	return {
		schema,
		name,
		label: name,
		help: null,
		placeholder: null,
		hidden: false,
		group: null,
		widget: 'text',
		subtype: 'plain',
		listable: false
	};
}

function makeType(
	overrides: Partial<ResolvedContentType>,
	fieldNames: string[]
): ResolvedContentType {
	const fields = fieldNames.map(makeField);
	return {
		schema: { name: 'post', readonly: false, fields: fields.map((f) => f.schema) },
		name: 'post',
		label: 'Post',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: 'title',
		subtitleField: null,
		slugField: 'slug',
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields,
		listFields: [],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false,
		localization: null,
		...overrides
	} as ResolvedContentType;
}

const plain = makeType({}, ['title', 'slug', 'body']);
const none: readonly string[] = [];

describe('slugWriteForTitleEdit', () => {
	test('creación: el título escrito deriva el slug', () => {
		expect(slugWriteForTitleEdit(plain, 'create', 'title', 'Mi primera entrada', none)).toEqual({
			field: 'slug',
			value: 'mi-primera-entrada'
		});
	});

	test('edición de un registro existente: JAMÁS toca el slug', () => {
		expect(slugWriteForTitleEdit(plain, 'edit', 'title', 'Otro título', none)).toBeNull();
	});

	test('si la persona ya tocó el slug, deja de seguir al título', () => {
		expect(slugWriteForTitleEdit(plain, 'create', 'title', 'Otro título', ['slug'])).toBeNull();
	});

	test('un campo que no es el título no deriva nada', () => {
		expect(slugWriteForTitleEdit(plain, 'create', 'body', 'Texto', none)).toBeNull();
		expect(slugWriteForTitleEdit(plain, 'create', 'slug', 'a-mano', none)).toBeNull();
	});

	test('tipo sin slugField o sin titleField: nada', () => {
		expect(
			slugWriteForTitleEdit(makeType({ slugField: null }, ['title']), 'create', 'title', 'X', none)
		).toBeNull();
		expect(
			slugWriteForTitleEdit(
				makeType({ titleField: null }, ['title', 'slug']),
				'create',
				'title',
				'X',
				none
			)
		).toBeNull();
	});

	test('valor que no es texto: nada', () => {
		expect(slugWriteForTitleEdit(plain, 'create', 'title', null, none)).toBeNull();
	});

	test('título sin carácter utilizable: slug vacío (seguía siendo suyo del título)', () => {
		expect(slugWriteForTitleEdit(plain, 'create', 'title', '¿¡?!', none)).toEqual({
			field: 'slug',
			value: ''
		});
	});

	describe('localizado', () => {
		const localization: ResolvedLocalization = {
			defaultLocale: 'es',
			locales: [
				{ id: 'es', label: 'Español' },
				{ id: 'en', label: 'English' }
			],
			fields: [
				{ name: 'title', label: 'Título', fields: { es: 'titleEs', en: 'titleEn' } },
				{ name: 'slug', label: 'Slug', fields: { es: 'slugEs', en: 'slugEn' } }
			]
		};
		const type = makeType({ titleField: 'titleEs', slugField: 'slugEs', localization }, [
			'titleEs',
			'titleEn',
			'slugEs',
			'slugEn'
		]);

		test('el título de un idioma alimenta el slug de ESE idioma', () => {
			expect(slugWriteForTitleEdit(type, 'create', 'titleEn', 'Hello World', none)).toEqual({
				field: 'slugEn',
				value: 'hello-world'
			});
			expect(slugWriteForTitleEdit(type, 'create', 'titleEs', 'Hola mundo', none)).toEqual({
				field: 'slugEs',
				value: 'hola-mundo'
			});
		});

		test('tocar el slug de un idioma no congela el del otro', () => {
			const touched = ['slugEn'];
			expect(slugWriteForTitleEdit(type, 'create', 'titleEn', 'Hello', touched)).toBeNull();
			expect(slugWriteForTitleEdit(type, 'create', 'titleEs', 'Hola', touched)).toEqual({
				field: 'slugEs',
				value: 'hola'
			});
		});
	});
});
