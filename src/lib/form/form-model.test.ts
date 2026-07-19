/**
 * Tests de `buildFormModel` (Fase F5-a, L-P5.6/D-P5.11): defaults de creación por tipo de campo
 * (reusando la tabla §2.1 vía `normalizeFieldValue`) vs valores de un registro existente en
 * edición, incluidos los campos `readonly`/autodate. Fixtures a mano, estilo
 * `src/lib/backend/normalize.test.ts`.
 */

import { describe, expect, test } from 'vitest';
import type { ContentType, Field, FieldValue, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { buildFormModel } from './form-model';
import { isDirty, type FormInputValues } from './dirty';

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

function makeType(
	fields: ResolvedField[],
	schemaOverrides: Partial<ContentType> = {}
): ResolvedContentType {
	const schema: ContentType = {
		name: 'post',
		readonly: false,
		fields: fields.map((f) => f.schema),
		...schemaOverrides
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

// ————— Kitchen sink: un campo de cada familia de default —————

const titleField: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: true,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};
const ratingField: Field = {
	name: 'rating',
	type: 'number',
	integer: true,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const featuredField: Field = {
	name: 'featured',
	type: 'bool',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const publishedAtField: Field = {
	name: 'publishedAt',
	type: 'date',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const statusField: Field = {
	name: 'status',
	type: 'select',
	options: ['draft', 'published'],
	multiple: false,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const tagsField: Field = {
	name: 'tags',
	type: 'select',
	options: ['a', 'b'],
	multiple: true,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const categoryField: Field = {
	name: 'category',
	type: 'relation',
	target: 'category',
	multiple: false,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const categoriesField: Field = {
	name: 'categories',
	type: 'relation',
	target: 'category',
	multiple: true,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const coverField: Field = {
	name: 'cover',
	type: 'file',
	multiple: false,
	protected: false,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};
const galleryField: Field = {
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
const metadataField: Field = {
	name: 'metadata',
	type: 'json',
	required: false,
	readonly: false,
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
const createdField: Field = {
	name: 'created',
	type: 'date',
	required: false,
	readonly: true,
	presentable: false,
	hidden: false,
	unique: false
};

const kitchenSinkType = makeType([
	makeField(titleField, { widget: 'text' }),
	makeField(ratingField, { widget: 'number' }),
	makeField(featuredField, { widget: 'switch' }),
	makeField(publishedAtField, { widget: 'datetime' }),
	makeField(statusField, { widget: 'select' }),
	makeField(tagsField, { widget: 'chips' }),
	makeField(categoryField, { widget: 'relation' }),
	makeField(categoriesField, { widget: 'relation' }),
	makeField(coverField, { widget: 'file' }),
	makeField(galleryField, { widget: 'file' }),
	makeField(metadataField, { widget: 'json' }),
	makeField(locationField, { widget: 'unsupported' }),
	makeField(createdField, { widget: 'datetime' })
]);

describe('buildFormModel — creación (record === null)', () => {
	test('mode "create" y recordId null', () => {
		const model = buildFormModel(kitchenSinkType, null);
		expect(model.mode).toBe('create');
		expect(model.recordId).toBeNull();
	});

	test('defaults por tipo de campo (tabla §2.1, vía normalizeFieldValue)', () => {
		const model = buildFormModel(kitchenSinkType, null);
		expect(model.baseline).toEqual({
			title: '',
			rating: null,
			featured: false,
			publishedAt: null,
			status: null,
			tags: [],
			category: null,
			categories: [],
			cover: null,
			gallery: [],
			metadata: null,
			location: null,
			created: null // readonly (autodate), pero sigue recibiendo el default de su tipo (date → null)
		});
	});

	test('cubre TODOS los campos del tipo, mismo cardinal que type.fields', () => {
		const model = buildFormModel(kitchenSinkType, null);
		expect(Object.keys(model.baseline).sort()).toEqual(
			kitchenSinkType.fields.map((f) => f.name).sort()
		);
	});
});

describe('buildFormModel — edición (record presente)', () => {
	test('mode "edit", recordId = record.id, baseline = record.values TAL CUAL', () => {
		const record: VegaRecord = {
			id: 'rec1',
			type: 'post',
			values: {
				title: 'Hola',
				rating: 4,
				featured: true,
				publishedAt: '2026-01-01T00:00:00.000Z',
				status: 'published',
				tags: ['a'],
				category: 'cat1',
				categories: ['cat1', 'cat2'],
				cover: 'cover.jpg',
				gallery: ['a.jpg', 'b.jpg'],
				metadata: { a: 1 },
				location: { lat: 0, lon: 0 },
				created: '2025-12-01T00:00:00.000Z'
			}
		};
		const model = buildFormModel(kitchenSinkType, record);
		expect(model.mode).toBe('edit');
		expect(model.recordId).toBe('rec1');
		expect(model.baseline).toEqual(record.values);
	});

	test('incluye los campos readonly/autodate en el baseline (se muestran, no se editan)', () => {
		const record: VegaRecord = {
			id: 'rec1',
			type: 'post',
			values: { ...emptyValuesFor(kitchenSinkType), created: '2025-12-01T00:00:00.000Z' }
		};
		const model = buildFormModel(kitchenSinkType, record);
		expect(model.baseline.created).toBe('2025-12-01T00:00:00.000Z');
	});

	test('campo ausente en record.values (degradación L11) → cae al default de creación', () => {
		const values = emptyValuesFor(kitchenSinkType);
		delete values.title;
		const record: VegaRecord = { id: 'rec1', type: 'post', values };
		const model = buildFormModel(kitchenSinkType, record);
		expect(model.baseline.title).toBe('');
	});

	test('baseline en edición NO comparte referencia con record.values (aliasing, landmine)', () => {
		const record: VegaRecord = {
			id: 'rec1',
			type: 'post',
			values: { ...emptyValuesFor(kitchenSinkType), tags: ['a'], metadata: { a: 1 } }
		};
		const model = buildFormModel(kitchenSinkType, record);

		// Mutar el array/objeto de ORIGEN (record.values) DESPUÉS de construir el modelo no debe
		// alcanzar al baseline — si `baseline[field.name] = record.values[field.name]` compartiera
		// referencia (el bug pre-fix), sí lo haría. Así "baseline inmutable" es cierto por
		// construcción, no por promesa del docstring.
		(record.values.tags as string[]).push('mutada-en-origen');
		(record.values.metadata as Record<string, number>).a = 999;
		expect(model.baseline.tags).toEqual(['a']);
		expect(model.baseline.metadata).toEqual({ a: 1 });

		// Y en la dirección que de verdad usará el shell: `current` reasigna un array/objeto NUEVO
		// en vez de mutar in-place (patrón idiomático en Svelte 5 para que la reactividad detecte
		// el cambio) — con el baseline ya independiente, `isDirty` detecta el cambio sin corromper
		// el snapshot. (Nota: un `current.tags.push(...)` in-place sobre un `{ ...baseline }`
		// superficial SÍ compartiría la referencia del array anidado con `baseline.tags` — eso es
		// una responsabilidad del shell al construir su `$state` editable, no de este módulo:
		// reasignar arrays/objetos, nunca mutarlos in-place, es la forma segura de usar `baseline`.)
		const current: FormInputValues = {
			...model.baseline,
			tags: [...(model.baseline.tags as string[]), 'b']
		};
		expect(model.baseline.tags).toEqual(['a']);
		expect(isDirty(model.baseline, current)).toBe(true);
	});
});

function emptyValuesFor(type: ResolvedContentType): Record<string, FieldValue> {
	return Object.fromEntries(type.fields.map((f) => [f.name, null]));
}
