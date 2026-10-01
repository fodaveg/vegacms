/**
 * Suite de `trash-query.ts` (`#lote-integridad`, Fase B2): la `Query` de la papelera
 * (`kind:'delete'`, `created` desc + paginación) y el parseo tolerante de `?page=`.
 */
import { describe, expect, test } from 'vitest';
import {
	buildTrashListQuery,
	trashCutoff,
	parseTrashPage,
	trashPageToParams,
	TRASH_PER_PAGE
} from './trash-query';

describe('buildTrashListQuery', () => {
	const NOW = Date.parse('2026-10-01T12:00:00.000Z');

	test('filtra kind:delete no caducada, ordena por created desc y pagina con TRASH_PER_PAGE', () => {
		expect(buildTrashListQuery(1, 30, NOW)).toEqual({
			filter: {
				kind: 'group',
				combinator: 'and',
				nodes: [
					{ kind: 'cond', field: 'kind', op: 'eq', value: 'delete' },
					{ kind: 'cond', field: 'created', op: 'gte', value: '2026-09-01 12:00:00.000Z' }
				]
			},
			sort: [{ field: 'created', dir: 'desc' }],
			page: 1,
			perPage: TRASH_PER_PAGE
		});
	});

	test('respeta la página pedida', () => {
		expect(buildTrashListQuery(3, 30, NOW)).toMatchObject({ page: 3, perPage: TRASH_PER_PAGE });
	});

	test('el corte sigue trashDays y usa el formato de fecha de PocketBase (espacio, no T)', () => {
		expect(trashCutoff(7, NOW)).toBe('2026-09-24 12:00:00.000Z');
		expect(trashCutoff(0, NOW)).toBe('2026-10-01 12:00:00.000Z');
	});
});

describe('parseTrashPage (tolerante, nunca lanza)', () => {
	test('sin "page" → 1', () => {
		expect(parseTrashPage(new URLSearchParams())).toBe(1);
	});

	test('"page" válido (entero >= 1) se respeta', () => {
		expect(parseTrashPage(new URLSearchParams('page=4'))).toBe(4);
	});

	test('"page" no-entero, negativo o cero degrada a 1', () => {
		expect(parseTrashPage(new URLSearchParams('page=abc'))).toBe(1);
		expect(parseTrashPage(new URLSearchParams('page=-3'))).toBe(1);
		expect(parseTrashPage(new URLSearchParams('page=0'))).toBe(1);
		expect(parseTrashPage(new URLSearchParams('page=2.5'))).toBe(1);
	});
});

describe('trashPageToParams (URLs limpias: page === 1 no se escribe)', () => {
	test('página 1 → sin "page"', () => {
		expect(trashPageToParams(1).toString()).toBe('');
	});

	test('página > 1 → "page" presente', () => {
		expect(trashPageToParams(3).toString()).toBe('page=3');
	});

	test('round-trip con parseTrashPage', () => {
		expect(parseTrashPage(trashPageToParams(5))).toBe(5);
	});
});
