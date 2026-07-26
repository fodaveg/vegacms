/**
 * Tests unitarios de `validateTransferDocument` (§4.1 del contrato, ver la cabecera de
 * `import-format.ts`): forma base, versión, colección desconocida y campo desconocido — todo-o-
 * nada, en ese orden.
 */

import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import type { Field } from '$lib/backend/types';
import { validateTransferDocument } from './import-format';

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

function contentType(
	name: string,
	fields: Field[],
	overrides: Partial<ResolvedContentType> = {}
): ResolvedContentType {
	return {
		schema: { name, readonly: false, fields },
		name,
		label: name,
		labelSingular: name,
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: null,
		subtitleField: null,
		slugField: null,
		statusField: null,
		statusLabels: null,
		orderField: null,
		defaultSort: null,
		previewUrl: null,
		fields: [],
		listFields: [],
		fieldGroups: [],
		editorRail: false,
		...overrides
	};
}

function model(types: ResolvedContentType[]): ContentModel {
	return {
		site: { name: 'Vega', defaultTheme: null, locale: null },
		types,
		nav: { groups: [] },
		revisions: { enabled: true, keepPerRecord: 20, trashDays: 30 },
		mergedViews: [],
		warnings: [],
		manifest: { status: 'absent' }
	};
}

describe('validateTransferDocument', () => {
	it('formas claramente inválidas (no objeto, sin collections) → malformed', () => {
		expect(validateTransferDocument(null, model([]))).toEqual({
			ok: false,
			errors: [{ kind: 'malformed' }]
		});
		expect(validateTransferDocument({ vegaTransfer: 1 }, model([]))).toEqual({
			ok: false,
			errors: [{ kind: 'malformed' }]
		});
		expect(validateTransferDocument({ collections: 'no-array' }, model([]))).toEqual({
			ok: false,
			errors: [{ kind: 'malformed' }]
		});
	});

	it('un registro sin id/values con la forma correcta → malformed (se detiene ahí, ni mira versión)', () => {
		const doc = { vegaTransfer: 1, collections: [{ type: 'posts', records: [{ id: 'r1' }] }] };
		expect(validateTransferDocument(doc, model([]))).toEqual({
			ok: false,
			errors: [{ kind: 'malformed' }]
		});
	});

	it('vegaTransfer no reconocido (ausente o de otra versión) → unrecognized-version', () => {
		const doc = { collections: [] };
		expect(validateTransferDocument(doc, model([]))).toEqual({
			ok: false,
			errors: [{ kind: 'unrecognized-version', found: undefined }]
		});

		const docV2 = { vegaTransfer: 2, collections: [] };
		expect(validateTransferDocument(docV2, model([]))).toEqual({
			ok: false,
			errors: [{ kind: 'unrecognized-version', found: 2 }]
		});
	});

	it('colección que no existe en destino → unknown-collection (aunque otra sí exista)', () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const doc = {
			vegaTransfer: 1,
			collections: [
				{ type: 'posts', records: [{ id: 'p1', values: { title: 'Uno' } }] },
				{ type: 'fantasma', records: [{ id: 'f1', values: {} }] }
			]
		};
		expect(validateTransferDocument(doc, model([type]))).toEqual({
			ok: false,
			errors: [{ kind: 'unknown-collection', type: 'fantasma' }]
		});
	});

	it('una colección oculta (hidden) cuenta como "no existe" — mismo criterio que las rutas', () => {
		const type = contentType('vega', [], { hidden: true });
		const doc = { vegaTransfer: 1, collections: [{ type: 'vega', records: [] }] };
		expect(validateTransferDocument(doc, model([type]))).toEqual({
			ok: false,
			errors: [{ kind: 'unknown-collection', type: 'vega' }]
		});
	});

	it('un campo que el esquema vivo ya no declara → unknown-field, una vez por campo/colección', () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const doc = {
			vegaTransfer: 1,
			collections: [
				{
					type: 'posts',
					records: [
						{ id: 'p1', values: { title: 'Uno', legacy: 'x' } },
						{ id: 'p2', values: { title: 'Dos', legacy: 'y' } }
					]
				}
			]
		};
		expect(validateTransferDocument(doc, model([type]))).toEqual({
			ok: false,
			errors: [{ kind: 'unknown-field', type: 'posts', field: 'legacy' }]
		});
	});

	it('todo casa: devuelve las colecciones resueltas con su ResolvedContentType', () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const doc = {
			vegaTransfer: 1,
			collections: [{ type: 'posts', records: [{ id: 'p1', values: { title: 'Uno' } }] }]
		};
		const result = validateTransferDocument(doc, model([type]));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.collections).toHaveLength(1);
			expect(result.collections[0].contentType).toBe(type);
			expect(result.collections[0].collection.records).toEqual([
				{ id: 'p1', values: { title: 'Uno' } }
			]);
		}
	});
});
