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
import type { ContentType, Field, ScheduledPublishingState, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { t } from '$lib/i18n';

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

describe('RecordTable.svelte — miniatura de columna file (hallazgo p2, lote "formularios y medios")', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	const fileRecord: VegaRecord = {
		id: 'r1',
		type: 'pages',
		values: { title: 'Sobre mí', path: '/sobre-mi', cover: 'archivo.jpg' }
	};

	function fileColumn(thumbs: string[] | undefined): {
		type: ResolvedContentType;
		field: ResolvedField;
	} {
		const schema: Field = {
			name: 'cover',
			type: 'file',
			multiple: false,
			protected: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false,
			thumbs
		};
		const field: ResolvedField = {
			schema,
			name: 'cover',
			label: 'Portada',
			help: null,
			placeholder: null,
			hidden: false,
			group: null,
			widget: 'file',
			subtype: null,
			listable: true
		};
		const base = makePageType(null);
		return {
			field,
			type: {
				...base,
				schema: { ...base.schema, fields: [...base.schema.fields, schema] },
				fields: [...base.fields, field]
			}
		};
	}

	function mountWithFileColumn(
		thumbs: string[] | undefined,
		fileUrl: ReturnType<typeof vi.fn>
	): { target: HTMLElement; instance: ReturnType<typeof mount> } {
		const { type, field } = fileColumn(thumbs);
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(RecordTable, {
			target,
			props: {
				contentType: type,
				columns: [
					{ field: titleField, isTitle: true, isStatus: false, sortable: false },
					{ field, isTitle: false, isStatus: false, sortable: false }
				],
				records: [fileRecord],
				sort: null,
				onSort: vi.fn(),
				onDeleteRequest: vi.fn(),
				reorderable: false,
				onReorder: vi.fn()
			},
			context: new Map([
				[
					VEGA_CONTEXT_KEY,
					{
						t: (key: string) => key,
						locale: 'es',
						nav: { toRecord: vi.fn() },
						port: { capabilities: { thumbs: true }, fileUrl }
					} as unknown as VegaAppContext
				]
			])
		});
		return { target, instance };
	}

	test('tamaño declarado en el campo (`Field.thumbs`): se pide 28x28 tal cual', () => {
		const fileUrl = vi.fn().mockReturnValue('https://pb.test/thumb.jpg');
		mounted = mountWithFileColumn(['300x300', '120x120', '28x28'], fileUrl);

		expect(fileUrl).toHaveBeenCalledWith(expect.anything(), 'cover', 'archivo.jpg', {
			thumb: { width: 28, height: 28, fit: 'crop' }
		});
	});

	test('tamaño NO declarado: cae a 100x100 en vez de pedirlo a ciegas (PB devolvería el ORIGINAL)', () => {
		const fileUrl = vi.fn().mockReturnValue('https://pb.test/thumb.jpg');
		mounted = mountWithFileColumn([], fileUrl);

		expect(fileUrl).toHaveBeenCalledWith(expect.anything(), 'cover', 'archivo.jpg', {
			thumb: { width: 100, height: 100, fit: 'crop' }
		});
	});

	test('la miniatura lleva `loading="lazy"` y `decoding="async"`', () => {
		mounted = mountWithFileColumn(['28x28'], vi.fn().mockReturnValue('https://pb.test/thumb.jpg'));

		const img = mounted.target.querySelector<HTMLImageElement>('.vega-file-thumbs img');
		expect(img?.getAttribute('loading')).toBe('lazy');
		expect(img?.getAttribute('decoding')).toBe('async');
	});
});

describe('RecordTable.svelte — insignia «Programada» (publicación programada, `publishAtField`)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	const statusSchema: Field = {
		name: 'status',
		type: 'select',
		options: ['draft', 'published'],
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	const publishAtSchema: Field = {
		name: 'publishAt',
		type: 'date',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	const statusField: ResolvedField = {
		...titleField,
		schema: statusSchema,
		name: 'status',
		label: 'Estado',
		widget: 'select',
		subtype: null
	};

	function mountWithStatus(
		publishAtField: string | null,
		values: Record<string, string>,
		scheduledPublishing: ScheduledPublishingState = 'active'
	) {
		const contentType: ResolvedContentType = {
			...makePageType(null),
			schema: {
				name: 'pages',
				readonly: false,
				fields: [titleFieldSchema, statusSchema, publishAtSchema]
			},
			statusField: 'status',
			statusLabels: { draft: 'Borrador', published: 'Publicado' },
			publishAtField,
			fields: [titleField, statusField],
			listFields: ['title', 'status']
		};
		const ctx = {
			...fakeCtx(),
			t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
			model: { scheduledPublishing }
		} as unknown as VegaAppContext;
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(RecordTable, {
			target,
			props: {
				contentType,
				columns: [
					{ field: titleField, isTitle: true, isStatus: false, sortable: false },
					{ field: statusField, isTitle: false, isStatus: true, sortable: false }
				],
				records: [{ id: 'r1', type: 'pages', values: { title: 'Otoño', ...values } }],
				sort: null,
				onSort: vi.fn(),
				onDeleteRequest: vi.fn(),
				reorderable: false,
				onReorder: vi.fn()
			},
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		return { target, instance };
	}

	// Siempre en el futuro, sea cuando sea que corra el test. El FORMATO de la fecha lo fija
	// `cell.test.ts` con fechas construidas; aquí solo importa que la tabla use esa insignia.
	const future = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();

	test('borrador con fecha futura: texto «Programada · …», data-status sigue siendo draft', () => {
		mounted = mountWithStatus('publishAt', { status: 'draft', publishAt: future });
		const badge = mounted.target.querySelector<HTMLElement>('.vega-status-badge');
		expect(badge?.dataset.status).toBe('draft');
		expect(badge?.dataset.statusKind).toBe('scheduled');
		expect(badge?.textContent?.trim()).toMatch(/^Programada · \S.+$/);
	});

	test('servidor SIN vegaschedule: el mismo borrador dice «Borrador · fecha sin efecto»', () => {
		mounted = mountWithStatus('publishAt', { status: 'draft', publishAt: future }, 'inactive');
		const badge = mounted.target.querySelector<HTMLElement>('.vega-status-badge');
		expect(badge?.dataset.statusKind).toBe('draft');
		expect(badge?.textContent?.trim()).toBe('Borrador · fecha sin efecto');
	});

	test('sin publishAtField, el mismo registro se ve «Borrador» como siempre', () => {
		mounted = mountWithStatus(null, { status: 'draft', publishAt: future });
		const badge = mounted.target.querySelector<HTMLElement>('.vega-status-badge');
		expect(badge?.dataset.status).toBe('draft');
		expect(badge?.dataset.statusKind).toBe('draft');
		expect(badge?.textContent?.trim()).toBe('Borrador');
	});
});
