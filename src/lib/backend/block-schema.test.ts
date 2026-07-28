import { describe, expect, test } from 'vitest';
import type { ResolvedBlockField, ResolvedBlockType } from '$lib/model/types';
import {
	BlockRecordFieldConflictError,
	addBlockRecordFieldsToCollectionSpecs,
	deriveBlockRecordFields,
	generateBlockSchemaMigration
} from './block-schema';

function field(
	name: string,
	widget: ResolvedBlockField['widget'],
	options: Partial<ResolvedBlockField> = {}
): ResolvedBlockField {
	return {
		name,
		label: name,
		widget,
		source: 'record',
		required: false,
		options: null,
		...options
	};
}

function blockType(name: string, fields: ResolvedBlockField[]): ResolvedBlockType {
	return { name, label: name, icon: null, fields };
}

describe('deriveBlockRecordFields', () => {
	test('el modelo real del starter comparte image y materializa images como múltiple', () => {
		const blockTypes = [
			blockType('hero', [
				field('title', 'text', { source: 'data' }),
				field('image', 'relation', { required: true })
			]),
			blockType('image', [field('image', 'relation')]),
			blockType('gallery', [field('images', 'relation')]),
			blockType('divider', [field('label', 'text', { source: 'data' })])
		];

		expect(deriveBlockRecordFields(blockTypes)).toEqual([
			{
				name: 'image',
				type: 'relation',
				target: 'vega_media',
				required: false,
				multiple: false,
				cascadeDelete: false
			},
			{
				name: 'images',
				type: 'relation',
				target: 'vega_media',
				required: false,
				multiple: true,
				cascadeDelete: false
			}
		]);
	});

	test('required del formulario nunca vuelve obligatoria la columna compartida', () => {
		expect(
			deriveBlockRecordFields([blockType('hero', [field('image', 'relation', { required: true })])])
		).toEqual([
			expect.objectContaining({
				name: 'image',
				required: false
			})
		]);
	});

	test('dos tipos con el mismo nombre y formas físicas incompatibles fallan con error propio', () => {
		const blockTypes = [
			blockType('hero', [field('asset', 'relation')]),
			blockType('download', [field('asset', 'file')])
		];

		expect(() => deriveBlockRecordFields(blockTypes)).toThrow(BlockRecordFieldConflictError);
		expect(() => deriveBlockRecordFields(blockTypes)).toThrow(
			'La columna de bloque "asset" tiene declaraciones físicas incompatibles: hero.asset (relation:vega_media:false:single:keep) <> download.asset ({"type":"file","required":false,"multiple":false,"maxSizeBytes":0,"mimeTypes":[],"thumbs":[]}).'
		);
	});
});

describe('generateBlockSchemaMigration', () => {
	test('enriquece solo blocks y crea pages/vega_media antes de sus relaciones', () => {
		const blockTypes = [
			blockType('hero', [field('image', 'relation')]),
			blockType('gallery', [field('images', 'relation')])
		];
		const specs = [
			{
				name: 'blocks',
				fields: [
					{
						name: 'parent',
						type: 'relation' as const,
						target: 'pages',
						required: true,
						multiple: false,
						cascadeDelete: false
					},
					{ name: 'type', type: 'text' as const },
					{ name: 'data', type: 'json' as const }
				]
			},
			{ name: 'pages', fields: [{ name: 'title', type: 'text' as const }] },
			{ name: 'vega_media', fields: [] }
		];

		const { contents } = generateBlockSchemaMigration(
			{ specs, blockCollection: 'blocks', blockTypes },
			new Date('2026-01-04T00:00:00.000Z')
		);
		const downStart = contents.indexOf('}, (app) => {');
		const up = contents.slice(0, downStart);

		expect(up.indexOf('"name": "pages"')).toBeLessThan(up.indexOf('"name": "blocks"'));
		expect(up.indexOf('"name": "vega_media"')).toBeLessThan(up.indexOf('"name": "blocks"'));
		expect(contents).toContain('"name": "image"');
		expect(contents).toContain('"maxSelect": 1');
		expect(contents).toContain('"name": "images"');
		expect(contents).toContain('"maxSelect": 99');
		expect(() => new Function(contents)).not.toThrow();
	});

	test('no muta los specs base y evita duplicar una columna compatible ya declarada', () => {
		const image = {
			name: 'image',
			type: 'relation' as const,
			target: 'vega_media',
			required: false,
			multiple: false,
			cascadeDelete: false
		};
		const specs = [{ name: 'blocks', fields: [image] }];
		const result = addBlockRecordFieldsToCollectionSpecs(specs, 'blocks', [
			blockType('hero', [field('image', 'relation')])
		]);

		expect(result[0].fields).toEqual([image]);
		expect(result).not.toBe(specs);
		expect(result[0]).not.toBe(specs[0]);
	});

	test('rechaza una columna base obligatoria: las columnas compartidas siempre son opcionales', () => {
		const specs = [
			{
				name: 'blocks',
				fields: [
					{
						name: 'image',
						type: 'relation' as const,
						target: 'vega_media',
						required: true,
						multiple: false,
						cascadeDelete: false
					}
				]
			}
		];

		expect(() =>
			addBlockRecordFieldsToCollectionSpecs(specs, 'blocks', [
				blockType('hero', [field('image', 'relation')])
			])
		).toThrow(BlockRecordFieldConflictError);
	});
});
