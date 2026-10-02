import { describe, expect, test } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import type { Query } from '$lib/backend/query';
import type { VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { loadReviewData, pagePathColumns } from './load-review-data';
import { reviewRecord } from './publish-review';
import { createBlock, createMedia, createPage, seededWorld } from './review-world.fixture';

type ListFn = BackendPort['list'];

/** El mismo puerto con `list` interceptado: `spy` ve cada llamada y `override` puede responder o lanzar. */
function intercept(
	world: Awaited<ReturnType<typeof seededWorld>>,
	override: (collection: string, query: Query | undefined) => ReturnType<ListFn> | undefined
) {
	const calls: Array<{ collection: string; query: Query | undefined }> = [];
	const list: ListFn = (collection, query) => {
		calls.push({ collection, query });
		return override(collection, query) ?? world.port.list(collection, query);
	};
	return { port: { list } as Pick<BackendPort, 'list'>, calls };
}

describe('loadReviewData contra el adaptador en memoria y el sembrado real', () => {
	test('lee bloques en orden, páginas con su estado, redirecciones y las fichas de medios citadas', async () => {
		const world = await seededWorld();
		const gato = await createMedia(world, 'gato.jpg', '');
		const perro = await createMedia(world, 'perro.jpg', 'Un perro');
		await createMedia(world, 'otra.jpg', ''); // no la cita nadie: no debe cargarse
		const home = await createPage(world, { title: 'Inicio', path: '/inicio' });
		await createPage(world, { title: 'Pronto', path: '/pronto', status: 'draft' });
		await world.port.create('redirects', { from: '/vieja', to: '/inicio', code: '301' });
		const second = await createBlock(world, home.id, 2, 'gallery', {}, { images: [gato.id] });
		const first = await createBlock(world, home.id, 1, 'image', {}, { image: perro.id });

		const spy = intercept(world, () => undefined);
		const data = await loadReviewData(spy.port, world.model, world.pagesType, home);

		expect(data.blocks.map((b) => b.id)).toEqual([first.id, second.id]);
		expect(data.pages).toEqual(
			expect.arrayContaining([
				{ type: 'pages', id: home.id, path: '/inicio', published: true },
				expect.objectContaining({ path: '/pronto', published: false }),
				// el que siembra el sitio: «Inicio» en `/` y en borrador
				expect.objectContaining({ path: '/', published: false })
			])
		);
		expect(data.pages).toHaveLength(3);
		expect(data.redirects).toEqual([{ from: '/vieja', to: '/inicio' }]);
		expect([...data.media!.keys()].sort()).toEqual([gato.id, perro.id].sort());
		expect(data.media!.get(gato.id)).toMatchObject({
			alt: '',
			fileName: expect.stringMatching(/gato\.jpg$/)
		});

		// Proyección: no se traen más columnas de las que hacen falta.
		const projected = Object.fromEntries(spy.calls.map((c) => [c.collection, c.query?.fields]));
		expect(projected.pages).toEqual(['path', 'status']);
		expect(projected.redirects).toEqual(['from', 'to']);
		expect(projected.vega_media).toEqual(['file', 'alt']);
	});

	test('de punta a punta: lo cargado alimenta a `reviewRecord` y salen los avisos esperados', async () => {
		const world = await seededWorld();
		const sinAlt = await createMedia(world, 'gato.jpg', '');
		const home = await createPage(world, { title: 'Inicio', path: '/inicio', description: '' });
		await createPage(world, { title: 'Pronto', path: '/pronto', status: 'draft' });
		await world.port.create('redirects', { from: '/vieja', to: '/borrada', code: '301' });
		await createBlock(world, home.id, 1, 'richtext', {
			body: '<a href="/pronto">a</a><a href="/vieja">b</a><a href="/inicio#x">c</a>'
		});
		await createBlock(world, home.id, 2, 'image', {}, { image: sinAlt.id });

		const data = await loadReviewData(world.port, world.model, world.pagesType, home);
		const result = reviewRecord({
			type: world.pagesType,
			record: home,
			model: world.model,
			...data
		});
		expect(result.skipped).toEqual([]);
		expect(result.findings.map((f) => f.check)).toEqual([
			'seo.description-empty',
			'seo.social-image-missing',
			'link.draft-target',
			'link.broken',
			'media.alt-missing'
		]);
	});

	test('pagina más de 200 páginas', async () => {
		const world = await seededWorld();
		for (let i = 0; i < 205; i += 1) await createPage(world, { path: `/p${i}` });
		const home = await createPage(world, { path: '/inicio' });
		const data = await loadReviewData(world.port, world.model, world.pagesType, home);
		expect(data.pages).toHaveLength(207); // 205 + inicio + el de sembrado
	});

	test('una colección más grande que el tope de páginas leídas da null (no comprobado), no un listado cortado', async () => {
		const world = await seededWorld();
		const home = await createPage(world, { path: '/inicio' });
		let pagesCalls = 0;
		const spy = intercept(world, (collection, query) => {
			if (collection !== 'pages') return undefined;
			pagesCalls += 1;
			return Promise.resolve({
				items: [],
				page: query?.page ?? 1,
				perPage: 200,
				totalItems: 999_999,
				totalPages: 999
			});
		});
		const data = await loadReviewData(spy.port, world.model, world.pagesType, home);
		expect(data.pages).toBeNull();
		expect(pagesCalls).toBe(50);
	});

	test('un sitio sembrado antes de declarar `page` aún lee sus páginas por la columna `path`; si lo declara, no se duplican', async () => {
		const world = await seededWorld();
		// El sembrado actual ya declara `page`; se le quita a mano para simular un sitio sembrado antes.
		expect(world.pagesType.page).not.toBeNull();
		const legacyPagesType = { ...world.pagesType, page: null };
		const legacy = {
			...world.model,
			types: world.model.types.map((type) => (type.name === 'pages' ? legacyPagesType : type))
		};
		const home = await createPage(world, { path: '/inicio' });
		const declared = {
			...world.model,
			types: world.model.types.map((type) =>
				type.name === 'pages'
					? {
							...type,
							page: {
								pathField: 'path',
								pathFieldUnique: true,
								layoutField: null,
								localizedPath: null
							}
						}
					: type
			)
		};
		const withDeclared = await loadReviewData(world.port, declared, declared.types[0], home);
		const withSeeded = await loadReviewData(world.port, legacy, legacyPagesType, home);
		expect(withDeclared.pages).toHaveLength(2);
		expect(withDeclared.pages).toEqual(withSeeded.pages);
	});

	test('si el modelo no dice de dónde salen las páginas, `pages` es null (no «ninguna»)', async () => {
		const world = await seededWorld();
		const home = await createPage(world, { path: '/inicio' });
		const model = { ...world.model, types: world.model.types.filter((t) => t.name !== 'pages') };
		const data = await loadReviewData(world.port, model, world.pagesType, home);
		expect(data.pages).toBeNull();
	});

	test('un tipo sin bloques no lee la colección de bloques ni la de medios', async () => {
		const world = await seededWorld();
		const redirects = world.model.types.find((t) => t.name === 'redirects')!;
		const record = await world.port.create('redirects', { from: '/a', to: '/b', code: '301' });
		const spy = intercept(world, () => undefined);
		const data = await loadReviewData(spy.port, world.model, redirects, record);
		expect(data.blocks).toEqual([]);
		expect(data.media).toEqual(new Map());
		expect(spy.calls.map((c) => c.collection)).not.toContain('blocks');
		expect(spy.calls.map((c) => c.collection)).not.toContain('vega_media');
	});

	test('un proyecto sin colección `redirects` da [] (es un dato), sin consultarla', async () => {
		const world = await seededWorld();
		const home = await createPage(world, { path: '/inicio' });
		const model = {
			...world.model,
			types: world.model.types.filter((t) => t.name !== 'redirects')
		};
		const spy = intercept(world, () => undefined);
		const data = await loadReviewData(spy.port, model, world.pagesType, home);
		expect(data.redirects).toEqual([]);
		expect(spy.calls.map((c) => c.collection)).not.toContain('redirects');
	});

	test('si falla la lectura de páginas, redirecciones o medios, cada una degrada a null por separado', async () => {
		const world = await seededWorld();
		const m = await createMedia(world, 'gato.jpg', '');
		const home = await createPage(world, { path: '/inicio' });
		await createBlock(world, home.id, 1, 'image', {}, { image: m.id });

		for (const broken of ['pages', 'redirects', 'vega_media'] as const) {
			const spy = intercept(world, (collection) =>
				collection === broken ? Promise.reject(new Error('sin permiso')) : undefined
			);
			const data = await loadReviewData(spy.port, world.model, world.pagesType, home);
			expect({
				pages: data.pages === null,
				redirects: data.redirects === null,
				media: data.media === null
			}).toEqual({
				pages: broken === 'pages',
				redirects: broken === 'redirects',
				media: broken === 'vega_media'
			});
			expect(data.blocks).toHaveLength(1);
		}
	});

	test('si falla la lectura de los bloques del registro, la carga rechaza', async () => {
		const world = await seededWorld();
		const home = await createPage(world, { path: '/inicio' });
		const spy = intercept(world, (collection) =>
			collection === 'blocks' ? Promise.reject(new Error('caído')) : undefined
		);
		await expect(loadReviewData(spy.port, world.model, world.pagesType, home)).rejects.toThrow(
			'caído'
		);
	});

	test('los medios se piden en tandas de 100 ids', async () => {
		const world = await seededWorld();
		const home = await createPage(world, { path: '/inicio' });
		const fakeBlocks: VegaRecord[] = Array.from({ length: 150 }, (_, i) => ({
			id: `b${i}`,
			type: 'blocks',
			values: { parent: home.id, order: i, type: 'image', data: {}, image: `m${i}` }
		}));
		const spy = intercept(world, (collection) =>
			collection === 'blocks'
				? Promise.resolve({
						items: fakeBlocks,
						page: 1,
						perPage: 200,
						totalItems: 150,
						totalPages: 1
					})
				: undefined
		);
		await loadReviewData(spy.port, world.model, world.pagesType, home);
		const mediaCalls = spy.calls.filter((c) => c.collection === 'vega_media');
		expect(mediaCalls.map((c) => (c.query!.filter as { value: string[] }).value.length)).toEqual([
			100, 50
		]);
	});
});

describe('pagePathColumns', () => {
	const typeWith = (page: ResolvedContentType['page']) => ({ page }) as ResolvedContentType;

	test('una columna física, una por idioma con ruta localizada, y ninguna si no es de páginas', () => {
		expect(
			pagePathColumns(
				typeWith({
					pathField: 'path',
					pathFieldUnique: true,
					layoutField: null,
					localizedPath: null
				})
			)
		).toEqual(['path']);
		expect(
			pagePathColumns(
				typeWith({
					pathField: 'path',
					pathFieldUnique: true,
					layoutField: null,
					localizedPath: { defaultLocale: 'es', fields: { es: 'pathEs', en: 'pathEn' } }
				})
			)
		).toEqual(['pathEs', 'pathEn']);
		expect(pagePathColumns(typeWith(null))).toEqual([]);
	});
});
