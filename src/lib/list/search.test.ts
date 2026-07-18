/**
 * Tests unitarios de `buildListQuery`/`isSearchEnabled` (Fase 4b, D-P4.3(a)/D-P4.4(a)/
 * D-P4.6(a)). La garantía CRÍTICA (L-P4.3) es que toda `Query` producida pase `validateQuery`
 * sin lanzar: cada test de construcción termina verificándolo explícitamente.
 */

import { describe, expect, test } from 'vitest';
import { validateQuery, DEFAULT_PER_PAGE } from '$lib/backend/query';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { buildListQuery, isSearchEnabled } from './search';
import type { ViewState } from './query-state';

function field(overrides: Partial<Field> & Pick<Field, 'name' | 'type'>): Field {
	return {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	} as Field;
}

/** `ResolvedContentType` mínimo: `search.ts` solo mira `schema.fields`, `titleField`,
 *  `listFields` y `statusField`, así que el resto de la superficie queda con defaults planos. */
function contentType(
	fields: Field[],
	overrides: Partial<ResolvedContentType> = {}
): ResolvedContentType {
	return {
		schema: { name: 'posts', readonly: false, fields },
		name: 'posts',
		label: 'Posts',
		labelSingular: 'Posts',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		titleField: null,
		statusField: null,
		previewUrl: null,
		fields: [],
		listFields: [],
		fieldGroups: [null],
		...overrides
	};
}

const emptyState: ViewState = { q: '', sort: null, status: null, page: 1 };

describe('isSearchEnabled / buildListQuery — búsqueda', () => {
	test('sin campos elegibles: búsqueda deshabilitada y sin nodo de búsqueda', () => {
		const status = field({
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		});
		// El único "texto" del tipo es el statusField (select): NUNCA debe colar `contains`.
		const type = contentType([status], { statusField: 'status', listFields: ['status'] });

		expect(isSearchEnabled(type)).toBe(false);

		const query = buildListQuery(type, { ...emptyState, q: 'busqueda' });
		expect(query.filter).toBeUndefined();
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('select multiple en listFields NUNCA se cuela en la búsqueda (contains ≠ substring ahí)', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const tags = field({ name: 'tags', type: 'select', options: ['a', 'b', 'c'], multiple: true });
		// `contains` SÍ está en allowedFilterOps de un select múltiple (§4.6), pero con semántica
		// de membresía exacta, no de substring de texto libre: no debe entrar en el OR.
		const type = contentType([title, tags], { titleField: 'title', listFields: ['title', 'tags'] });

		expect(isSearchEnabled(type)).toBe(true);

		const query = buildListQuery(type, { ...emptyState, q: 'hola' });
		expect(query.filter).toEqual({ kind: 'cond', field: 'title', op: 'contains', value: 'hola' });
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('titleField + listFields de texto: OR de contains, dedupe si coinciden', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const summary = field({ name: 'summary', type: 'text', subtype: 'plain' });
		const views = field({ name: 'views', type: 'number', integer: true });
		const type = contentType([title, summary, views], {
			titleField: 'title',
			listFields: ['title', 'summary', 'views'] // title duplicado con titleField: se dedupe
		});

		expect(isSearchEnabled(type)).toBe(true);

		const query = buildListQuery(type, { ...emptyState, q: 'hola' });
		expect(query.filter).toEqual({
			kind: 'group',
			combinator: 'or',
			nodes: [
				{ kind: 'cond', field: 'title', op: 'contains', value: 'hola' },
				{ kind: 'cond', field: 'summary', op: 'contains', value: 'hola' }
			]
		});
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('un único campo elegible: el nodo va directo, sin envolver en grupo', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType([title], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, { ...emptyState, q: 'hola' });
		expect(query.filter).toEqual({ kind: 'cond', field: 'title', op: 'contains', value: 'hola' });
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('q vacío: no emite nodo de búsqueda aunque haya campos elegibles', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType([title], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, emptyState);
		expect(query.filter).toBeUndefined();
	});
});

describe('buildListQuery — filtro de estado', () => {
	test('status + statusField: cond eq', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const status = field({
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		});
		const type = contentType([title, status], {
			titleField: 'title',
			statusField: 'status',
			listFields: ['title', 'status']
		});

		const query = buildListQuery(type, { ...emptyState, status: 'published' });
		expect(query.filter).toEqual({ kind: 'cond', field: 'status', op: 'eq', value: 'published' });
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('status sin statusField en el tipo: se ignora (no hay campo al que aplicarlo)', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType([title], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, { ...emptyState, status: 'published' });
		expect(query.filter).toBeUndefined();
	});

	test('búsqueda + estado combinados en un grupo and', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const status = field({
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		});
		const type = contentType([title, status], {
			titleField: 'title',
			statusField: 'status',
			listFields: ['title', 'status']
		});

		const query = buildListQuery(type, { ...emptyState, q: 'hola', status: 'draft' });
		expect(query.filter).toEqual({
			kind: 'group',
			combinator: 'and',
			nodes: [
				{ kind: 'cond', field: 'title', op: 'contains', value: 'hola' },
				{ kind: 'cond', field: 'status', op: 'eq', value: 'draft' }
			]
		});
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});
});

describe('buildListQuery — sort', () => {
	test('campo escalar existente: se incluye tal cual', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType([title], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, { ...emptyState, sort: { field: 'title', dir: 'asc' } });
		expect(query.sort).toEqual([{ field: 'title', dir: 'asc' }]);
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('campo inexistente en el esquema: se omite el sort (D-P4.6(a))', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType([title], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, {
			...emptyState,
			sort: { field: 'campo-fantasma', dir: 'asc' }
		});
		expect(query.sort).toBeUndefined();
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('campo no escalar (relation múltiple): se omite el sort', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const related = field({ name: 'related', type: 'relation', target: 'posts', multiple: true });
		const type = contentType([title, related], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, { ...emptyState, sort: { field: 'related', dir: 'desc' } });
		expect(query.sort).toBeUndefined();
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});
});

describe('buildListQuery — page/perPage', () => {
	test('usa el page del estado y DEFAULT_PER_PAGE', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const type = contentType([title], { titleField: 'title', listFields: ['title'] });

		const query = buildListQuery(type, { ...emptyState, page: 4 });
		expect(query.page).toBe(4);
		expect(query.perPage).toBe(DEFAULT_PER_PAGE);
	});
});

describe('buildListQuery — validateQuery nunca lanza (L-P4.3, matriz combinada)', () => {
	test('caso completo: búsqueda + estado + sort + page, todo compatible', () => {
		const title = field({ name: 'title', type: 'text', subtype: 'plain' });
		const body = field({ name: 'body', type: 'richtext', subtype: 'html' });
		const status = field({
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		});
		const createdAt = field({ name: 'createdAt', type: 'date', readonly: true });
		const type = contentType([title, body, status, createdAt], {
			titleField: 'title',
			statusField: 'status',
			listFields: ['title', 'status', 'createdAt']
		});

		const state: ViewState = {
			q: 'algo',
			sort: { field: 'createdAt', dir: 'desc' },
			status: 'published',
			page: 2
		};
		const query = buildListQuery(type, state);
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});
});
