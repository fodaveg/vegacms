/**
 * Adversarios del aviso de columnas físicas de bloque. Montaje real Svelte 5: prueba el conteo
 * por `(colección, columna)`, la separación de incompatibles y que el botón solo muestra
 * migraciones — nunca toca un BackendPort.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test } from 'vitest';
import type { ContentType, Field } from '$lib/backend';
import type {
	ContentModel,
	ModelWarning,
	ResolvedBlockType,
	ResolvedBlocksConfig,
	ResolvedContentType
} from '$lib/model/types';
import BlockColumnReconciliationPanel from './BlockColumnReconciliationPanel.svelte';

function t(key: string, params?: Record<string, string | number>): string {
	return params ? `${key}:${JSON.stringify(params)}` : key;
}

const BASE_FIELD = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};

function textField(name: string): Extract<Field, { type: 'text' }> {
	return {
		...BASE_FIELD,
		name,
		type: 'text',
		subtype: 'plain'
	};
}

function jsonField(name: string, required = false): Extract<Field, { type: 'json' }> {
	return {
		...BASE_FIELD,
		name,
		type: 'json',
		required
	};
}

function fileField(name: string): Extract<Field, { type: 'file' }> {
	return {
		...BASE_FIELD,
		name,
		type: 'file',
		multiple: false,
		maxSelect: 1,
		maxSizeBytes: 0,
		mimeTypes: [],
		protected: false
	};
}

function contentType(name: string, fields: Field[]): ContentType {
	return { name, readonly: false, fields };
}

function blocks(collection: string): ResolvedBlocksConfig {
	return {
		collection,
		parentField: 'parent',
		orderField: 'position',
		typeField: 'kind',
		dataField: 'data'
	};
}

function resolvedParent(name: string, config: ResolvedBlocksConfig | null): ResolvedContentType {
	return {
		name,
		schema: contentType(name, []),
		blocks: config
	} as ResolvedContentType;
}

function blockType(
	fields: Array<{ name: string; widget: 'file' | 'text' | 'json' }>
): ResolvedBlockType {
	return {
		name: 'hero',
		label: 'Hero',
		icon: null,
		fields: fields.map((field) => ({
			...field,
			label: field.name,
			source: 'record' as const,
			required: false,
			options: null
		}))
	};
}

function model(options: {
	blockTypes?: ResolvedBlockType[];
	parents?: ResolvedContentType[];
	warnings?: ModelWarning[];
}): ContentModel {
	return {
		blockTypes: options.blockTypes ?? [],
		types: options.parents ?? [],
		warnings: options.warnings ?? []
	} as unknown as ContentModel;
}

function mountPanel(props: { types: ContentType[]; model: ContentModel }): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(BlockColumnReconciliationPanel, {
		target,
		props: { ...props, t }
	});
	return { target, instance };
}

describe('BlockColumnReconciliationPanel.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin blockTypes no hay nada que diagnosticar ni panel', () => {
		mounted = mountPanel({
			types: [contentType('content_units', [])],
			model: model({ parents: [resolvedParent('pages', blocks('content_units'))] })
		});

		expect(mounted.target.querySelector('[data-block-column-divergence]')).toBeNull();
	});

	test('dos colecciones distintas cuentan dos pares físicos y generan una migración por colección', async () => {
		const recordFields = blockType([{ name: 'image', widget: 'file' }]);
		mounted = mountPanel({
			types: [contentType('page_blocks', []), contentType('post_blocks', [])],
			model: model({
				blockTypes: [recordFields],
				parents: [
					resolvedParent('pages', blocks('page_blocks')),
					// Dos padres que comparten hija no crean un tercer par físico.
					resolvedParent('landing_pages', blocks('page_blocks')),
					resolvedParent('posts', blocks('post_blocks'))
				]
			})
		});

		expect(mounted.target.textContent).toContain(
			'settings.blockColumns.missingSummary:{"count":2}'
		);
		const buttons = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-block-columns-group > button')
		);
		expect(buttons).toHaveLength(2);

		buttons.forEach((button) => button.click());
		await tick();

		const migrations = Array.from(
			mounted.target.querySelectorAll<HTMLElement>('.vega-migration-code')
		).map((node) => node.textContent ?? '');
		expect(migrations).toHaveLength(2);
		expect(migrations.some((contents) => contents.includes('"page_blocks"'))).toBe(true);
		expect(migrations.some((contents) => contents.includes('"post_blocks"'))).toBe(true);
		expect(migrations.every((contents) => contents.includes('"name": "image"'))).toBe(true);
	});

	test('generar dos veces reemplaza el panel y produce dos nombres distintos sin aplicar nada', async () => {
		mounted = mountPanel({
			types: [contentType('content_units', [])],
			model: model({
				blockTypes: [blockType([{ name: 'image', widget: 'file' }])],
				parents: [resolvedParent('pages', blocks('content_units'))]
			})
		});

		const button = mounted.target.querySelector<HTMLButtonElement>(
			'.vega-block-columns-group > button'
		)!;
		button.click();
		await tick();
		const firstInstructions =
			mounted.target.querySelector<HTMLElement>('.vega-migration-panel p')?.textContent ?? '';

		button.click();
		await tick();
		const secondInstructions =
			mounted.target.querySelector<HTMLElement>('.vega-migration-panel p')?.textContent ?? '';

		expect(mounted.target.querySelectorAll('.vega-migration-panel')).toHaveLength(1);
		expect(firstInstructions).not.toBe(secondInstructions);
		expect(secondInstructions).toContain('settings.schema.migration.pendingInstructions');
	});

	test('colección hija inexistente: avisa desde blocks-invalid y no ofrece reconciliación', () => {
		mounted = mountPanel({
			types: [],
			model: model({
				blockTypes: [blockType([{ name: 'image', widget: 'file' }])],
				parents: [resolvedParent('pages', null)],
				warnings: [
					{
						code: 'blocks-invalid',
						message: 'mensaje histórico en castellano que este panel no debe renderizar',
						collection: 'pages',
						path: '/collections/pages/blocks/collection'
					}
				]
			})
		});

		expect(mounted.target.textContent).toContain(
			'settings.blockColumns.collectionMissingBody:{"collection":"pages"}'
		);
		expect(mounted.target.textContent).not.toContain('mensaje histórico');
		expect(mounted.target.querySelector('.vega-block-columns-group > button')).toBeNull();
		expect(mounted.target.querySelector('.vega-migration-panel')).toBeNull();
	});

	test('todas las columnas compatibles: estado sano sin ruido', () => {
		mounted = mountPanel({
			types: [contentType('content_units', [fileField('image')])],
			model: model({
				blockTypes: [blockType([{ name: 'image', widget: 'file' }])],
				parents: [resolvedParent('pages', blocks('content_units'))]
			})
		});

		expect(mounted.target.querySelector('[data-block-column-divergence]')).toBeNull();
	});

	test('mezcla missing/compatible/incompatible: migra solo la ausente y localiza el conflicto', async () => {
		mounted = mountPanel({
			types: [contentType('content_units', [textField('caption'), jsonField('metadata', true)])],
			model: model({
				blockTypes: [
					blockType([
						{ name: 'image', widget: 'file' },
						{ name: 'caption', widget: 'text' },
						{ name: 'metadata', widget: 'json' }
					])
				],
				parents: [resolvedParent('pages', blocks('content_units'))]
			})
		});

		expect(mounted.target.textContent).toContain(
			'settings.blockColumns.missingSummary:{"count":1}'
		);
		expect(mounted.target.textContent).toContain('settings.blockColumns.incompatibleTitle');
		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.required');

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-columns-group > button')!.click();
		await tick();
		const migration =
			mounted.target.querySelector<HTMLElement>('.vega-migration-code')?.textContent ?? '';
		expect(migration).toContain('"name": "image"');
		expect(migration).not.toContain('"name": "caption"');
		expect(migration).not.toContain('"name": "metadata"');
	});

	test('una sola incompatible y ninguna ausente: avisa con motivo localizado y no ofrece botón', () => {
		mounted = mountPanel({
			types: [contentType('content_units', [textField('image')])],
			model: model({
				blockTypes: [blockType([{ name: 'image', widget: 'file' }])],
				parents: [resolvedParent('pages', blocks('content_units'))]
			})
		});

		expect(mounted.target.textContent).toContain(
			'settings.blockColumns.incompatibleTitle:{"count":1}'
		);
		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.type');
		expect(mounted.target.querySelector('.vega-block-columns-group > button')).toBeNull();
		expect(mounted.target.querySelector('.vega-migration-panel')).toBeNull();
	});

	test('conflicto de manifiesto (campo record choca con estructural): avisa sin reventar el render', () => {
		const parentCollidesBlockType: ResolvedBlockType = {
			name: 'hero',
			label: 'Hero',
			icon: null,
			fields: [
				{
					name: 'parent',
					widget: 'text',
					label: 'parent',
					source: 'record',
					required: false,
					options: null
				}
			]
		};

		expect(() => {
			mounted = mountPanel({
				types: [contentType('content_units', [])],
				model: model({
					blockTypes: [parentCollidesBlockType],
					parents: [resolvedParent('pages', blocks('content_units'))]
				})
			});
		}).not.toThrow();

		expect(mounted!.target.textContent).toContain('settings.blockColumns.conflictTitle');
		expect(mounted!.target.textContent).toContain(
			'settings.blockColumns.conflictBody:{"collection":"content_units","field":"parent"'
		);
		expect(mounted!.target.querySelector('.vega-block-columns-group > button')).toBeNull();
	});

	test('explica restricciones localizadas de máximos, readonly, unique y fichero', () => {
		mounted = mountPanel({
			types: [
				contentType('content_units', [
					{ ...textField('caption'), maxLength: 120, readonly: true },
					{ ...jsonField('metadata'), unique: true },
					{ ...fileField('image'), maxSelect: 2, protected: true }
				])
			],
			model: model({
				blockTypes: [
					blockType([
						{ name: 'caption', widget: 'text' },
						{ name: 'metadata', widget: 'json' },
						{ name: 'image', widget: 'file' }
					])
				],
				parents: [resolvedParent('pages', blocks('content_units'))]
			})
		});

		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.textConstraints');
		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.readonly');
		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.unique');
		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.cardinality');
		expect(mounted.target.textContent).toContain('settings.blockColumns.reason.fileConstraints');
		expect(mounted.target.querySelector('.vega-block-columns-group > button')).toBeNull();
	});
});
