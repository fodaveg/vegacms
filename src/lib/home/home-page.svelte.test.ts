/**
 * La portada (`/`) montada con un puerto de mentira, en cada estado de la lámina 1 del lote 12:
 * con lista, vacía, cargando, error con «Reintentar», sin permiso para crear, sitio sin
 * colecciones; más las tarjetas de pendientes y la limpieza de un registro borrado.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { Query } from '$lib/backend/query';
import type { Page, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import type { ContentModel } from '$lib/model/types';
import { field, model, type } from './fixture';
import { serializeRecentEdits, type RecentEdit } from './recent-edits';

import HomePage from '../../routes/+page.svelte';

const STORAGE_KEY = 'vega.recentEdits.v1::u1';

const POSTS = type('posts', {
	label: 'Entradas',
	labelSingular: 'Entrada',
	statusField: 'status',
	statusLabels: { draft: 'Borrador', published: 'Publicado' },
	social: { descriptionField: 'excerpt' },
	fields: [field('excerpt', { type: 'text' } as never)]
});
const PAGES = type('pages', { label: 'Páginas', labelSingular: 'Página' });
const SITE = type('site_info', { label: 'Sitio', labelSingular: 'Sitio', singleton: true });
const MEDIA = type('vega_media', {
	hidden: true,
	fields: [field('alt', { type: 'text' } as never)]
});

const SITE_MODEL = model([POSTS, PAGES, SITE, MEDIA]);

const DB: Record<string, VegaRecord[]> = {
	posts: [
		{ id: 'p1', type: 'posts', values: { title: 'Primera', status: 'draft' } },
		{ id: 'p2', type: 'posts', values: { title: '', status: 'published' } }
	],
	pages: [{ id: 'g1', type: 'pages', values: { title: 'Inicio' } }]
};

function page(items: VegaRecord[], totalItems = items.length): Page<VegaRecord> {
	return { items, page: 1, perPage: 30, totalItems, totalPages: totalItems === 0 ? 0 : 1 };
}

function isRecentQuery(query: Query | undefined): boolean {
	return query?.filter?.kind === 'cond' && query.filter.field === 'id';
}

type ListFn = (collection: string, query?: Query) => Promise<Page<VegaRecord>>;

/** `list` por defecto: la de recientes filtra `DB` por ids; las de pendientes cuentan `counts`. */
function defaultList(counts: Record<string, number> = {}): ListFn {
	return async (collection, query) => {
		if (isRecentQuery(query)) {
			const ids = (query!.filter as { value: string[] }).value;
			return page((DB[collection] ?? []).filter((record) => ids.includes(record.id)));
		}
		return page([], counts[collection] ?? 0);
	};
}

function seed(edits: RecentEdit[]): void {
	localStorage.setItem(STORAGE_KEY, serializeRecentEdits(edits));
}

let mounted: { target: HTMLElement; instance: Record<string, never> } | null = null;

