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

function mountHome(
	opts: {
		model?: ContentModel;
		list?: ListFn;
		buildApiUrl?: string;
		/** `schemaBootstrap` = quien administra (criterio de `/settings`). Por defecto, sí. */
		capabilities?: { schemaBootstrap: boolean };
	} = {}
) {
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
			capabilities: opts.capabilities ?? { schemaBootstrap: true },
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
	vi.unstubAllGlobals();
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
		expect(target.querySelector('.vega-empty-nav p')?.textContent).toBe('nav.emptyBody');
		expect(target.querySelector('.vega-home')).toBeNull();
		expect(list).not.toHaveBeenCalled();
		target.querySelector<HTMLButtonElement>('.vega-empty-nav button')?.click();
		expect(nav.toSettings).toHaveBeenCalled();
	});

	test('1.6 sitio sin colecciones visto por quien edita: le toca hablar con quien administra', async () => {
		const { target, list } = mountHome({
			model: model([]),
			capabilities: { schemaBootstrap: false }
		});
		await settle();

		expect(target.querySelector('.vega-empty-nav h1')?.textContent).toBe('nav.emptyTitle');
		expect(target.querySelector('.vega-empty-nav p')?.textContent).toBe('nav.emptyBodyEditor');
		expect(target.querySelector('.vega-empty-nav button')).toBeNull();
		expect(target.querySelector('.vega-home')).toBeNull();
		expect(list).not.toHaveBeenCalled();
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

	test('mientras cuenta, la tarjeta ya está, con «…» y aria-busy', async () => {
		const { target } = mountHome({ list: () => new Promise(() => {}) });
		await settle();

		const drafts = target.querySelector('[data-pending="drafts:posts"]');
		expect(drafts?.querySelector('.vega-home-pending-value')?.textContent).toBe('…');
		expect(drafts?.getAttribute('aria-busy')).toBe('true');
		expect(drafts?.getAttribute('data-zero')).toBe('false');
	});
});

describe('portada: cambios sin publicar en el sitio', () => {
	const BUILD_URL = 'https://build.example/api/vega/build';
	/** Un tipo sin estado ni descripción, con fecha de última edición: solo da esta tarjeta. */
	const EDITED_MODEL = model([
		type('posts', {
			label: 'Entradas',
			labelSingular: 'Entrada',
			fields: [field('updated', { type: 'date', readonly: true } as never)]
		})
	]);

	/** `fetch` global de mentira para `GET {BUILD_URL}/status`. `body = null` → 500. */
	function stubBuildStatus(body: unknown | null): void {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: body !== null,
				status: body === null ? 500 : 200,
				json: async () => body
			}))
		);
	}

	/** `list` cuya última edición de `posts` es `updated` (o ninguna con `null`). */
	function lastEdited(updated: string | null): ListFn {
		return async () =>
			page(updated === null ? [] : [{ id: 'p1', type: 'posts', values: { updated } }]);
	}

	function unpublishedCard(target: HTMLElement) {
		return target.querySelector('[data-pending="unpublished"]');
	}

	test('con ediciones posteriores a la última publicación dice «Sí»', async () => {
		stubBuildStatus({ state: 'ok', lastPublishedAt: '2026-10-01T09:00:00.000Z' });
		const { target } = mountHome({
			model: EDITED_MODEL,
			buildApiUrl: BUILD_URL,
			list: lastEdited('2026-10-01 09:30:00.000Z')
		});
		await settle();

		const card = unpublishedCard(target);
		expect(card?.tagName).toBe('DIV');
		expect(card?.querySelector('.vega-home-pending-value')?.textContent).toBe(
			'home.pending.unpublishedYes'
		);
		expect(card?.querySelector('.vega-home-pending-label')?.textContent).toBe(
			'home.pending.unpublished'
		);
		expect(card?.getAttribute('data-zero')).toBe('false');
		expect(card?.getAttribute('aria-busy')).toBe('false');
	});

	test('sin nada que publicar dice «No» y se pinta atenuada', async () => {
		stubBuildStatus({ state: 'ok', lastPublishedAt: '2026-10-01T09:00:00.000Z' });
		const { target } = mountHome({
			model: EDITED_MODEL,
			buildApiUrl: BUILD_URL,
			list: lastEdited('2026-10-01 08:00:00.000Z')
		});
		await settle();

		const card = unpublishedCard(target);
		expect(card?.querySelector('.vega-home-pending-value')?.textContent).toBe(
			'home.pending.unpublishedNo'
		);
		expect(card?.getAttribute('data-zero')).toBe('true');
	});

	test('mientras lo calcula, la tarjeta está con «…»', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => {}))
		);
		const { target } = mountHome({ model: EDITED_MODEL, buildApiUrl: BUILD_URL });
		await settle();

		const card = unpublishedCard(target);
		expect(card?.querySelector('.vega-home-pending-value')?.textContent).toBe('…');
		expect(card?.getAttribute('aria-busy')).toBe('true');
	});

	test('si el estado del build falla, la tarjeta se retira (y con ella el bloque)', async () => {
		stubBuildStatus(null);
		const { target } = mountHome({ model: EDITED_MODEL, buildApiUrl: BUILD_URL });
		await settle();

		expect(unpublishedCard(target)).toBeNull();
		expect(target.querySelector('#vega-home-pending-title')).toBeNull();
	});

	test('si no se puede saber (ningún tipo con fecha de edición), no se pinta', async () => {
		stubBuildStatus({ state: 'ok', lastPublishedAt: null });
		const { target } = mountHome({ model: model([type('tags')]), buildApiUrl: BUILD_URL });
		await settle();

		expect(unpublishedCard(target)).toBeNull();
	});
});

