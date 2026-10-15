import { describe, expect, it } from 'vitest';
import type { ContentType, Field, JsonValue } from '$lib/backend/types';
import { resolveContentModel } from './resolve';
import { validateManifestStrict } from './validate';
import { buildRelationFilter } from '$lib/form/widgets/relation-search';

function manifestWith(field: Record<string, JsonValue>): JsonValue {
	return {
		schemaVersion: 1,
		blockTypes: {
			featured: {
				label: 'Destacados',
				fields: [{ name: 'items', label: 'Elementos', source: 'record', ...field }]
			}
		}
	};
}

function relationOf(manifest: JsonValue, types: ContentType[] = []) {
	const model = resolveContentModel({ types, manifestRaw: manifest });
	return {
		relation: model.blockTypes[0]?.fields[0]?.relation,
		field: model.blockTypes[0]?.fields[0],
		warnings: model.warnings
	};
}

function fileField(name: string): Field {
	return {
		name,
		type: 'file',
		multiple: false,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

function textField(name: string): Field {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

describe('resolución de blockTypes.<t>.fields[].relation', () => {
	it('sin relation el campo queda como siempre (sin clave relation, sin avisos)', () => {
		const { field, relation, warnings } = relationOf(manifestWith({ widget: 'relation' }));
		expect(field?.widget).toBe('relation');
		expect(relation).toBeUndefined();
		expect(warnings).toEqual([]);
	});

	it('forma válida: colección, múltiple, miniatura y filtro', () => {
		const { relation, warnings } = relationOf(
			manifestWith({
				widget: 'relation',
				relation: {
					collection: 'posts',
					multiple: true,
					thumbField: 'cover',
					filter: { status: 'published', featured: true, rank: 2 }
				}
			}),
			[
				{ name: 'posts', readonly: false, fields: [textField('title'), fileField('cover')] }
			] as ContentType[]
		);
		expect(relation).toEqual({
			collection: 'posts',
			multiple: true,
			thumbField: 'cover',
			filter: { status: 'published', featured: true, rank: 2 }
		});
		expect(warnings).toEqual([]);
	});

	it('multiple y filter son opcionales', () => {
		const { relation } = relationOf(
			manifestWith({ widget: 'relation', relation: { collection: 'posts' } })
		);
		expect(relation).toEqual({
			collection: 'posts',
			multiple: false,
			thumbField: null,
			filter: null
		});
	});

	it('collection ausente descarta solo la clave relation, con aviso', () => {
		const { field, relation, warnings } = relationOf(
			manifestWith({ widget: 'relation', relation: { multiple: true } })
		);
		expect(field).toBeDefined();
		expect(relation).toBeUndefined();
		expect(warnings.map((w) => w.path)).toContain(
			'/blockTypes/featured/fields/0/relation/collection'
		);
	});

	it('multiple no booleano avisa y cae a false conservando la colección', () => {
		const { relation, warnings } = relationOf(
			manifestWith({
				widget: 'relation',
				relation: { collection: 'posts', multiple: 'yes' }
			})
		);
		expect(relation).toMatchObject({ collection: 'posts', multiple: false });
		expect(warnings.map((w) => w.path)).toContain(
			'/blockTypes/featured/fields/0/relation/multiple'
		);
	});

	it('filter con un valor no escalar se descarta ENTERO con aviso', () => {
		const { relation, warnings } = relationOf(
			manifestWith({
				widget: 'relation',
				relation: { collection: 'posts', filter: { status: 'published', tags: ['a'] } }
			})
		);
		expect(relation).toMatchObject({ collection: 'posts', filter: null });
		expect(warnings.map((w) => w.path)).toContain('/blockTypes/featured/fields/0/relation/filter');
	});

	it('relation en un widget que no es relation se ignora con aviso', () => {
		const { field, relation, warnings } = relationOf(
			manifestWith({ widget: 'text', relation: { collection: 'posts' } })
		);
		expect(field?.widget).toBe('text');
		expect(relation).toBeUndefined();
		expect(warnings.map((w) => w.path)).toContain('/blockTypes/featured/fields/0/relation');
	});

	it('thumbField que no existe o no es file avisa y deja el selector sin miniatura', () => {
		const types = [
			{ name: 'posts', readonly: false, fields: [textField('title'), fileField('cover')] }
		] as ContentType[];
		for (const thumbField of ['nope', 'title']) {
			const { relation, warnings } = relationOf(
				manifestWith({ widget: 'relation', relation: { collection: 'posts', thumbField } }),
				types
			);
			expect(relation?.thumbField).toBeNull();
			expect(warnings.some((w) => w.message.includes(`thumbField "${thumbField}"`))).toBe(true);
		}
	});
});

describe('colección destino de una relation de bloque', () => {
	const manifest = manifestWith({
		widget: 'relation',
		relation: { collection: 'posts', multiple: true, thumbField: 'cover' }
	});
	const COLLECTION_PATH = '/blockTypes/featured/fields/items/relation/collection';

	it('avisa si la colección no existe y conserva la declaración', () => {
		const { relation, warnings } = relationOf(manifest, []);
		expect(relation).toMatchObject({ collection: 'posts', multiple: true, thumbField: null });
		const hit = warnings.filter((w) => w.path === COLLECTION_PATH);
		expect(hit).toHaveLength(1);
		expect(hit[0]!.code).toBe('manifest-invalid-key');
		// El thumbField no suma un segundo aviso: ya lo explica el de la colección.
		expect(warnings).toHaveLength(1);
	});

	it('no avisa si la colección existe', () => {
		const { warnings } = relationOf(manifest, [
			{ name: 'posts', readonly: false, fields: [fileField('cover')] }
		] as ContentType[]);
		expect(warnings).toEqual([]);
	});
});

describe('validateManifestStrict con relation de bloque', () => {
	const ok = manifestWith({
		widget: 'relation',
		relation: { collection: 'posts', multiple: true, thumbField: 'cover', filter: { a: 'b' } }
	});

	it('acepta la forma válida', () => {
		expect(validateManifestStrict(ok)).toEqual({ ok: true });
	});

	it.each([
		['collection ausente', { widget: 'relation', relation: {} }, '/relation/collection'],
		[
			'multiple no booleano',
			{ widget: 'relation', relation: { collection: 'p', multiple: 1 } },
			'/relation/multiple'
		],
		[
			'filter no escalar',
			{ widget: 'relation', relation: { collection: 'p', filter: { a: { b: 1 } } } },
			'/relation/filter/a'
		],
		[
			'clave desconocida',
			{ widget: 'relation', relation: { collection: 'p', displayField: 'x' } },
			'/relation/displayField'
		],
		['widget distinto de relation', { widget: 'text', relation: { collection: 'p' } }, '/relation']
	])('rechaza %s', (_name, field, pathEnd) => {
		const result = validateManifestStrict(manifestWith(field as Record<string, JsonValue>));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.some((e) => e.path.endsWith(pathEnd))).toBe(true);
	});
});

describe('buildRelationFilter', () => {
	it('null sin filtro, cond con una igualdad y AND con varias', () => {
		expect(buildRelationFilter(null)).toBeNull();
		expect(buildRelationFilter({ status: 'published' })).toEqual({
			kind: 'cond',
			field: 'status',
			op: 'eq',
			value: 'published'
		});
		expect(buildRelationFilter({ status: 'published', rank: 2 })).toEqual({
			kind: 'group',
			combinator: 'and',
			nodes: [
				{ kind: 'cond', field: 'status', op: 'eq', value: 'published' },
				{ kind: 'cond', field: 'rank', op: 'eq', value: 2 }
			]
		});
	});
});
