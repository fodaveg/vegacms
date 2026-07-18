/**
 * Tests unitarios de `deriveColumns` (Fase 4a, L-P4.2/L-P4.3): orden preservado, isTitle/
 * isStatus/sortable correctos, sin truncar a 5 aunque `listFields` traiga más, y omisión
 * defensiva de un nombre huérfano en `listFields`.
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { deriveColumns } from './columns';

/** Campo base mínimo; cada test solo pisa lo que le importa. */
function field(overrides: Partial<Field> & Pick<Field, 'name' | 'type'>): Field {
	return {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	} as Field;
}

/** `ResolvedField` mínimo a partir de un `Field` ya construido. */
function resolvedField(schema: Field, overrides: Partial<ResolvedField> = {}): ResolvedField {
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
		listable: true,
		...overrides
	};
}

/** `ResolvedContentType` mínimo; `fields`/`listFields`/`titleField`/`statusField` los da el test. */
function contentType(overrides: Partial<ResolvedContentType> = {}): ResolvedContentType {
	return {
		schema: { name: 'posts', readonly: false, fields: [] },
		name: 'posts',
		label: 'Posts',
		labelSingular: 'Posts',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		titleField: null,
		statusField: null,
		previewUrl: null,
		fields: [],
		listFields: [],
		fieldGroups: [null],
		...overrides
	};
}

describe('deriveColumns', () => {
	test('respeta el orden EXACTO de listFields, sin reordenar', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const status = field({
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		});
		const views = field({ name: 'views', type: 'number', integer: true });

		const type = contentType({
			fields: [resolvedField(views), resolvedField(title), resolvedField(status)],
			listFields: ['status', 'title', 'views'], // orden distinto al de `fields`
			titleField: 'title',
			statusField: 'status'
		});

		const columns = deriveColumns(type);
		expect(columns.map((c) => c.field.name)).toEqual(['status', 'title', 'views']);
	});

	test('isTitle/isStatus/sortable correctos por columna', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const status = field({
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		});
		const tags = field({ name: 'tags', type: 'select', options: ['a', 'b'], multiple: true });

		const type = contentType({
			fields: [resolvedField(title), resolvedField(status), resolvedField(tags)],
			listFields: ['title', 'status', 'tags'],
			titleField: 'title',
			statusField: 'status'
		});

		const columns = deriveColumns(type);
		const byName = new Map(columns.map((c) => [c.field.name, c]));

		expect(byName.get('title')).toMatchObject({ isTitle: true, isStatus: false, sortable: true });
		expect(byName.get('status')).toMatchObject({ isTitle: false, isStatus: true, sortable: true });
		// select múltiple no es escalar (isScalarField): no se ofrece ordenar por ella.
		expect(byName.get('tags')).toMatchObject({ isTitle: false, isStatus: false, sortable: false });
	});

	test('más de 5 columnas: NO se trunca (5 es solo el default de P2, no un límite de render)', () => {
		const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		const fields = names.map((n) => field({ name: n, type: 'text', subtype: 'plain' }));
		const type = contentType({
			fields: fields.map((f) => resolvedField(f)),
			listFields: names
		});

		expect(deriveColumns(type)).toHaveLength(7);
	});

	test('un nombre de listFields sin ResolvedField correspondiente se omite defensivamente', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType({
			fields: [resolvedField(title)],
			listFields: ['title', 'campo-fantasma'],
			titleField: 'title'
		});

		const columns = deriveColumns(type);
		expect(columns.map((c) => c.field.name)).toEqual(['title']);
	});
});