function mountHome(opts: { model?: ContentModel; list?: ListFn; buildApiUrl?: string } = {}) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const list = vi.fn(opts.list ?? defaultList());
	const nav = { toNew: vi.fn(), toRecord: vi.fn(), toSettings: vi.fn() };
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}|${Object.values(params).join(',')}` : key,
		locale: 'es',
		model: opts.model ?? SITE_MODEL,
		session: { token: 't', user: { id: 'u1', email: 'a@b.c' }, expiresAt: null },
		port: {
			capabilities: {},
			buildApiUrl: opts.buildApiUrl ?? null,
			list,
			get: vi.fn(async () => {
				throw VegaError.notFound();
			})
		} as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn(), reportConnectivity: vi.fn() },
		nav
	} as unknown as VegaAppContext;
	const instance = mount(HomePage as never, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	}) as Record<string, never>;
	mounted = { target, instance };
	return { target, list, nav };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
	await tick();
}

function recentState(target: HTMLElement): string | null {
	return target.querySelector('[data-home-recent]')?.getAttribute('data-home-recent') ?? null;
}

function createButtons(target: HTMLElement): string[] {
	return [...target.querySelectorAll('[data-create-type]')].map(
		(button) => button.getAttribute('data-create-type') ?? ''
	);
}

function pendingKeys(target: HTMLElement): string[] {
	return [...target.querySelectorAll('[data-pending]')].map(
		(card) => card.getAttribute('data-pending') ?? ''
	);
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.restoreAllMocks();
});

describe('portada: lo último que editaste', () => {
	test('con lista: una fila por registro, la más reciente primero, cada una a su registro', async () => {
		seed([
			{ collection: 'pages', id: 'g1', savedAt: 300 },
			{ collection: 'posts', id: 'p1', savedAt: 200 },
			{ collection: 'posts', id: 'p2', savedAt: 100 }
		]);
		const { target, list, nav } = mountHome();
		await settle();

		expect(recentState(target)).toBe('ready');
		expect(target.querySelector('h1')?.textContent).toBe('home.title');
		const rows = [...target.querySelectorAll('tbody tr')];
		expect(rows.map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual([
			'/c/pages/g1',
			'/c/posts/p1',
			'/c/posts/p2'
		]);
		expect(rows.map((row) => row.querySelectorAll('td')[1]?.textContent?.trim())).toEqual([
			'Página',
			'Entrada',
			'Entrada'
		]);
		// Título vacío: «(sin título)», como en el listado.
		expect(rows[2]?.querySelector('a')?.textContent?.trim()).toBe('list.untitled');
		// Estado de ahora, leído del servidor; un tipo sin estado pinta la raya.
		expect(rows[1]?.querySelector('.vega-status-badge')?.textContent?.trim()).toBe('Borrador');
		expect(rows[0]?.querySelector('.vega-col-status')?.textContent?.trim()).toBe('—');
		// Cuatro columnas fijas, sin ordenación ni acción de fila.
		expect(target.querySelectorAll('thead th')).toHaveLength(4);
		expect(target.querySelector('tbody button')).toBeNull();
		// Una list por colección de la lista, no un get por registro.
		expect(list.mock.calls.filter(([, query]) => isRecentQuery(query))).toHaveLength(2);

		rows[1]
			?.querySelector('a')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		expect(nav.toRecord).toHaveBeenCalledWith('posts', 'p1');
	});

	test('1.1 sin nada editado: estado vacío sin botón y ninguna consulta de recientes', async () => {
		const { target, list } = mountHome();
		await settle();

		expect(recentState(target)).toBe('empty');
		expect(target.querySelector('[data-home-recent] h3')?.textContent).toBe(
			'home.recent.emptyTitle'
		);
		expect(target.querySelector('[data-home-recent] button')).toBeNull();
		expect(list.mock.calls.filter(([, query]) => isRecentQuery(query))).toHaveLength(0);
	});

	test('1.2 cargando: los accesos a crear no esperan a la lista', async () => {
		seed([{ collection: 'posts', id: 'p1', savedAt: 1 }]);
		const { target } = mountHome({ list: () => new Promise(() => {}) });
		await settle();

		expect(recentState(target)).toBe('loading');
		expect(createButtons(target)).toEqual(['posts', 'pages']);
	});

	test('1.3 error: la caja de error con Reintentar no tumba el resto, y reintentar carga', async () => {
		seed([{ collection: 'posts', id: 'p1', savedAt: 1 }]);
		let failing = true;
		const fallback = defaultList({ posts: 2 });
		const { target } = mountHome({
			list: async (collection, query) => {
				if (failing && isRecentQuery(query)) throw VegaError.network(null, 'Failed to fetch');
				return fallback(collection, query);
			}
		});
		await settle();

		expect(recentState(target)).toBe('error');
		const box = target.querySelector('[data-home-recent="error"]');
		expect(box?.getAttribute('role')).toBe('alert');
		expect(box?.textContent).toContain('home.recent.errorBody|Failed to fetch');
		expect(createButtons(target)).toEqual(['posts', 'pages']);
		expect(pendingKeys(target)).toContain('drafts:posts');

		failing = false;
		box?.querySelector('button')?.click();
		await settle();

		expect(recentState(target)).toBe('ready');
		expect(target.querySelectorAll('tbody tr')).toHaveLength(1);
	});

	test('un registro borrado se cae de la lista y del registro local', async () => {
		seed([
			{ collection: 'posts', id: 'borrado', savedAt: 200 },
			{ collection: 'posts', id: 'p1', savedAt: 100 }
		]);
		const { target } = mountHome();
		await settle();

		expect(
			[...target.querySelectorAll('tbody a')].map((link) => link.getAttribute('href'))
		).toEqual(['/c/posts/p1']);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([
			{ collection: 'posts', id: 'p1', savedAt: 100 }
		]);
	});

	test('si todo lo guardado ya no existe, queda el estado vacío', async () => {
		seed([{ collection: 'posts', id: 'borrado', savedAt: 1 }]);
		const { target } = mountHome();
		await settle();

		expect(recentState(target)).toBe('empty');
		expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
	});

	test('con un localStorage que lanza, la portada funciona (lista vacía)', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('SecurityError');
		});
		const { target } = mountHome();
		await settle();

		expect(recentState(target)).toBe('empty');
		expect(createButtons(target)).toEqual(['posts', 'pages']);
	});

	test('con una entrada corrupta en localStorage, lista vacía sin romper', async () => {
		localStorage.setItem(STORAGE_KEY, '{no es json');
		const { target } = mountHome();
		await settle();

		expect(recentState(target)).toBe('empty');
	});
});

describe('portada: accesos a crear', () => {
	test('un botón por tipo con permiso, en el orden del menú, sin singleton; lleva a crear', async () => {
		const { target, nav } = mountHome();
		await settle();

		expect(createButtons(target)).toEqual(['posts', 'pages']);
		const first = target.querySelector<HTMLButtonElement>('[data-create-type="posts"]');
		expect(first?.textContent?.trim()).toBe('Entrada');
		expect(first?.getAttribute('aria-label')).toBe('home.create.button|Entrada');
		first?.click();
		expect(nav.toNew).toHaveBeenCalledWith('posts');
	});

	test('1.4 sin permiso para crear en ningún tipo: el bloque no se pinta', async () => {
		const readOnly = model([
			type('posts', { permissions: { create: false } }),
			type('pages', { permissions: { create: false } })
		]);
		const { target } = mountHome({ model: readOnly });
		await settle();

		expect(createButtons(target)).toEqual([]);
		expect(target.querySelector('#vega-home-create-title')).toBeNull();
		expect(recentState(target)).toBe('empty');
	});

	test('1.5 con permiso solo en algunos, salen solo esos', async () => {
		const mixed = model([type('a'), type('b', { permissions: { create: false } }), type('c')]);
		const { target } = mountHome({ model: mixed });
		await settle();

		expect(createButtons(target)).toEqual(['a', 'c']);
	});

	test('1.6 sitio sin colecciones: el estado de siempre, sin portada ni consultas', async () => {
		const { target, list, nav } = mountHome({ model: model([]) });
		await settle();

		expect(target.querySelector('.vega-empty-nav h1')?.textContent).toBe('nav.emptyTitle');
		expect(target.querySelector('.vega-home')).toBeNull();
		expect(list).not.toHaveBeenCalled();
		target.querySelector<HTMLButtonElement>('.vega-empty-nav button')?.click();
		expect(nav.toSettings).toHaveBeenCalled();
	});
});

describe('portada: pendientes', () => {
	test('una tarjeta por dato que existe, con su número; a cero se pinta atenuada', async () => {
		const { target, list } = mountHome({ list: defaultList({ posts: 3 }) });
		await settle();

		expect(pendingKeys(target)).toEqual([
			'drafts:posts',
			'description:posts',
			'media-alt:vega_media'
		]);
		const drafts = target.querySelector('[data-pending="drafts:posts"]');
		expect(drafts?.tagName).toBe('A');
		expect(drafts?.getAttribute('href')).toBe('/c/posts?status=draft');
		expect(drafts?.querySelector('.vega-home-pending-value')?.textContent).toBe('3');
		expect(drafts?.getAttribute('data-zero')).toBe('false');
		const media = target.querySelector('[data-pending="media-alt:vega_media"]');
		expect(media?.tagName).toBe('DIV');
		expect(media?.querySelector('.vega-home-pending-value')?.textContent).toBe('0');
		expect(media?.getAttribute('data-zero')).toBe('true');
		// Una list de un registro por tarjeta.
		const counting = list.mock.calls.filter(([, query]) => !isRecentQuery(query));
		expect(counting).toHaveLength(3);
		expect(counting.every(([, query]) => query?.perPage === 1)).toBe(true);
	});

	test('si una tarjeta falla, las demás se pintan', async () => {
		const fallback = defaultList({ posts: 3 });
		const { target } = mountHome({
			list: async (collection, query) => {
				if (collection === 'vega_media') throw VegaError.backend('500');
				return fallback(collection, query);
			}
		});
		await settle();

		expect(pendingKeys(target)).toEqual(['drafts:posts', 'description:posts']);
	});

	test('sin ningún dato pendiente en el proyecto, el bloque no ocupa sitio', async () => {
		const { target } = mountHome({ model: model([type('tags')]) });
		await settle();

		expect(target.querySelector('#vega-home-pending-title')).toBeNull();
		expect(pendingKeys(target)).toEqual([]);
	});

	test('si fallan todas, el bloque desaparece', async () => {
		const { target } = mountHome({
			list: async () => {
				throw VegaError.network();
			}
		});
		await settle();

		expect(target.querySelector('#vega-home-pending-title')).toBeNull();
	});

	test('sin build anunciado no existe la tarjeta de cambios sin publicar', async () => {
		const { target } = mountHome();
		await settle();

		expect(target.querySelector('[data-pending="unpublished"]')).toBeNull();
	});
});
