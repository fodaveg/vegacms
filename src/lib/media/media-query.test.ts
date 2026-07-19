/**
 * Suite de `media-query.ts` (Fase P6·6b): la `Query` del grid (`created` desc + paginación) y el
 * parseo tolerante de `?page=`.
 */
import { describe, expect, test } from 'vitest';
import {
	buildMediaListQuery,
	mediaPageToParams,
	MEDIA_PER_PAGE,
	parseMediaPage
} from './media-query';

describe('buildMediaListQuery', () => {
	test('ordena por "created" desc y pagina con MEDIA_PER_PAGE', () => {
		expect(buildMediaListQuery(1)).toEqual({
			sort: [{ field: 'created', dir: 'desc' }],
			page: 1,
			perPage: MEDIA_PER_PAGE
		});
	});

	test('respeta la página pedida', () => {
		expect(buildMediaListQuery(3)).toMatchObject({ page: 3, perPage: MEDIA_PER_PAGE });
	});

	test('sin `opts` (o `search` en blanco/ausente): sin filtro, idéntico a antes de 6e', () => {
		expect(buildMediaListQuery(1, {})).toEqual(buildMediaListQuery(1));
		expect(buildMediaListQuery(1, { search: '' })).toEqual(buildMediaListQuery(1));
		expect(buildMediaListQuery(1, { search: '   ' })).toEqual(buildMediaListQuery(1));
		expect(buildMediaListQuery(1)).not.toHaveProperty('filter');
	});

	test('con `search` no-vacío (Fase P6·6e): filtro OR `contains` sobre alt/title', () => {
		expect(buildMediaListQuery(1, { search: 'playa' })).toEqual({
			filter: {
				kind: 'group',
				combinator: 'or',
				nodes: [
					{ kind: 'cond', field: 'alt', op: 'contains', value: 'playa' },
					{ kind: 'cond', field: 'title', op: 'contains', value: 'playa' }
				]
			},
			sort: [{ field: 'created', dir: 'desc' }],
			page: 1,
			perPage: MEDIA_PER_PAGE
		});
	});

	test('`search` se recorta antes de filtrar/comparar contra vacío', () => {
		expect(buildMediaListQuery(1, { search: '  playa  ' })).toEqual(
			buildMediaListQuery(1, { search: 'playa' })
		);
	});
});

describe('parseMediaPage (tolerante, nunca lanza)', () => {
	test('sin "page" → 1', () => {
		expect(parseMediaPage(new URLSearchParams())).toBe(1);
	});

	test('"page" válido (entero >= 1) se respeta', () => {
		expect(parseMediaPage(new URLSearchParams('page=4'))).toBe(4);
	});

	test('"page" no-entero, negativo o cero degrada a 1', () => {
		expect(parseMediaPage(new URLSearchParams('page=abc'))).toBe(1);
		expect(parseMediaPage(new URLSearchParams('page=-3'))).toBe(1);
		expect(parseMediaPage(new URLSearchParams('page=0'))).toBe(1);
		expect(parseMediaPage(new URLSearchParams('page=2.5'))).toBe(1);
	});
});

describe('mediaPageToParams (URLs limpias: page === 1 no se escribe)', () => {
	test('página 1 → sin "page"', () => {
		expect(mediaPageToParams(1).toString()).toBe('');
	});

	test('página > 1 → "page" presente', () => {
		expect(mediaPageToParams(3).toString()).toBe('page=3');
	});

	test('round-trip con parseMediaPage', () => {
		expect(parseMediaPage(mediaPageToParams(5))).toBe(5);
	});
});
