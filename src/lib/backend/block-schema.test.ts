import { describe, expect, test } from 'vitest';
import type { Field } from './types';
import type { ResolvedBlockField, ResolvedBlocksConfig, ResolvedBlockType } from '$lib/model/types';
import {
	BlockRecordFieldConflictError,
	addBlockRecordFieldsToCollectionSpecs,
	diagnoseBlockRecordFields,
	deriveBlockRecordFields,
	generateBlockReconciliationMigration,
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

const blocks: ResolvedBlocksConfig = {
	collection: 'content_units',
	parentField: 'ownerRef',
	orderField: 'positionNo',
	typeField: 'kindCode',
	dataField: 'payloadJson'
};

function backendField(field: Pick<Field, 'name' | 'type'> & Partial<Field>): Field {
	return {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...field
	} as Field;
}

function expectStructuralConflict(
	fieldName: string,
	widget: ResolvedBlockField['widget'],
	expectedDeclaration: string
): void {
	let error: unknown;
	try {
		deriveBlockRecordFields([blockType('cta', [field(fieldName, widget)])], blocks);
	} catch (caught) {
		error = caught;
	}

	expect(error).toBeInstanceOf(BlockRecordFieldConflictError);
	expect(error).toHaveProperty('message', expect.stringContaining(expectedDeclaration));
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

		expect(deriveBlockRecordFields(blockTypes, blocks)).toEqual([
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
			deriveBlockRecordFields(
				[blockType('hero', [field('image', 'relation', { required: true })])],
				blocks
			)
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

		expect(() => deriveBlockRecordFields(blockTypes, blocks)).toThrow(
			BlockRecordFieldConflictError
		);
		expect(() => deriveBlockRecordFields(blockTypes, blocks)).toThrow(
			'La columna de bloque "asset" tiene declaraciones físicas incompatibles: hero.asset (relation:vega_media:false:single:keep) <> download.asset ({"type":"file","required":false,"multiple":false,"maxSizeBytes":0,"mimeTypes":[],"thumbs":[]}).'
		);
	});

	test('rechaza parentField configurado aunque su forma física pudiera variar', () => {
		expectStructuralConflict(
			'ownerRef',
			'relation',
			'cta.ownerRef (relation:vega_media:false:single:keep) <> content_units.ownerRef (estructural: parentField)'
		);
	});

	test('rechaza orderField configurado aunque coincida con number', () => {
		expectStructuralConflict(
			'positionNo',
			'number',
			'cta.positionNo (number:false) <> content_units.positionNo (estructural: orderField)'
		);
	});

	test('rechaza typeField configurado aunque coincida con text', () => {
		expectStructuralConflict(
			'kindCode',
			'text',
			'cta.kindCode (text:false:0) <> content_units.kindCode (estructural: typeField)'
		);
	});

	test('rechaza dataField configurado aunque coincida con json', () => {
		expectStructuralConflict(
			'payloadJson',
			'json',
			'cta.payloadJson (json) <> content_units.payloadJson (estructural: dataField)'
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
			{ specs, blocks: { ...blocks, collection: 'blocks' }, blockTypes },
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
		const result = addBlockRecordFieldsToCollectionSpecs(
			specs,
			{ ...blocks, collection: 'blocks' },
			[blockType('hero', [field('image', 'relation')])]
		);

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
			addBlockRecordFieldsToCollectionSpecs(specs, { ...blocks, collection: 'blocks' }, [
				blockType('hero', [field('image', 'relation')])
			])
		).toThrow(BlockRecordFieldConflictError);
		expect(() =>
			addBlockRecordFieldsToCollectionSpecs(specs, { ...blocks, collection: 'blocks' }, [
				blockType('hero', [field('image', 'relation')])
			])
		).toThrow(
			'blocks.image (spec base) (relation:vega_media:true:single:keep) <> hero.image (relation:vega_media:false:single:keep)'
		);
	});
});

