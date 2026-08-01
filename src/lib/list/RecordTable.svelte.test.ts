/**
 * Suite de `RecordTable.svelte` — SOLO el fallback de la línea secundaria a la ruta de una página
 * (modelo de páginas, tarea p1 `1dc63001`; encargo "crear y editar páginas" §5): "la lista de una
 * colección de páginas enseña la ruta de cada registro". Montaje real, mismo patrón que
 * `FieldRow.svelte.test.ts`.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordTable from './RecordTable.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';

const titleFieldSchema: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};
const pathFieldSchema: Field = {
	name: 'path',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: true
};

const titleField: ResolvedField = {
	schema: titleFieldSchema,
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
const pathField: ResolvedField = {
	schema: pathFieldSchema,
	name: 'path',
	label: 'Ruta',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'text',
	subtype: 'plain',
	listable: false
};

function makePageType(subtitleField: string | null): ResolvedContentType {
	const schema: ContentType = {
		name: 'pages',
		readonly: false,
		fields: [titleFieldSchema, pathFieldSchema]
	};
	return {
		schema,
		name: 'pages',
		label: 'Páginas',
		labelSingular: 'Página',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: 'title',
		subtitleField,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields: [titleField, pathField],
		listFields: ['title'],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false,
		page: { pathField: 'path', pathFieldUnique: true, layoutField: null }
	};
}

const record: VegaRecord = {
	id: 'r1',
	type: 'pages',
	values: { title: 'Sobre mí', path: '/sobre-mi' }
};

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string) => key,
		locale: 'es',
		nav: { toRecord: vi.fn() }
	} as unknown as VegaAppContext;
}

function mountTable(contentType: ResolvedContentType): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RecordTable, {
		target,
		props: {
			contentType,
			columns: [{ field: titleField, isTitle: true, isStatus: false, sortable: false }],
			records: [record],
			sort: null,
			onSort: vi.fn(),
			onDeleteRequest: vi.fn(),
			reorderable: false,
			onReorder: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

describe('RecordTable.svelte — fallback de subtítulo a la ruta (modelo de páginas)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin `subtitleField` declarado, colección de páginas: pinta la RUTA como línea secundaria', () => {
		mounted = mountTable(makePageType(null));
		const subtitle = mounted.target.querySelector('.vega-cell-subtitle');
		expect(subtitle?.textContent).toBe('/sobre-mi');
	});

	test('con `subtitleField` declarado explícito: el manifiesto GANA, no se pisa con la ruta', () => {
		mounted = mountTable(makePageType('path'));
		// En este fixture `subtitleField: 'path'` coincide con la ruta, así que el texto es el
		// mismo — la prueba real de que gana el manifiesto vive en el test de abajo.
		const subtitle = mounted.target.querySelector('.vega-cell-subtitle');
		expect(subtitle?.textContent).toBe('/sobre-mi');
	});

	test('`subtitleField` explícito DISTINTO de la ruta: se pinta el declarado, no la ruta', () => {
		const type = makePageType('title');
		mounted = mountTable(type);
		const subtitle = mounted.target.querySelector('.vega-cell-subtitle');
		expect(subtitle?.textContent).toBe('Sobre mí');
	});

	test('ruta BILINGÜE (page.localizedPath): sin subtitleField, pinta la columna del locale POR DEFECTO', () => {
		const pathEsFieldSchema: Field = { ...pathFieldSchema, name: 'pathEs' };
		const pathEnFieldSchema: Field = { ...pathFieldSchema, name: 'pathEn' };
		const pathEsField: ResolvedField = { ...pathField, schema: pathEsFieldSchema, name: 'pathEs' };
		const pathEnField: ResolvedField = { ...pathField, schema: pathEnFieldSchema, name: 'pathEn' };
		const type: ResolvedContentType = {
			...makePageType(null),
			schema: {
				name: 'pages',
				readonly: false,
				fields: [titleFieldSchema, pathEsFieldSchema, pathEnFieldSchema]
			},
			fields: [titleField, pathEsField, pathEnField],
			page: {
				pathField: 'path',
				pathFieldUnique: true,
				layoutField: null,
				localizedPath: { defaultLocale: 'es', fields: { es: 'pathEs', en: 'pathEn' } }
			}
		};
		const bilingualRecord: VegaRecord = {
			id: 'r1',
			type: 'pages',
			values: { title: 'Sobre mí', pathEs: '/sobre-mi', pathEn: '/about-us' }
		};
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(RecordTable, {
			target,
			props: {
				contentType: type,
				columns: [{ field: titleField, isTitle: true, isStatus: false, sortable: false }],
				records: [bilingualRecord],
				sort: null,
				onSort: vi.fn(),
				onDeleteRequest: vi.fn(),
				reorderable: false,
				onReorder: vi.fn()
			},
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		const subtitle = target.querySelector('.vega-cell-subtitle');
		expect(subtitle?.textContent).toBe('/sobre-mi');
		unmount(instance);
		target.remove();
	});
});
