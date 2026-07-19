/**
 * Tests de `toRecordInput` (Fase F5-a, L-P5.3/§4.3 del contrato P1): solo campos dirty +
 * escribibles. Cada caso de exclusión (readonly, unsupported, no-dirty) es, de colarse, EXACTAMENTE
 * lo que `checkUnwritableFields` (`write-guards.ts`) rechazaría — se verifica cruzando ambos.
 */

import { describe, expect, test } from 'vitest';
import type { ContentType, Field } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { checkUnwritableFields } from '$lib/backend/write-guards';
import type { FormValues } from './form-model';
import type { FormInputValues } from './dirty';
import { toRecordInput } from './to-record-input';

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
		statusField: null,
		previewUrl: null,
		fields,
		listFields: [],
		fieldGroups: [{ name: null, columns: 1 }]
	};
}

const titleField: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};
const excerptField: Field = {
	name: 'excerpt',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const createdField: Field = {
	name: 'created',
	type: 'date',
	required: false,
	readonly: true,
	presentable: false,
	hidden: false,
	unique: false
};
const locationField: Field = {
	name: 'location',
	type: 'unsupported',
	backendType: 'geoPoint',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};

const type = makeType([
	makeField(titleField, { widget: 'text' }),
	makeField(excerptField, { widget: 'text' }),
	makeField(createdField, { widget: 'datetime' }),
	makeField(locationField, { widget: 'unsupported' })
]);

const baseline: FormValues = {
	title: 'Hola',
	excerpt: '',
	created: '2025-01-01T00:00:00.000Z',
	location: null
};

describe('toRecordInput', () => {
	test('sin cambios → payload vacío', () => {
		const current: FormInputValues = { ...baseline };
		expect(toRecordInput(type, baseline, current)).toEqual({});
	});

	test('solo el campo dirty y escribible entra en el payload', () => {
		const current: FormInputValues = { ...baseline, title: 'Adiós' };
		expect(toRecordInput(type, baseline, current)).toEqual({ title: 'Adiós' });
	});

	test('un readonly "tocado" (aunque no debería poder tocarse desde la UI) se EXCLUYE siempre', () => {
		const current: FormInputValues = { ...baseline, created: '2026-01-01T00:00:00.000Z' };
		const input = toRecordInput(type, baseline, current);
		expect(input).toEqual({});
		// De colarse, write-guards.ts lo habría rechazado igual: verifica que ambos coinciden.
		expect(
			checkUnwritableFields(type.schema.fields, { created: current.created }).created?.code
		).toBe('vega_readonly_field');
	});

	test('un unsupported "tocado" se EXCLUYE siempre', () => {
		const current: FormInputValues = { ...baseline, location: { lat: 1, lon: 2 } };
		const input = toRecordInput(type, baseline, current);
		expect(input).toEqual({});
		expect(
			checkUnwritableFields(type.schema.fields, { location: current.location }).location?.code
		).toBe('vega_unsupported_field');
	});

	test('varios campos dirty a la vez, mezclando escribibles y no', () => {
		const current: FormInputValues = {
			...baseline,
			title: 'Adiós',
			excerpt: 'nuevo extracto',
			created: '2026-01-01T00:00:00.000Z', // dirty pero readonly: excluido
			location: { lat: 1, lon: 2 } // dirty pero unsupported: excluido
		};
		expect(toRecordInput(type, baseline, current)).toEqual({
			title: 'Adiós',
			excerpt: 'nuevo extracto'
		});
	});

	test('File pendiente en un campo escribible entra tal cual (pass-through de subida)', () => {
		const file = new File(['x'], 'x.txt');
		const withFileField = makeType([
			makeField(
				{
					name: 'cover',
					type: 'file',
					multiple: false,
					protected: false,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{ widget: 'file' }
			)
		]);
		const fileBaseline: FormValues = { cover: null };
		const current: FormInputValues = { cover: file };
		expect(toRecordInput(withFileField, fileBaseline, current)).toEqual({ cover: file });
	});

	test('array mixto FileRef + File pendiente (multi-file) se reenvía TAL CUAL', () => {
		const file = new File(['x'], 'x.txt');
		const withGalleryField = makeType([
			makeField(
				{
					name: 'gallery',
					type: 'file',
					multiple: true,
					protected: false,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{ widget: 'file' }
			)
		]);
		const galleryBaseline: FormValues = { gallery: ['existing.jpg'] };
		const current: FormInputValues = { gallery: ['existing.jpg', file] };
		expect(toRecordInput(withGalleryField, galleryBaseline, current)).toEqual({
			gallery: ['existing.jpg', file]
		});
	});

	test('un valor `json` (objeto) se copia PLANO en el payload (fix F5-b: DataCloneError de un Proxy $state)', () => {
		const jsonField: Field = {
			name: 'meta',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		};
		const withJsonField = makeType([makeField(jsonField, { widget: 'json' })]);
		const jsonBaseline: FormValues = { meta: null };
		const current: FormInputValues = { meta: { tema: 'oscuro', nested: [1, 2] } };

		const input = toRecordInput(withJsonField, jsonBaseline, current);
		expect(input).toEqual({ meta: { tema: 'oscuro', nested: [1, 2] } });

		// Reconstruido PLANO, no la misma referencia: mutar el original de `current` tras
		// construir el payload no debe filtrarse a lo que ya viaja hacia el puerto.
		(current.meta as Record<string, unknown>).tema = 'mutado';
		expect((input.meta as Record<string, unknown>).tema).toBe('oscuro');
	});

	test('un File pendiente conserva su identidad EXACTA (nunca se clona, a diferencia de `json`)', () => {
		const file = new File(['x'], 'x.txt');
		const withFileField = makeType([
			makeField(
				{
					name: 'cover',
					type: 'file',
					multiple: false,
					protected: false,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				{ widget: 'file' }
			)
		]);
		const fileBaseline: FormValues = { cover: null };
		const current: FormInputValues = { cover: file };

		const input = toRecordInput(withFileField, fileBaseline, current);
		expect(input.cover).toBe(file);
	});
});
