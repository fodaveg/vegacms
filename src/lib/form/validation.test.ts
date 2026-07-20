/**
 * Tests de `validateForm` (Fase F5-a, L-P5.12/D-P5.3): `required` (reusando `isEmptyValue`,
 * incluidos los casos borde de la tabla §2.1) y `maxSelect`, y que ambos usan los mismos códigos
 * que `field-errors.ts` (`PB_VALIDATION_CODES`) para poder fusionarse con errores del backend.
 */

import { describe, expect, test } from 'vitest';
import type { ContentType, Field } from '$lib/backend/types';
import { PB_VALIDATION_CODES } from '$lib/backend/errors';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import type { FormInputValues } from './dirty';
import { validateForm } from './validation';

function makeField(
	schema: Field,
	overrides: Partial<Omit<ResolvedField, 'schema'>> = {}
): ResolvedField {
	return {
		schema,
		name: schema.name,
		label: schema.name,
		help: null,
		placeholder: null,
		hidden: schema.hidden,
		group: null,
		widget: 'text',
		subtype: null,
		listable: false,
		...overrides
	};
}

function makeType(fields: ResolvedField[]): ResolvedContentType {
	const schema: ContentType = {
		name: 'post',
		readonly: false,
		fields: fields.map((f) => f.schema)
	};
	return {
		schema,
		name: 'post',
		label: 'Post',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		titleField: null,
		orderField: null,
		statusField: null,
		previewUrl: null,
		fields,
		listFields: [],
		fieldGroups: [{ name: null, columns: 1 }]
	};
}

const requiredTitle: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: true,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};
const requiredReadonlyId: Field = {
	name: 'id',
	type: 'text',
	subtype: 'plain',
	required: true,
	readonly: true,
	presentable: false,
	hidden: false,
	unique: false
};
const optionalExcerpt: Field = {
	name: 'excerpt',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const tagsMax2: Field = {
	name: 'tags',
	type: 'select',
	options: ['a', 'b', 'c'],
	multiple: true,
	maxSelect: 2,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const galleryNoMax: Field = {
	name: 'gallery',
	type: 'file',
	multiple: true,
	protected: false,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};

const type = makeType([
	makeField(requiredTitle, { widget: 'text' }),
	makeField(requiredReadonlyId, { widget: 'text' }),
	makeField(optionalExcerpt, { widget: 'text' }),
	makeField(tagsMax2, { widget: 'chips' }),
	makeField(galleryNoMax, { widget: 'file' })
]);

const validCurrent: FormInputValues = {
	title: 'Hola',
	id: '',
	excerpt: '',
	tags: ['a'],
	gallery: []
};

describe('validateForm — required', () => {
	test('todo válido → sin errores', () => {
		expect(validateForm(type, validCurrent)).toEqual({ byField: {}, record: null });
	});

	test('campo required vacío ("") → error con el código PB_VALIDATION_CODES.required', () => {
		const current: FormInputValues = { ...validCurrent, title: '' };
		const view = validateForm(type, current);
		expect(view.byField.title).toEqual({
			code: PB_VALIDATION_CODES.required,
			message: 'Este campo es obligatorio',
			known: true
		});
		expect(view.record).toBeNull();
	});

	test('required + readonly → NO se valida (no editable, no es responsabilidad del cliente)', () => {
		const current: FormInputValues = { ...validCurrent, id: '' };
		expect(validateForm(type, current)).toEqual({ byField: {}, record: null });
	});

	test('campo NO required vacío → sin error', () => {
		const current: FormInputValues = { ...validCurrent, excerpt: '' };
		expect(validateForm(type, current).byField.excerpt).toBeUndefined();
	});

	test('File pendiente en un campo file required no cuenta como vacío', () => {
		const fileType = makeType([
			makeField(
				{
					name: 'cover',
					type: 'file',
					multiple: false,
					protected: false,
					required: true,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{ widget: 'file' }
			)
		]);
		const current: FormInputValues = { cover: new File(['x'], 'x.txt') };
		expect(validateForm(fileType, current)).toEqual({ byField: {}, record: null });
	});

	// Casos borde de `isEmptyValue` (§2.1): `0` y `false` NO son "vacío" para number/bool — solo
	// `null`/`[]`/`''` lo son. Fijan que `required` no degenere a un `!value` (que sí los rompería).
	test('number required con valor 0 → sin error (0 no es "vacío" para number)', () => {
		const numberType = makeType([
			makeField(
				{
					name: 'rating',
					type: 'number',
					integer: true,
					required: true,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{ widget: 'number' }
			)
		]);
		const current: FormInputValues = { rating: 0 };
		expect(validateForm(numberType, current)).toEqual({ byField: {}, record: null });
	});

	test('bool required con valor false → sin error (false no es "vacío" para bool)', () => {
		const boolType = makeType([
			makeField(
				{
					name: 'featured',
					type: 'bool',
					required: true,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{ widget: 'switch' }
			)
		]);
		const current: FormInputValues = { featured: false };
		expect(validateForm(boolType, current)).toEqual({ byField: {}, record: null });
	});
});

describe('validateForm — maxSelect', () => {
	test('dentro del límite → sin error', () => {
		const current: FormInputValues = { ...validCurrent, tags: ['a', 'b'] };
		expect(validateForm(type, current).byField.tags).toBeUndefined();
	});

	test('por encima del límite → error con el código PB_VALIDATION_CODES.tooManyValues', () => {
		const current: FormInputValues = { ...validCurrent, tags: ['a', 'b', 'c'] };
		const view = validateForm(type, current);
		expect(view.byField.tags).toEqual({
			code: PB_VALIDATION_CODES.tooManyValues,
			message: 'Selecciona como máximo 2 elementos',
			known: true
		});
	});

	test('sin maxSelect declarado (gallery) → nunca error, aunque haya muchos elementos', () => {
		const current: FormInputValues = { ...validCurrent, gallery: ['a', 'b', 'c', 'd', 'e', 'f'] };
		expect(validateForm(type, current).byField.gallery).toBeUndefined();
	});

	test('array vacío nunca dispara maxSelect (required, si aplica, ya lo cubre)', () => {
		const current: FormInputValues = { ...validCurrent, tags: [] };
		expect(validateForm(type, current).byField.tags).toBeUndefined();
	});
});
