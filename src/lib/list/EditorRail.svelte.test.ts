/**
 * Suite de `EditorRail.svelte` (lote 9 del audit del 30 sep 2026, «menos peticiones»): el raíl
 * incluye SIEMPRE el registro abierto (aunque caiga fuera de la página cargada) y, tras guardar,
 * actualiza en sitio la fila afectada en vez de pedir la lista entera. Mide las peticiones al
 * puerto falso (`list`/`get`). Montaje real con props reactivas, mismo patrón que
 * `PreviewPanel.svelte.test.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import EditorRail from './EditorRail.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { VegaError } from '$lib/backend/errors';
import type { ContentType, Field, Page, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';

const titleSchema: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};
const titleField: ResolvedField = {
	schema: titleSchema,
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

function makeType(over: Partial<ResolvedContentType> = {}): ResolvedContentType {
	const schema: ContentType = { name: 'posts', readonly: false, fields: [titleSchema] };
	return {
		schema,
		name: 'posts',
		label: 'Entradas',
		labelSingular: 'Entrada',
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
		fields: [titleField],
		listFields: ['title'],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: true,
		page: null,
		...over
	} as ResolvedContentType;
}

function rec(id: string, title: string): VegaRecord {
	return { id, type: 'posts', values: { title } };
}

function pageOf(items: VegaRecord[], totalItems = items.length): Page<VegaRecord> {
	return { items, page: 1, perPage: 30, totalItems, totalPages: 1 };
}

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

function setup(opts: {
	list: VegaRecord[];
	totalItems?: number;
	outside?: VegaRecord[];
	activeId: string | null;
	type?: ResolvedContentType;
	/** Sustituye la respuesta del `list` (p. ej. una promesa que el test resuelve a mano). */
	listImpl?: () => Promise<Page<VegaRecord>>;
}) {
	const listFn = vi.fn(opts.listImpl ?? (async () => pageOf(opts.list, opts.totalItems)));
	const getFn = vi.fn(async (_type: string, id: string) => {
		const hit = (opts.outside ?? []).find((r) => r.id === id);
		if (!hit) throw VegaError.notFound();
		return hit;
	});
	const ctx = {
		port: { list: listFn, get: getFn },
		feedback: { reportError: vi.fn() },
		t: (key: string) => key,
		locale: 'es',
		model: { scheduledPublishing: 'unknown' }
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state<{
		contentType: ResolvedContentType;
		activeId: string | null;
		savedRecord: VegaRecord | null;
	}>({ contentType: opts.type ?? makeType(), activeId: opts.activeId, savedRecord: null });
	const instance = mount(EditorRail, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	const titles = () =>
		[...target.querySelectorAll('.vega-rail-title')].map((el) => el.textContent?.trim());
	return { target, instance, props, listFn, getFn, titles };
}

describe('EditorRail.svelte — peticiones', () => {
	let mounted: ReturnType<typeof setup> | null = null;
	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('guardar actualiza la fila EN SITIO: cero peticiones nuevas', async () => {
		mounted = setup({ list: [rec('a', 'Uno'), rec('b', 'Dos')], activeId: 'a' });
		await flush();
		expect(mounted.listFn).toHaveBeenCalledTimes(1);

		mounted.props.savedRecord = rec('a', 'Uno renombrado');
		await flush();

		expect(mounted.titles()).toEqual(['Uno renombrado', 'Dos']);
		expect(mounted.listFn).toHaveBeenCalledTimes(1);
		expect(mounted.getFn).not.toHaveBeenCalled();
	});

	test('el registro abierto fuera de la página cargada se incluye (1 `get`) y se actualiza en sitio', async () => {
		mounted = setup({
			list: [rec('a', 'Uno')],
			totalItems: 80,
			outside: [rec('z', 'Antiguo')],
			activeId: 'z'
		});
		await flush();
		expect(mounted.titles()).toEqual(['Uno', 'Antiguo']);
		expect(
			mounted.target.querySelector('[aria-current="true"] .vega-rail-title')?.textContent
		).toBe('Antiguo');
		expect(mounted.getFn).toHaveBeenCalledTimes(1);

		mounted.props.savedRecord = rec('z', 'Antiguo editado');
		await flush();
		expect(mounted.titles()).toEqual(['Uno', 'Antiguo editado']);
		expect(mounted.listFn).toHaveBeenCalledTimes(1);
		expect(mounted.getFn).toHaveBeenCalledTimes(1);
	});

	test('un registro abierto que ya no existe (borrado) no rompe el raíl ni se pinta', async () => {
		mounted = setup({ list: [rec('a', 'Uno')], totalItems: 80, outside: [], activeId: 'gone' });
		await flush();
		expect(mounted.titles()).toEqual(['Uno']);
		expect(mounted.target.querySelector('.vega-rail')).not.toBeNull();
	});

	test('en creación (`activeId` null) un guardado no pide nada ni inventa filas', async () => {
		mounted = setup({ list: [rec('a', 'Uno')], activeId: null });
		await flush();
		mounted.props.savedRecord = rec('nuevo', 'Recién creado');
		await flush();
		expect(mounted.titles()).toEqual(['Uno']);
		expect(mounted.listFn).toHaveBeenCalledTimes(1);
	});

	test('si el guardado cambia el campo de orden editable, la posición puede haber cambiado: relee', async () => {
		const type = makeType({ orderField: 'sort' });
		mounted = setup({
			list: [
				{ id: 'a', type: 'posts', values: { title: 'Uno', sort: 1 } },
				{ id: 'b', type: 'posts', values: { title: 'Dos', sort: 2 } }
			],
			activeId: 'a',
			type
		});
		await flush();
		mounted.props.savedRecord = { id: 'a', type: 'posts', values: { title: 'Uno', sort: 5 } };
		await flush();
		expect(mounted.listFn).toHaveBeenCalledTimes(2);
		// La relectura conserva las filas visibles: nunca vuelve a «Cargando…».
		expect(mounted.target.querySelector('.vega-rail-loading')).toBeNull();
	});

	test('un guardado que llega con la carga en vuelo se aplica al terminar, aunque la respuesta sea anterior', async () => {
		let resolveList!: (page: Page<VegaRecord>) => void;
		mounted = setup({
			list: [],
			activeId: 'a',
			listImpl: () => new Promise((resolve) => (resolveList = resolve))
		});
		await flush();
		expect(mounted.target.querySelector('.vega-rail-loading')).not.toBeNull();

		mounted.props.savedRecord = rec('a', 'Uno nuevo');
		await flush();
		resolveList(pageOf([rec('a', 'Uno viejo'), rec('b', 'Dos')]));
		await flush();

		expect(mounted.titles()).toEqual(['Uno nuevo', 'Dos']);
		expect(mounted.listFn).toHaveBeenCalledTimes(1);
	});

	test.each([true, false])(
		'la relectura ready integra otros registros sin pisar el guardado posterior (abierto en página: %s)',
		async (included) => {
			let resolveList!: (page: Page<VegaRecord>) => void;
			const initial = { ...rec('a', 'Inicial'), values: { title: 'Inicial', sort: 1 } };
			mounted = setup({
				list: [initial, rec('b', 'Otro inicial')],
				activeId: 'a',
				type: makeType({ orderField: 'sort' })
			});
			await flush();
			mounted.listFn.mockImplementationOnce(
				() => new Promise((resolve) => (resolveList = resolve))
			);
			mounted.props.savedRecord = { ...initial, values: { title: 'Reordenado', sort: 5 } };
			await flush();
			expect(mounted.target.querySelector('.vega-rail-loading')).toBeNull();
			// Mientras la lista sigue visible, dos guardados sin reordenar: el último prevalece.
			mounted.props.savedRecord = { ...initial, values: { title: 'Intermedio', sort: 5 } };
			await flush();
			mounted.props.savedRecord = { ...initial, values: { title: 'Último guardado', sort: 5 } };
			await flush();
			resolveList(
				pageOf(
					[
						rec('b', 'Otro actualizado'),
						...(included ? [{ ...initial, values: { title: 'Reordenado', sort: 5 } }] : [])
					],
					2
				)
			);
			await flush();
			expect(mounted.titles()).toEqual(['Otro actualizado', 'Último guardado']);
			expect(
				mounted.target.querySelector('[aria-current="true"] .vega-rail-title')?.textContent
			).toBe('Último guardado');
			expect(mounted.listFn).toHaveBeenCalledTimes(2);
			expect(mounted.getFn).not.toHaveBeenCalled();
		}
	);
});
