import { expect, test } from 'vitest';
import { resolveContentModel } from './resolve';
function resolve(description?: string | number | { html: string }) {
	return resolveContentModel({
		types: [],
		manifestRaw: {
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					...(description === undefined ? {} : { description }),
					fields: [{ name: 'title', label: 'Título', widget: 'text' }]
				}
			}
		}
	});
}
test('optional catalogue description preserves the existing block vocabulary', () => {
	expect(resolve().blockTypes[0]).not.toHaveProperty('description');
	expect(resolve('Presenta la página').blockTypes[0].description).toBe('Presenta la página');
});
test.each(['', 'x'.repeat(241), 42, { html: '<b>no</b>' }])(
	'invalid description degrades only that field: %j',
	(description) => {
		const model = resolve(description);
		expect(model.blockTypes).toHaveLength(1);
		expect(model.blockTypes[0]).not.toHaveProperty('description');
		expect(model.warnings.some((warning) => warning.code === 'manifest-invalid-key')).toBe(true);
	}
);
