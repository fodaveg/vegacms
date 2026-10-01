/**
 * `/media` montada con un puerto de mentira: la página fuera de rango (`items: []` con
 * `totalItems > 0`, p. ej. tras borrar el último de la página) lleva a la última página con datos.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort, ContentType, Page, VegaRecord } from '$lib/backend';
import type { Query } from '$lib/backend/query';
import { buildMediaListQuery, MEDIA_SEARCH_DEBOUNCE_MS } from './media-query';

const goto = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ value: '' }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL(`http://localhost/media${search.value}`);
		}
	}
}));

import MediaPage from '../../routes/media/+page.svelte';

export function mediaType(mimeTypes: string[]): ContentType {
	return {
		name: 'vega_media',
		readonly: false,
		fields: [
			{
				name: 'file',
				type: 'file',
				required: true,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false,
				multiple: false,
				mimeTypes
			},
			{ name: 'alt', type: 'text' },
			{ name: 'title', type: 'text' },
			{ name: 'tags', type: 'json' },
			{ name: 'focal', type: 'json' }
		]
	} as unknown as ContentType;
}

function mediaRecord(id: string, file: string): VegaRecord {
	return { id, type: 'vega_media', values: { file, alt: '', title: '', tags: [] } } as VegaRecord;
}

type ListFn = (type: string, query: Query) => Promise<Page<VegaRecord>>;

let mounted: { target: HTMLElement; instance: Record<string, never> } | null = null;

function mountPage(list: ListFn, types: ContentType[] = [mediaType(['image/png'])]) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string) => key,
		locale: 'es',
		model: { types: [], revisions: { enabled: false } },
		port: {
			capabilities: { schemaBootstrap: false, thumbs: false },
			listContentTypes: vi.fn(async () => types),
			list: vi.fn(list),
			fileUrl: vi.fn(() => null)
		} as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		nav: { toSettings: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(MediaPage as never, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	}) as Record<string, never>;
	mounted = { target, instance };
	return { target, ctx };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
	await tick();
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	search.value = '';
	vi.clearAllMocks();
});

function listedPage(items: VegaRecord[], totalItems = items.length): Page<VegaRecord> {
	return { items, page: 1, perPage: 24, totalItems, totalPages: totalItems > 0 ? 1 : 0 };
}

describe('/media: buscador de servidor', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	function searchInput(target: HTMLElement): HTMLInputElement {
		return target.querySelector<HTMLInputElement>('.vega-media-search input')!;
	}

	function typeSearch(target: HTMLElement, value: string): void {
		const input = searchInput(target);
		input.value = value;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	test('escribir consulta al servidor (tras el debounce) con la query del selector, sobre toda la biblioteca', async () => {
		vi.useFakeTimers();
		const list = vi.fn<ListFn>(async () => listedPage([mediaRecord('a', 'a.png')]));
		const { target, ctx } = mountPage(list);
		await settle();
		expect(list).toHaveBeenCalledTimes(1);

		typeSearch(target, 'tomates');
		await vi.advanceTimersByTimeAsync(MEDIA_SEARCH_DEBOUNCE_MS - 1);
		expect(list).toHaveBeenCalledTimes(1); // aún no: debounce

		await vi.advanceTimersByTimeAsync(2);
		await settle();

		expect(list).toHaveBeenCalledTimes(2);
		expect(ctx.port.list).toHaveBeenLastCalledWith(
			'vega_media',
			buildMediaListQuery(1, { search: 'tomates' })
		);
	});

	test('sin coincidencias: dice que nada coincide (NO «biblioteca vacía») y «Limpiar filtros» recarga sin filtro', async () => {
		vi.useFakeTimers();
		const list = vi.fn<ListFn>(async (_type, query) =>
			query.filter ? listedPage([]) : listedPage([mediaRecord('a', 'a.png')])
		);
		const { target } = mountPage(list);
		await settle();

		typeSearch(target, 'zzz');
		await vi.advanceTimersByTimeAsync(MEDIA_SEARCH_DEBOUNCE_MS + 1);
		await settle();

		expect(target.querySelector('[data-media-grid-state="empty"]')).toBeNull();
		const empty = target.querySelector('[data-media-grid-state="empty-filter"]');
		expect(empty?.textContent).toContain('media.search.empty');

		empty!.querySelector('button')!.click();
		await settle();

		expect(list).toHaveBeenLastCalledWith('vega_media', buildMediaListQuery(1, { search: '' }));
		expect(target.querySelector('[data-media-grid-state="ready"]')).not.toBeNull();
	});

	test('el chip «Vídeo» solo aparece si el esquema de vega_media admite video/*', async () => {
		const without = mountPage(async () => listedPage([]), [mediaType(['image/png'])]);
		await settle();
		const chips = (el: HTMLElement) =>
			Array.from(el.querySelectorAll('.vega-media-type-chip')).map((c) => c.textContent?.trim());
		expect(chips(without.target)).not.toContain('media.filter.video');
		await unmount(mounted!.instance);
		mounted!.target.remove();

		const withVideo = mountPage(async () => listedPage([]), [mediaType(['image/png', 'video/*'])]);
		await settle();
		expect(chips(withVideo.target)).toContain('media.filter.video');
	});
});

describe('/media: página fuera de rango', () => {
	test('página vacía con total > 0: va a la última página con datos', async () => {
		search.value = '?page=4';
		mountPage(async (_type, query) => ({
			items: [],
			page: query.page ?? 1,
			perPage: 24,
			totalItems: 30,
			totalPages: 2
		}));
		await settle();

		expect(goto).toHaveBeenCalledTimes(1);
		expect(goto).toHaveBeenCalledWith('/media?page=2');
	});

	test('una biblioteca realmente vacía NO redirige', async () => {
		const { target } = mountPage(async () => ({
			items: [],
			page: 1,
			perPage: 24,
			totalItems: 0,
			totalPages: 0
		}));
		await settle();

		expect(goto).not.toHaveBeenCalled();
		expect(target.querySelector('[data-media-grid-state="empty"]')).not.toBeNull();
	});

	test('una página con datos NO redirige', async () => {
		mountPage(async () => ({
			items: [mediaRecord('a', 'a.png')],
			page: 1,
			perPage: 24,
			totalItems: 1,
			totalPages: 1
		}));
		await settle();

		expect(goto).not.toHaveBeenCalled();
	});
});
