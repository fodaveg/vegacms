import { describe, expect, test, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import { validateQuery } from '$lib/backend/query';
import { loadPendingCount, loadUnpublishedChanges, pendingCards } from './pending';
import { creatableTypes, navContentTypes } from './home-types';
import { field, model, type } from './fixture';

const NOW = Date.parse('2026-10-01T10:00:00.000Z');

const PUBLISH_AT = field('publish_at', { type: 'date' } as never);
const EXCERPT = field('excerpt', { type: 'text' } as never);
const DESCRIPTION = field('description', { type: 'text' } as never);

const MEDIA = type('vega_media', {
	hidden: true,
	fields: [field('alt', { type: 'text' } as never)]
});

function keys(cards: ReturnType<typeof pendingCards>): string[] {
	return cards.map((card) => card.key);
}

describe('pendingCards: qué tarjetas existen según el modelo', () => {
	test('un proyecto sin estado, sin descripción y sin medios no tiene ninguna', () => {
		expect(pendingCards(model([type('tags'), type('authors')]), NOW)).toEqual([]);
	});

	test('borradores: una por tipo con statusField, enlazada al listado ya filtrado', () => {
		const cards = pendingCards(
			model([type('posts', { statusField: 'status' }), type('tags')]),
			NOW
		);

		expect(cards).toHaveLength(1);
		expect(cards[0]).toMatchObject({
			key: 'drafts:posts',
			kind: 'drafts',
			collection: 'posts',
			typeLabel: 'postss',
			href: '/c/posts?status=draft',
			query: {
				filter: { kind: 'cond', field: 'status', op: 'eq', value: 'draft' },
				page: 1,
				perPage: 1
			}
		});
	});

	test('programadas: solo con publishAtField Y con el servidor publicando solo; no enlaza', () => {
		const posts = type('posts', {
			statusField: 'status',
			publishAtField: 'publish_at',
			fields: [PUBLISH_AT]
		});

		expect(keys(pendingCards(model([posts]), NOW))).toEqual(['drafts:posts']);
		expect(keys(pendingCards(model([posts], { scheduledPublishing: 'inactive' }), NOW))).toEqual([
			'drafts:posts'
		]);
		expect(keys(pendingCards(model([posts], { scheduledPublishing: 'unknown' }), NOW))).toEqual([
			'drafts:posts'
		]);

		const cards = pendingCards(model([posts], { scheduledPublishing: 'active' }), NOW);
		expect(keys(cards)).toEqual(['drafts:posts', 'scheduled:posts']);
		expect(cards[1]).toMatchObject({
			href: null,
			query: {
				filter: {
					kind: 'group',
					combinator: 'and',
					nodes: [
						{ kind: 'cond', field: 'status', op: 'eq', value: 'draft' },
						{ kind: 'cond', field: 'publish_at', op: 'gt', value: '2026-10-01 10:00:00.000Z' }
					]
				},
				perPage: 1
			}
		});
	});

	test('sin descripción: el campo de la tarjeta social, o uno llamado description', () => {
		const posts = type('posts', { social: { descriptionField: 'excerpt' }, fields: [EXCERPT] });
		const pages = type('pages', { fields: [DESCRIPTION] });
		const cards = pendingCards(model([posts, pages, type('tags')]), NOW);

		expect(keys(cards)).toEqual(['description:posts', 'description:pages']);
		expect(cards[0]).toMatchObject({
			href: null,
			query: { filter: { kind: 'cond', field: 'excerpt', op: 'empty', value: null } }
		});
		expect(cards[1]?.query.filter).toMatchObject({ field: 'description', op: 'empty' });
	});

	test('un description que no admite el filtro «vacío» (json) no da tarjeta', () => {
		const pages = type('pages', { fields: [field('description', { type: 'json' } as never)] });
		expect(pendingCards(model([pages]), NOW)).toEqual([]);
	});

	test('medios sin texto alternativo: solo si existe vega_media con alt y se puede listar', () => {
		expect(keys(pendingCards(model([type('tags'), MEDIA]), NOW))).toEqual(['media-alt:vega_media']);
		const noAlt = type('vega_media', { hidden: true });
		expect(pendingCards(model([type('tags'), noAlt]), NOW)).toEqual([]);
		const denied = type('vega_media', {
			hidden: true,
			permissions: { list: false },
			fields: [field('alt', { type: 'text' } as never)]
		});
		expect(pendingCards(model([type('tags'), denied]), NOW)).toEqual([]);
	});

	test('quedan fuera los singleton, los ocultos y los que no se pueden listar', () => {
		const cards = pendingCards(
			model([
				type('site_info', { statusField: 'status', singleton: true }),
				type('internal', { statusField: 'status', hidden: true }),
				type('denied', { statusField: 'status', permissions: { list: false } })
			]),
			NOW
		);
		expect(cards).toEqual([]);
	});

	test('orden: borradores, programadas, sin descripción (cada grupo como el menú) y medios', () => {
		const posts = type('posts', {
			statusField: 'status',
			publishAtField: 'publish_at',
			fields: [PUBLISH_AT, DESCRIPTION]
		});
		const pages = type('pages', { statusField: 'status', fields: [DESCRIPTION] });
		const cards = pendingCards(
			model([posts, pages, MEDIA], { scheduledPublishing: 'active' }),
			NOW
		);

		expect(keys(cards)).toEqual([
			'drafts:posts',
			'drafts:pages',
			'scheduled:posts',
			'description:posts',
			'description:pages',
			'media-alt:vega_media'
		]);
	});

	test('toda consulta generada es válida contra el esquema de su tipo', () => {
		const posts = type('posts', {
			statusField: 'status',
			publishAtField: 'publish_at',
			fields: [PUBLISH_AT, DESCRIPTION]
		});
		const all = model([posts, MEDIA], { scheduledPublishing: 'active' });

		const cards = pendingCards(all, NOW);
		expect(cards).toHaveLength(4);
		for (const card of cards) {
			const schema = all.types.find((item) => item.name === card.collection)!.schema;
			expect(() => validateQuery(schema.fields, card.query)).not.toThrow();
		}
	});
});

describe('loadPendingCount', () => {
	test('una sola list de un registro; el número es totalItems', async () => {
		const [card] = pendingCards(model([type('posts', { statusField: 'status' })]), NOW);
		const list = vi.fn(async () => ({
			items: [],
			page: 1,
			perPage: 1,
			totalItems: 7,
			totalPages: 7
		}));

		await expect(loadPendingCount({ list }, card!)).resolves.toBe(7);
		expect(list).toHaveBeenCalledTimes(1);
		expect(list).toHaveBeenCalledWith('posts', expect.objectContaining({ perPage: 1 }));
	});
});

describe('loadUnpublishedChanges', () => {
	test('sin build anunciado no consulta nada', async () => {
		const fetcher = vi.fn();
		const port = { buildApiUrl: null, list: vi.fn() } as unknown as BackendPort;

		await expect(loadUnpublishedChanges(port, model([]), 't', fetcher)).resolves.toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
		expect(port.list).not.toHaveBeenCalled();
	});

	/** Tipo con fecha de última edición legible (`updated`, autodate de PocketBase). */
	const EDITED = type('posts', {
		fields: [field('updated', { type: 'date', readonly: true } as never)]
	});
	const BUILD_URL = 'https://build.example/api/vega/build';

	/** `fetch` de mentira para `GET {BUILD_URL}/status`. */
	function statusFetcher(body: unknown, status = 200) {
		return vi.fn(
			async () =>
				new Response(JSON.stringify(body), {
					status,
					headers: { 'Content-Type': 'application/json' }
				})
		);
	}

	/** Puerto cuya última edición de `posts` es `updated` (o ninguna, con `null`). */
	function editedPort(updated: string | null) {
		return {
			buildApiUrl: BUILD_URL,
			list: vi.fn(async () => ({
				items: updated === null ? [] : [{ id: 'p1', type: 'posts', values: { updated } }],
				page: 1,
				perPage: 1,
				totalItems: updated === null ? 0 : 1,
				totalPages: updated === null ? 0 : 1
			}))
		} as unknown as BackendPort;
	}

	test('una edición posterior a la última publicación: true, con el token de la sesión', async () => {
		const fetcher = statusFetcher({ state: 'ok', lastPublishedAt: '2026-10-01T09:00:00.000Z' });
		const port = editedPort('2026-10-01 09:30:00.000Z');

		await expect(loadUnpublishedChanges(port, model([EDITED]), 'tok', fetcher)).resolves.toBe(true);
		expect(fetcher).toHaveBeenCalledWith(
			`${BUILD_URL}/status`,
			expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'tok' }) })
		);
	});

	test('nada editado desde la última publicación: false', async () => {
		const fetcher = statusFetcher({ state: 'ok', lastPublishedAt: '2026-10-01T09:00:00.000Z' });
		const port = editedPort('2026-10-01 08:00:00.000Z');

		await expect(loadUnpublishedChanges(port, model([EDITED]), 't', fetcher)).resolves.toBe(false);
	});

	test('ningún tipo con fecha de edición legible: null («no lo sé»), no un false', async () => {
		const fetcher = statusFetcher({ state: 'ok', lastPublishedAt: null });
		const port = editedPort(null);

		await expect(
			loadUnpublishedChanges(port, model([type('tags')]), 't', fetcher)
		).resolves.toBeNull();
		expect(port.list).not.toHaveBeenCalled();
	});

	test('el estado del build no se puede leer: rechaza (la tarjeta se retira)', async () => {
		const port = editedPort('2026-10-01 09:30:00.000Z');

		await expect(
			loadUnpublishedChanges(port, model([EDITED]), 't', statusFetcher({}, 500))
		).rejects.toThrow();
		await expect(
			loadUnpublishedChanges(port, model([EDITED]), 't', statusFetcher({ state: 'raro' }))
		).rejects.toThrow();
		expect(port.list).not.toHaveBeenCalled();
	});
});

describe('tipos de la portada', () => {
	test('en el orden del menú; crear solo donde hay permiso y nunca un singleton', () => {
		const all = model([
			type('posts'),
			type('site_info', { singleton: true }),
			type('metrics', { permissions: { list: true, view: true, create: false } }),
			type('pages'),
			type('internal', { hidden: true })
		]);

		expect(navContentTypes(all).map((item) => item.name)).toEqual([
			'posts',
			'site_info',
			'metrics',
			'pages'
		]);
		expect(creatableTypes(all).map((item) => item.name)).toEqual(['posts', 'pages']);
	});
});
