import { describe, expect, test } from 'vitest';
import {
	checkCollectionFieldSpecs,
	collectionUniqueIndexes,
	type CollectionFieldSpec
} from './collections';

describe('CollectionFieldSpec — validación runtime de select/unique', () => {
	test.each([
		{ name: 'sin opciones', options: [] },
		{ name: 'opción vacía', options: [''] },
		{ name: 'espacio inicial', options: [' draft'] },
		{ name: 'espacio final', options: ['draft '] },
		{ name: 'repetida tal cual', options: ['draft', 'draft'] }
	])('rechaza $name sin normalizar en silencio', ({ options }) => {
		const rejects = checkCollectionFieldSpecs([
			{ name: 'status', type: 'select', options, multiple: false }
		]);
		expect(rejects).toHaveProperty('status');
	});

	test('acepta select simple y múltiple con opciones distintas tal cual', () => {
		expect(
			checkCollectionFieldSpecs([
				{
					name: 'status',
					type: 'select',
					options: ['draft', 'published'],
					multiple: false
				},
				{ name: 'tags', type: 'select', options: ['A', 'a'], multiple: true }
			])
		).toEqual({});
	});

	test('rechaza en runtime options o multiple ausentes', () => {
		const withoutOptions = {
			name: 'status',
			type: 'select',
			multiple: false
		} as unknown as CollectionFieldSpec;
		const withoutMultiple = {
			name: 'status',
			type: 'select',
			options: ['draft']
		} as unknown as CollectionFieldSpec;

		expect(checkCollectionFieldSpecs([withoutOptions])).toMatchObject({
			status: { code: 'vega_select_options_required' }
		});
		expect(checkCollectionFieldSpecs([withoutMultiple])).toMatchObject({
			status: { code: 'vega_select_multiple_required' }
		});
	});

	test('rechaza unique en runtime sobre una variante que no es text', () => {
		const invalid = {
			name: 'status',
			type: 'select',
			options: ['draft'],
			multiple: false,
			unique: true
		} as unknown as CollectionFieldSpec;

		expect(checkCollectionFieldSpecs([invalid])).toMatchObject({
			status: { code: 'vega_unique_text_only' }
		});
	});

	test('el tipo solo permite unique?: true en text', () => {
		const invalid: CollectionFieldSpec = {
			name: 'status',
			type: 'select',
			options: ['draft'],
			multiple: false,
			// @ts-expect-error unique pertenece exclusivamente a la variante text.
			unique: true
		};
		expect(invalid.type).toBe('select');
	});
});

describe('collectionUniqueIndexes', () => {
	test('emite un índice único determinista solo para text unique', () => {
		expect(
			collectionUniqueIndexes('pages', [
				{ name: 'path', type: 'text', unique: true },
				{ name: 'title', type: 'text' },
				{ name: 'status', type: 'select', options: ['draft'], multiple: false }
			])
		).toEqual(['CREATE UNIQUE INDEX `idx_vega_unique_5_pages_4_path` ON `pages` (`path`)']);
	});
});
