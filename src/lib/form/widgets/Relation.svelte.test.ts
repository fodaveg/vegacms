/**
 * Guardarraíles del selector `relation` cuando el destino es `vega_media`.
 *
 * La medida principal es el texto visible, no el número de botones: un asset recién subido tiene
 * `title` y `alt` vacíos y debe reconocerse por su nombre de fichero. La suite también fija los
 * cuatro estados de carga, la paginación sin buscador, los ficheros no-imagen, los FileRef
 * irresolubles, los valores preexistentes y la invariancia del camino de relaciones normales.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Relation from './Relation.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { VegaError } from '$lib/backend/errors';
import type { BackendPort } from '$lib/backend/port';
import type { FieldInputValue, Page, RecordId, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import type { WidgetProps } from './types';
import { es } from '$lib/i18n/es';

const MEDIA_ID_A = 'media0000000001';
const MEDIA_ID_B = 'media0000000002';
const MEDIA_ID_PDF = 'media0000000003';

function t(key: string, params?: Record<string, string | number>): string {
	let text = (es as Record<string, string>)[key] ?? key;
	for (const [name, value] of Object.entries(params ?? {})) {
		text = text.replaceAll(`{${name}}`, String(value));
	}
	return text;
}

function relationField(
	target: string,
	{ name = 'image', multiple = false }: { name?: string; multiple?: boolean } = {}
): ResolvedField {
	return {
		schema: {
			name,
			type: 'relation',
			target,
			multiple,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		name,
		label: name === 'images' ? 'Imágenes' : 'Imagen',
		help: null,
		placeholder: null,
		hidden: false,
		group: null,
		widget: 'relation',
		subtype: null,
		listable: false
	};
}

function resolvedType(
	name: string,
	titleField: string | null,
	fields: ResolvedContentType['schema']['fields']
): ResolvedContentType {
	return {
		schema: { name, readonly: false, fields },
		name,
		label: name,
		labelSingular: name,
		icon: null,
		hidden: name === 'vega_media',
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField,
		subtitleField: null,
		slugField: null,
		statusField: null,
		statusLabels: null,
		orderField: null,
		defaultSort: null,
		previewUrl: null,
		fields: [],
		listFields: [],
		fieldGroups: [],
		editorRail: false
	};
}

const MEDIA_TYPE = resolvedType('vega_media', 'title', [
	{
		name: 'file',
		type: 'file',
		multiple: false,
		protected: false,
		required: true,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'alt',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false
	}
]);

const ARTICLES_TYPE = resolvedType('articles', 'title', [
	{
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false
	}
]);

const TAGS_TYPE = resolvedType('tags', null, []);

function mediaRecord(
	id: RecordId,
	file: string | null,
	{ title = '', alt = '' }: { title?: string; alt?: string } = {}
): VegaRecord {
	return {
		id,
		type: 'vega_media',
		values: { file, title, alt, tags: [], created: '2026-07-29T10:00:00.000Z' }
	};
}

function record(id: RecordId, type: string, values: VegaRecord['values']): VegaRecord {
	return { id, type, values };
}

function page(
	items: VegaRecord[],
	{
		current = 1,
		totalPages = 1,
		totalItems = items.length
	}: { current?: number; totalPages?: number; totalItems?: number } = {}
): Page<VegaRecord> {
	return { items, page: current, perPage: 20, totalPages, totalItems };
}

function fakeContext(options: {
	types: ResolvedContentType[];
	list?: BackendPort['list'];
	get?: BackendPort['get'];
	fileUrl?: BackendPort['fileUrl'];
}): VegaAppContext {
	return {
		port: {
			capabilities: {
				realtime: false,
				thumbs: true,
				schemaDiscovery: true,
				filePerRecord: true,
				protectedFiles: false
			},
			list: options.list ?? vi.fn(async () => page([])),
			get:
				options.get ??
				vi.fn(async (_type: string, id: RecordId) => {
					throw VegaError.notFound(id);
				}),
			fileUrl:
				options.fileUrl ??
				vi.fn((_record: Pick<VegaRecord, 'type' | 'id'>, _field, file) => {
					return `https://files.test/${file}`;
				})
		} as unknown as BackendPort,
		model: { types: options.types },
		t,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
}

type MountedRelation = {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	props: WidgetProps;
	ctx: VegaAppContext;
	onChange: ReturnType<typeof vi.fn>;
};

function mountRelation(options: {
	field: ResolvedField;
	types: ResolvedContentType[];
	value?: FieldInputValue;
	list?: BackendPort['list'];
	get?: BackendPort['get'];
	fileUrl?: BackendPort['fileUrl'];
}): MountedRelation {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const onChange = vi.fn();
	const props = $state<WidgetProps>({
		field: options.field,
		value: options.value ?? null,
		error: null,
		disabled: false,
		readonly: false,
		onChange
	});
	const ctx = fakeContext(options);
	const instance = mount(Relation, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, props, ctx, onChange };
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

function candidateButtons(target: HTMLElement): HTMLButtonElement[] {
	return Array.from(target.querySelectorAll<HTMLButtonElement>('.vega-relation-candidate'));
}

describe('Relation.svelte con destino vega_media', () => {
	let mounted: MountedRelation | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('assets recién subidos se reconocen por nombre y miniatura, nunca por su id', async () => {
		const list = vi.fn(async () =>
			page([mediaRecord(MEDIA_ID_A, 'playa_azul.jpg'), mediaRecord(MEDIA_ID_B, 'bosque_verde.png')])
		) as unknown as BackendPort['list'];
		const fileUrl = vi.fn(
			(record: Pick<VegaRecord, 'type' | 'id'>) => `https://thumbs.test/${record.id}`
		) as unknown as BackendPort['fileUrl'];

		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list,
			fileUrl
		});
		await settle();

		const buttons = candidateButtons(mounted.target);
		expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			'playa_azul.jpg',
			'bosque_verde.png'
		]);
		expect(mounted.target.textContent).not.toContain(MEDIA_ID_A);
		expect(mounted.target.textContent).not.toContain(MEDIA_ID_B);
		expect(
			Array.from(mounted.target.querySelectorAll<HTMLImageElement>('img')).map((img) => img.src)
		).toEqual([`https://thumbs.test/${MEDIA_ID_A}`, `https://thumbs.test/${MEDIA_ID_B}`]);
		expect(list).toHaveBeenCalledWith('vega_media', { page: 1, perPage: 20 });
		expect(mounted.target.querySelector('input[type="search"]')).toBeNull();
	});

	test('un título editorial manda sobre alt y nombre de fichero', async () => {
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list: vi.fn(async () =>
				page([
					mediaRecord(MEDIA_ID_A, 'original.jpg', {
						title: 'Portada publicada',
						alt: 'Una costa'
					})
				])
			) as unknown as BackendPort['list']
		});
		await settle();

		expect(candidateButtons(mounted.target)[0]?.textContent?.trim()).toBe('Portada publicada');
	});

	test('un PDF conserva la selección y se presenta con distintivo PDF, sin img roto', async () => {
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list: vi.fn(async () =>
				page([mediaRecord(MEDIA_ID_PDF, 'folleto.pdf')])
			) as unknown as BackendPort['list']
		});
		await settle();

		const button = candidateButtons(mounted.target)[0];
		expect(button?.textContent?.replace(/\s+/g, ' ').trim()).toBe('PDF folleto.pdf');
		expect(button?.querySelector('img')).toBeNull();
		expect(button?.querySelector('[data-media-type="document"]')?.textContent?.trim()).toBe('PDF');

		button?.click();
		expect(mounted.onChange).toHaveBeenCalledWith(MEDIA_ID_PDF);
	});

	test('un fileUrl que lanza degrada al distintivo sin tumbar ni vaciar la lista', async () => {
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list: vi.fn(async () =>
				page([mediaRecord(MEDIA_ID_A, 'archivo_perdido.jpg')])
			) as unknown as BackendPort['list'],
			fileUrl: vi.fn(() => {
				throw VegaError.notFound('fichero ausente');
			}) as unknown as BackendPort['fileUrl']
		});
		await settle();

		const button = candidateButtons(mounted.target)[0];
		expect(button?.textContent?.replace(/\s+/g, ' ').trim()).toBe('JPG archivo_perdido.jpg');
		expect(button?.querySelector('img')).toBeNull();
		expect(mounted.target.textContent).not.toContain(t('form.relation.media.empty'));
	});

	test('distingue cargando, listo vacío, listo con elementos y error', async () => {
		let resolveList!: (value: Page<VegaRecord>) => void;
		const pendingList = vi.fn(
			() =>
				new Promise<Page<VegaRecord>>((resolve) => {
					resolveList = resolve;
				})
		) as unknown as BackendPort['list'];
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list: pendingList
		});
		await tick();
		expect(mounted.target.textContent).toContain(t('form.relation.media.loading'));

		resolveList(page([mediaRecord(MEDIA_ID_A, 'lista.jpg')]));
		await settle();
		expect(mounted.target.textContent).toContain('lista.jpg');
		expect(mounted.target.textContent).not.toContain(t('form.relation.media.loading'));

		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list: vi.fn(async () => page([])) as unknown as BackendPort['list']
		});
		await settle();
		expect(mounted.target.textContent).toContain(t('form.relation.media.empty'));

		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list: vi.fn(async () => {
				throw VegaError.forbidden('sin listRule');
			}) as unknown as BackendPort['list']
		});
		await settle();
		expect(mounted.target.textContent).toContain(t('form.relation.media.error'));
		expect(mounted.target.textContent).not.toContain(t('form.relation.media.empty'));
		expect(mounted.target.querySelector('[role="alert"]')).not.toBeNull();
	});

	test('pagina sin buscador y conserva la selección al ir y volver', async () => {
		const list = vi.fn(async (_type: string, query) => {
			const current = query?.page ?? 1;
			return current === 1
				? page([mediaRecord(MEDIA_ID_A, 'primera.jpg')], {
						current: 1,
						totalPages: 2,
						totalItems: 2
					})
				: page([mediaRecord(MEDIA_ID_B, 'segunda.jpg')], {
						current: 2,
						totalPages: 2,
						totalItems: 2
					});
		}) as unknown as BackendPort['list'];
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			list
		});
		await settle();

		candidateButtons(mounted.target)[0]?.click();
		expect(mounted.onChange).toHaveBeenLastCalledWith(MEDIA_ID_A);
		mounted.props.value = MEDIA_ID_A;
		await tick();

		mounted.target
			.querySelector<HTMLButtonElement>(`button[aria-label="${t('list.pagination.next')}"]`)
			?.click();
		await settle();
		expect(mounted.target.textContent).toContain('segunda.jpg');
		expect(list).toHaveBeenLastCalledWith('vega_media', { page: 2, perPage: 20 });

		mounted.target
			.querySelector<HTMLButtonElement>(`button[aria-label="${t('list.pagination.prev')}"]`)
			?.click();
		await settle();
		expect(mounted.target.textContent).toContain('primera.jpg');
		expect(candidateButtons(mounted.target)[0]?.getAttribute('aria-pressed')).toBe('true');
	});

	test('un valor media preexistente se resuelve a nombre y no emite onChange durante la carga', async () => {
		const get = vi.fn(async () =>
			mediaRecord(MEDIA_ID_A, 'ya_guardada.webp')
		) as unknown as BackendPort['get'];
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			value: MEDIA_ID_A,
			list: vi.fn(async () => page([])) as unknown as BackendPort['list'],
			get
		});
		await settle();

		expect(mounted.target.querySelector('.vega-relation-chip')?.textContent).toContain(
			'ya_guardada.webp'
		);
		expect(mounted.target.querySelector('.vega-relation-chip')?.textContent).not.toContain(
			MEDIA_ID_A
		);
		expect(mounted.onChange).not.toHaveBeenCalled();
	});

	test('un id guardado cuyo registro se borró se conserva hasta una acción explícita', async () => {
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [MEDIA_TYPE],
			value: MEDIA_ID_A,
			list: vi.fn(async () => page([])) as unknown as BackendPort['list'],
			get: vi.fn(async () => {
				throw VegaError.notFound('borrado');
			}) as unknown as BackendPort['get']
		});
		await settle();

		const chip = mounted.target.querySelector('.vega-relation-chip');
		expect(chip?.textContent).toContain(MEDIA_ID_A);
		expect(chip?.textContent).toContain(t('form.relation.notFound'));
		expect(mounted.onChange).not.toHaveBeenCalled();
	});

	test('images mantiene el orden de selección y permite quitar explícitamente', async () => {
		mounted = mountRelation({
			field: relationField('vega_media', { name: 'images', multiple: true }),
			types: [MEDIA_TYPE],
			value: [],
			list: vi.fn(async () =>
				page([mediaRecord(MEDIA_ID_A, 'uno.jpg'), mediaRecord(MEDIA_ID_B, 'dos.jpg')])
			) as unknown as BackendPort['list']
		});
		await settle();

		candidateButtons(mounted.target)[0]?.click();
		expect(mounted.onChange).toHaveBeenLastCalledWith([MEDIA_ID_A]);
		mounted.props.value = [MEDIA_ID_A];
		await tick();

		candidateButtons(mounted.target)[1]?.click();
		expect(mounted.onChange).toHaveBeenLastCalledWith([MEDIA_ID_A, MEDIA_ID_B]);
		mounted.props.value = [MEDIA_ID_A, MEDIA_ID_B];
		await settle();

		const removeButtons =
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-relation-remove');
		removeButtons[0]?.click();
		expect(mounted.onChange).toHaveBeenLastCalledWith([MEDIA_ID_B]);
	});

	test('destino media no resuelto explica el modelo desactualizado, no finge vacío', async () => {
		const list = vi.fn() as unknown as BackendPort['list'];
		mounted = mountRelation({
			field: relationField('vega_media'),
			types: [],
			list
		});
		await tick();

		expect(mounted.target.textContent).toContain(t('form.relation.media.targetMissing'));
		expect(mounted.target.textContent).not.toContain(t('form.relation.media.empty'));
		expect(mounted.target.textContent).not.toContain(t('form.relation.degradedNote'));
		expect(list).not.toHaveBeenCalled();
	});
});

describe('Relation.svelte con destinos normales', () => {
	let mounted: MountedRelation | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('con titleField conserva el buscador, su query y el título visible', async () => {
		const list = vi.fn(async () =>
			page([record('article0000001', 'articles', { title: 'Artículo legible' })])
		) as unknown as BackendPort['list'];
		mounted = mountRelation({
			field: relationField('articles'),
			types: [ARTICLES_TYPE],
			list
		});

		const input = mounted.target.querySelector<HTMLInputElement>('input[type="search"]');
		expect(input).not.toBeNull();
		input!.value = 'legible';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 275));
		await tick();

		expect(list).toHaveBeenCalledWith('articles', {
			filter: { kind: 'cond', field: 'title', op: 'contains', value: 'legible' },
			perPage: 20
		});
		expect(candidateButtons(mounted.target)[0]?.textContent).toBe('Artículo legible');
	});

	test('sin titleField conserva el modo degradado genérico por id', async () => {
		const id = 'tag00000000001';
		mounted = mountRelation({
			field: relationField('tags'),
			types: [TAGS_TYPE],
			list: vi.fn(async () =>
				page([record(id, 'tags', { name: 'No se usa' })])
			) as unknown as BackendPort['list']
		});
		await settle();

		expect(mounted.target.textContent).toContain(t('form.relation.degradedNote'));
		expect(candidateButtons(mounted.target)[0]?.textContent).toBe(id);
		expect(mounted.target.querySelector('input[type="search"]')).toBeNull();
	});

	test('destino normal no resuelto conserva el mensaje genérico exacto', async () => {
		mounted = mountRelation({
			field: relationField('coleccion_ausente'),
			types: []
		});
		await tick();

		expect(mounted.target.textContent).toContain(t('form.relation.degradedNote'));
		expect(mounted.target.textContent).toContain(t('form.relation.noResults'));
		expect(mounted.target.textContent).not.toContain(t('form.relation.media.targetMissing'));
	});
});
