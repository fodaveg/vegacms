/** Entrada desde el listado: las páginas con editor visual conservan enlaces reales a ambos
 * destinos; las demás colecciones y las capacidades ausentes mantienen el formulario. */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { t } from '$lib/i18n';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import RecordTable from './RecordTable.svelte';

const schemaField: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};
const field: ResolvedField = {
	schema: schemaField,
	name: 'title',
	label: 'Título',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'text',
	subtype: 'plain',
	listable: true
};
const blocks: NonNullable<ResolvedContentType['blocks']> = {
	collection: 'page_blocks',
	parentField: 'page',
	orderField: 'sort',
	typeField: null,
	dataField: null
};

function contentType(overrides: Partial<ResolvedContentType> = {}): ResolvedContentType {
	const schema: ContentType = { name: 'content', readonly: false, fields: [schemaField] };
	return {
		schema,
		name: 'content',
		label: 'Contenido',
		labelSingular: 'Contenido',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: 'title',
		subtitleField: null,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields: [field],
		listFields: ['title'],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false,
		page: { pathField: 'path', pathFieldUnique: true, layoutField: null },
		blocks,
		...overrides
	};
}

const record: VegaRecord = { id: 'r1', type: 'content', values: { title: 'Sobre mí' } };

interface Mounted {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	toRecord: ReturnType<typeof vi.fn>;
	toVisual: ReturnType<typeof vi.fn>;
}

async function mountTable(
	type: ResolvedContentType,
	port: { previewApiUrl?: string | null; previewVisualEditing?: boolean } = {
		previewApiUrl: 'https://example.test/api/preview',
		previewVisualEditing: true
	}
): Promise<Mounted> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const toRecord = vi.fn();
	const toVisual = vi.fn();
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		locale: 'es',
		port,
		model: { scheduledPublishing: 'unknown' },
		nav: { toRecord, toVisual }
	} as unknown as VegaAppContext;
	const instance = mount(RecordTable, {
		target,
		props: {
			contentType: type,
			columns: [{ field, isTitle: true, isStatus: false, sortable: false }],
			records: [record],
			sort: null,
			onSort: vi.fn(),
			onDeleteRequest: vi.fn(),
			reorderable: false,
			onReorder: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	await tick();
	return { target, instance, toRecord, toVisual };
}

function links(mounted: Mounted): HTMLAnchorElement[] {
	return Array.from(mounted.target.querySelectorAll<HTMLAnchorElement>('.vega-cell-title a'));
}

describe('RecordTable — entrada de página', () => {
	let mounted: Mounted | null = null;
	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('página compatible: título abre el lienzo y «Campos de página» abre el formulario', async () => {
		mounted = await mountTable(contentType());
		const [visual, fields] = links(mounted);
		expect(visual?.getAttribute('href')).toBe('/c/content/r1/visual');
		expect(visual?.getAttribute('aria-label')).toBe('Editar página: Sobre mí');
		expect(visual?.textContent).toContain('Editar página');
		expect(fields?.getAttribute('href')).toBe('/c/content/r1');
		expect(fields?.textContent).toBe('Campos de página');
		visual!.click();
		fields!.click();
		expect(mounted.toVisual).toHaveBeenCalledWith('content', 'r1');
		expect(mounted.toRecord).toHaveBeenCalledWith('content', 'r1');
	});

	test('los gestos modificados conservan el href; Enter usa el enlace nativo', async () => {
		mounted = await mountTable(contentType());
		const [visual, fields] = links(mounted);
		visual!.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
		);
		fields!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }));
		expect(mounted.toVisual).not.toHaveBeenCalled();
		expect(mounted.toRecord).not.toHaveBeenCalled();
		expect(visual?.tabIndex).toBe(0);
		expect(fields?.tabIndex).toBe(0);
		visual!.focus();
		expect(document.activeElement).toBe(visual);
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		visual!.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(false);
	});

	test.each([
		['colección normal', { page: null }, undefined],
		['sin bloques', { blocks: null }, undefined],
		['sin preview', {}, { previewApiUrl: null, previewVisualEditing: true }],
		['sin puente', {}, { previewApiUrl: 'https://example.test/api/preview' }]
	] as const)('%s mantiene el formulario', async (_name, overrides, port) => {
		mounted = await mountTable(contentType(overrides), port);
		expect(links(mounted)).toHaveLength(1);
		expect(links(mounted)[0]?.getAttribute('href')).toBe('/c/content/r1');
		links(mounted)[0]!.click();
		expect(mounted.toRecord).toHaveBeenCalledWith('content', 'r1');
		expect(mounted.toVisual).not.toHaveBeenCalled();
	});

	test('sin permiso de ver no ofrece enlaces', async () => {
		mounted = await mountTable(contentType({ permissions: { ...ALL_PERMISSIONS, view: false } }));
		expect(links(mounted)).toHaveLength(0);
		expect(mounted.target.querySelector('.vega-cell-title')?.textContent).toContain('Sobre mí');
	});
});