describe('portada: tabla de lo último que editaste', () => {
	test('Cmd/Ctrl/Mayús o botón central: deja al navegador abrir el enlace, sin navegar aquí', async () => {
		seed([{ collection: 'posts', id: 'p1', savedAt: 1 }]);
		const { target, nav } = mountHome();
		await settle();

		// En `document` (lo último del burbujeo): anota si la tabla canceló el clic y lo cancela
		// después, para que jsdom no intente abrir el enlace (no sabe navegar).
		let preventedByTable: boolean | null = null;
		const observe = (event: Event) => {
			preventedByTable = event.defaultPrevented;
			event.preventDefault();
		};
		document.addEventListener('click', observe);
		try {
			const link = target.querySelector('tbody a');
			for (const init of [
				{ metaKey: true },
				{ ctrlKey: true },
				{ shiftKey: true },
				{ button: 1 }
			]) {
				preventedByTable = null;
				link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
				expect(preventedByTable).toBe(false);
			}
			expect(nav.toRecord).not.toHaveBeenCalled();

			link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
			expect(preventedByTable).toBe(true);
			expect(nav.toRecord).toHaveBeenCalledWith('posts', 'p1');
		} finally {
			document.removeEventListener('click', observe);
		}
	});

	test('un tipo sin campo título enseña el id del registro', async () => {
		const noTitle = type('notes', { label: 'Notas', labelSingular: 'Nota', titleField: null });
		seed([{ collection: 'notes', id: 'n1', savedAt: 1 }]);
		const { target } = mountHome({
			model: model([noTitle]),
			list: async (_collection, query) =>
				isRecentQuery(query) ? page([{ id: 'n1', type: 'notes', values: {} }]) : page([])
		});
		await settle();

		const link = target.querySelector('tbody a');
		expect(link?.textContent?.trim()).toBe('n1');
		expect(link?.getAttribute('href')).toBe('/c/notes/n1');
	});

	test('la hora del guardado: relativa en la celda y completa en su title', async () => {
		const savedAt = Date.parse('2026-10-01T08:00:00.000Z');
		seed([{ collection: 'posts', id: 'p1', savedAt }]);
		const { target } = mountHome();
		await settle();

		const cell = target.querySelector('tbody td.vega-cell-mono span');
		expect(cell?.textContent?.trim()).not.toBe('');
		expect(cell?.getAttribute('title')).toMatch(/2026/);
	});
});