describe('diagnoseBlockRecordFields', () => {
	test('missing distingue la ausencia y la reconciliación añade esa columna', () => {
		const diagnostics = diagnoseBlockRecordFields(
			[blockType('hero', [field('image', 'relation')])],
			blocks,
			[]
		);
		const migration = generateBlockReconciliationMigration(
			blocks,
			diagnostics,
			new Date('2026-01-05T00:00:00.000Z')
		);

		expect(diagnostics).toEqual([
			{
				status: 'missing',
				expected: {
					name: 'image',
					type: 'relation',
					target: 'vega_media',
					required: false,
					multiple: false,
					cascadeDelete: false
				}
			}
		]);
		expect(migration?.contents).toContain('collection.fields.add');
		expect(migration?.contents).toContain('"name": "image"');
	});

	test('compatible distingue la misma firma y no emite migración', () => {
		const diagnostics = diagnoseBlockRecordFields(
			[blockType('hero', [field('image', 'relation')])],
			blocks,
			[
				backendField({
					name: 'image',
					type: 'relation',
					target: 'vega_media',
					multiple: false,
					maxSelect: 1,
					cascadeDelete: false
				})
			]
		);

		expect(diagnostics).toEqual([
			expect.objectContaining({
				status: 'compatible',
				expected: expect.objectContaining({ name: 'image' }),
				actual: expect.objectContaining({ name: 'image' })
			})
		]);
		expect(generateBlockReconciliationMigration(blocks, diagnostics)).toBeNull();
	});

	test('incompatible conserva el error propio y la reconciliación la omite', () => {
		const diagnostics = diagnoseBlockRecordFields(
			[
				blockType('hero', [field('image', 'relation')]),
				blockType('gallery', [field('images', 'relation')])
			],
			blocks,
			[
				backendField({
					name: 'image',
					type: 'relation',
					target: 'legacy_media',
					multiple: true,
					maxSelect: 99,
					cascadeDelete: false
				})
			]
		);
		const migration = generateBlockReconciliationMigration(
			blocks,
			diagnostics,
			new Date('2026-01-05T00:00:00.000Z')
		);
		const incompatible = diagnostics[0];

		expect(incompatible).toMatchObject({
			status: 'incompatible',
			expected: { name: 'image' },
			actual: { name: 'image' }
		});
		expect(incompatible).toHaveProperty('conflict', expect.any(BlockRecordFieldConflictError));
		expect(incompatible).toHaveProperty(
			'conflict.message',
			expect.stringContaining(
				'hero.image (relation:vega_media:false:single:keep) <> content_units.image (esquema) (relation:legacy_media:false:multiple:keep)'
			)
		);
		expect(diagnostics[1]).toMatchObject({
			status: 'missing',
			expected: { name: 'images' }
		});
		expect(migration?.contents).not.toContain('"name": "image"');
		expect(migration?.contents).toContain('"name": "images"');
	});

	test.each([
		[
			'cardinalidad relation no canónica',
			field('images', 'relation'),
			backendField({
				name: 'images',
				type: 'relation',
				target: 'vega_media',
				multiple: true,
				maxSelect: 2,
				cascadeDelete: false
			})
		],
		[
			'json required',
			field('metadata', 'json'),
			backendField({ name: 'metadata', type: 'json', required: true })
		],
		[
			'json unique',
			field('metadata', 'json'),
			backendField({ name: 'metadata', type: 'json', unique: true })
		]
	])('no absorbe una restricción real no representable: %s', (_label, declared, actual) => {
		const [diagnostic] = diagnoseBlockRecordFields([blockType('custom', [declared])], blocks, [
			actual
		]);

		expect(diagnostic).toMatchObject({
			status: 'incompatible',
			expected: { name: declared.name },
			actual: { name: declared.name }
		});
		expect(diagnostic).toHaveProperty('conflict', expect.any(BlockRecordFieldConflictError));
	});
});
