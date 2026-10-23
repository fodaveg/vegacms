import { expect, test } from 'vitest';
import { resolveContentModel } from './resolve';
import { validateManifestStrict } from './validate';
import type { ContentType, Field, JsonValue } from '$lib/backend/types';
const base = { required: false, readonly: false, presentable: false, hidden: false, unique: false };
const single: Field = {
	...base,
	name: 'picture',
	type: 'relation',
	target: 'vega_media',
	multiple: false
};
test.each([
	[single, 'image', true],
	[{ ...single, multiple: true }, 'image', false],
	[{ ...single, target: 'pages' }, 'image', false],
	[{ ...base, name: 'picture', type: 'text', subtype: 'plain' }, 'image', false],
	[single, 'video', false]
])('mediaKind decorates only a single media relation: %o / %s', (field, value, accepted) => {
	const schema = { name: 'articles', readonly: false, fields: [field] } as ContentType;
	const model = resolveContentModel({
		types: [schema],
		manifestRaw: {
			collections: { articles: { fields: { picture: { mediaKind: value } } } }
		} as JsonValue
	});
	expect(model.types[0].fields[0].mediaKind).toBe(accepted ? 'image' : undefined);
	expect(model.types[0].fields[0].schema).toEqual(field);
	expect(
		model.warnings.some((w) => w.path === '/collections/articles/fields/picture/mediaKind')
	).toBe(!accepted);
});
test('strict metadata writers accept image and reject unsupported media kinds', () => {
	expect(
		validateManifestStrict({
			schemaVersion: 1,
			collections: { articles: { fields: { picture: { mediaKind: 'image' } } } }
		}).ok
	).toBe(true);
	expect(
		validateManifestStrict({
			schemaVersion: 1,
			collections: { articles: { fields: { picture: { mediaKind: 'video' } } } }
		}).ok
	).toBe(false);
});
