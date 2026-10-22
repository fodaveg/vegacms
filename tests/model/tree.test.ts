/** Contrato aditivo tree: lector tolerante, escritor estricto y dry-run del editor técnico. */
import { describe, expect, test } from 'vitest';
import Ajv from 'ajv/dist/2020';
import schema from '$lib/model/manifest-schema.json';
import type { ContentType, JsonValue } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { validateManifestStrict } from '$lib/model/validate';
import { computeEditorState } from '$lib/model/editor/editor-state';
const base = { required: false, readonly: false, presentable: false, hidden: false, unique: false };
const type: ContentType = {
	name: 'categories',
	readonly: false,
	fields: [
		{ ...base, name: 'name', type: 'text', subtype: 'plain' },
		{
			...base,
			name: 'parent',
			type: 'relation',
			target: 'categories',
			multiple: false,
			cascadeDelete: false
		}
	]
};
const manifest = (tree: JsonValue): JsonValue => ({
	schemaVersion: 1,
	collections: { categories: { tree } }
});

describe('manifiesto tree', () => {
	test('declaración válida resuelta y guardable desde el editor técnico', () => {
		const raw = manifest({ parentField: 'parent', maxDepth: 3 });
		const model = resolveContentModel({ types: [type], manifestRaw: raw });
		expect(model.types[0].tree).toEqual({ parentField: 'parent', maxDepth: 3 });
		expect(model.warnings).toEqual([]);
		expect(computeEditorState(JSON.stringify(raw), [type])).toMatchObject({
			canSave: true,
			strictErrors: [],
			dryRunWarnings: []
		});
	});
	test.each(['name', 'absent'])(
		'parentField=%s no es autorrelación: ignora tree y avisa',
		(parentField) => {
			const model = resolveContentModel({
				types: [type],
				manifestRaw: manifest({ parentField, maxDepth: 3 })
			});
			expect(model.types[0].tree).toBeNull();
			expect(model.warnings).toMatchObject([
				{ code: 'manifest-invalid-key', path: '/collections/categories/tree' }
			]);
		}
	);
	test('relación múltiple o a otra colección no activa el árbol', () => {
		const relation = type.fields[1];
		for (const change of [{ multiple: true }, { target: 'elsewhere' }]) {
			const model = resolveContentModel({
				types: [
					{ ...type, fields: [type.fields[0], { ...relation, ...change } as typeof relation] }
				],
				manifestRaw: manifest({ parentField: 'parent', maxDepth: 3 })
			});
			expect(model.types[0].tree).toBeNull();
			expect(model.warnings).toHaveLength(1);
		}
	});
	test.each([0, 11, 1.5, '3', null])(
		'maxDepth=%s: escritor y JSON Schema rechazan; lector degrada',
		(maxDepth) => {
			const raw = manifest({ parentField: 'parent', maxDepth });
			expect(validateManifestStrict(raw).ok).toBe(false);
			expect(new Ajv({ strict: false }).compile(schema)(raw)).toBe(false);
			const model = resolveContentModel({ types: [type], manifestRaw: raw });
			expect(model.types[0].tree).toBeNull();
			expect(model.warnings).toHaveLength(1);
		}
	);
	test('claves futuras se ignoran al leer pero el escritor las rechaza', () => {
		const raw = manifest({ parentField: 'parent', maxDepth: 3, future: true });
		expect(resolveContentModel({ types: [type], manifestRaw: raw }).types[0].tree).toEqual({
			parentField: 'parent',
			maxDepth: 3
		});
		expect(validateManifestStrict(raw).ok).toBe(false);
	});
});
