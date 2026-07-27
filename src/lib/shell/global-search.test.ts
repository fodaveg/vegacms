/**
 * Tests unitarios del motor PURO de la búsqueda global (`#lote-shell`, `global-search.ts`): qué
 * colecciones se buscan, con qué `Query`, cómo se traduce una página a grupo y cómo se mueve el
 * índice activo del teclado.
 *
 * La garantía crítica que se verifica aquí (misma ley que `search.test.ts`, L-P4.3): la `Query`
 * de cada colección pasa `validateQuery` sin lanzar, y NUNCA se emite una sin `filter` — una
 * colección sin campos buscables devolvería sus primeros registros como si casaran con lo
 * tecleado, que es el fallo silencioso más caro de un buscador.
 */

import { describe, expect, test } from 'vitest';
import { validateQuery } from '$lib/backend/query';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { Field, Page, VegaRecord } from '$lib/backend/types';
import type { ContentModel, ResolvedContentType, ResolvedField } from '$lib/model/types';
import {
	buildGlobalSearchQuery,
	canSearchType,
	flattenHits,
	globalSearchTypes,
	isSearchableTerm,
	nextActiveIndex,
	normalizeSearchTerm,
	toGlobalSearchGroup,
	GLOBAL_SEARCH_MIN_CHARS,
	GLOBAL_SEARCH_PER_TYPE,
	type GlobalSearchGroup
} from './global-search';

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

function resolvedField(schema: Field): ResolvedField {
	return {
		schema,
		name: schema.name,
		label: schema.name,
		help: null,
		placeholder: null,
		hidden: schema.hidden,
		group: null,
		widget: 'text',
		subtype: null,
		listable: true
	};
}

function contentType(
	name: string,
	fields: Field[],
	overrides: Partial<ResolvedContentType> = {}
): ResolvedContentType {
	return {
		schema: { name, readonly: false, fields },
		name,
		label: name,
		labelSingular: name,
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		permissions: ALL_PERMISSIONS,
		titleField: null,
		subtitleField: null,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields: fields.map(resolvedField),
		listFields: [],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false,
		...overrides
	};
}

/** `ContentModel` mínimo: solo `types` + `nav` (lo único que mira `globalSearchTypes`). */
function model(
	types: ResolvedContentType[],
	navTypes: { type: string; kind: 'collection' | 'view' }[]
): ContentModel {
	return {
		site: { name: 'Vega', defaultTheme: null, locale: 'es' },
		types,
		nav: {
			groups: [
				{
					label: null,
					items: navTypes.map((item) => ({
						kind: item.kind,
						type: item.type,
						label: item.type,
						icon: null,
						singleton: false,
						readonly: false
					}))
				}
			]
		},
		revisions: { enabled: true, keepPerRecord: 20, trashDays: 30 },
		mergedViews: [],
		blockTypes: [],
		layouts: [],
		warnings: [],
		manifest: { status: 'absent' }
	};
}

const titleText = field({ name: 'title', type: 'text', subtype: 'plain' });
const statusSelect = field({
	name: 'status',
	type: 'select',
	options: ['draft', 'published'],
	multiple: false
});

function page(items: VegaRecord[], totalItems = items.length): Page<VegaRecord> {
	return {
		items,
		page: 1,
		perPage: GLOBAL_SEARCH_PER_TYPE,
		totalItems,
		totalPages: Math.ceil(totalItems / GLOBAL_SEARCH_PER_TYPE)
	};
}

describe('normalizeSearchTerm / isSearchableTerm', () => {
	test('recorta extremos y colapsa espacios interiores', () => {
		expect(normalizeSearchTerm('  hola   mundo  ')).toBe('hola mundo');
		expect(normalizeSearchTerm('   ')).toBe('');
	});

	test('por debajo del mínimo no se busca', () => {
		expect(isSearchableTerm('')).toBe(false);
		expect(isSearchableTerm('a')).toBe(false);
		expect(isSearchableTerm('ab')).toBe(true);
		expect(GLOBAL_SEARCH_MIN_CHARS).toBe(2);
	});
});

describe('globalSearchTypes', () => {
	test('solo colecciones de la navegación, EN SU ORDEN, y solo si son buscables', () => {
		const posts = contentType('posts', [titleText], { titleField: 'title' });
		const pages = contentType('pages', [titleText], { titleField: 'title' });
		// Sin ningún campo de texto elegible: nunca se busca (su `Query` no tendría `filter`).
		const metrics = contentType('metrics', [
			field({ name: 'count', type: 'number', integer: true })
		]);

		const result = globalSearchTypes(
			model(
				[posts, pages, metrics],
				[
					{ type: 'pages', kind: 'collection' },
					{ type: 'posts', kind: 'collection' },
					{ type: 'metrics', kind: 'collection' }
				]
			)
		);

		expect(result.map((t) => t.name)).toEqual(['pages', 'posts']);
	});

	test('lo OCULTO no se busca (no está en nav): el manifiesto de Vega nunca sale en resultados', () => {
		const posts = contentType('posts', [titleText], { titleField: 'title' });
		const vega = contentType('vega', [titleText], { titleField: 'title', hidden: true });

		// `nav` solo lleva lo visible (P2 ya lo filtra): `vega` está en `types` pero no en `nav`.
		const result = globalSearchTypes(model([posts, vega], [{ type: 'posts', kind: 'collection' }]));

		expect(result.map((t) => t.name)).toEqual(['posts']);
	});

	test('las vistas fusionadas se saltan (sus registros ya salen por su colección origen)', () => {
		const posts = contentType('posts', [titleText], { titleField: 'title' });
		const result = globalSearchTypes(
			model(
				[posts],
				[
					{ type: 'todo', kind: 'view' },
					{ type: 'posts', kind: 'collection' }
				]
			)
		);

		expect(result.map((t) => t.name)).toEqual(['posts']);
	});
});

describe('buildGlobalSearchQuery / canSearchType', () => {
	test('la Query pide POCOS aciertos, filtra por el término y pasa validateQuery', () => {
		const type = contentType('posts', [titleText], { titleField: 'title' });
		const query = buildGlobalSearchQuery(type, 'hola');

		expect(query.perPage).toBe(GLOBAL_SEARCH_PER_TYPE);
		expect(query.page).toBe(1);
		expect(query.filter).toEqual({ kind: 'cond', field: 'title', op: 'contains', value: 'hola' });
		expect(() => validateQuery(type.schema.fields, query)).not.toThrow();
	});

	test('respeta el orden efectivo del tipo (defaultSort), como el listado', () => {
		const updated = field({ name: 'updated', type: 'date' });
		const type = contentType('posts', [titleText, updated], {
			titleField: 'title',
			defaultSort: { field: 'updated', dir: 'desc' }
		});

		expect(buildGlobalSearchQuery(type, 'hola').sort).toEqual([{ field: 'updated', dir: 'desc' }]);
	});

	test('un tipo sin campos elegibles NO es buscable (guarda contra la Query sin filter)', () => {
		const type = contentType('metrics', [statusSelect], { statusField: 'status' });

		expect(canSearchType(type, 'hola')).toBe(false);
		// Y si alguien lo ignorase, la Query saldría sin `filter`: la colección ENTERA. De ahí la guarda.
		expect(buildGlobalSearchQuery(type, 'hola').filter).toBeUndefined();
	});
});

describe('toGlobalSearchGroup', () => {
	const type = contentType('posts', [titleText, statusSelect], {
		titleField: 'title',
		statusField: 'status',
		statusLabels: { draft: 'Borrador' },
		label: 'Entradas',
		icon: 'file'
	});

	test('título, etiqueta de estado y color de la insignia salen de la MISMA derivación del listado', () => {
		const group = toGlobalSearchGroup(
			type,
			page([
				{ id: 'r1', type: 'posts', values: { title: 'Hola mundo', status: 'draft' } },
				{ id: 'r2', type: 'posts', values: { title: 'Otro', status: 'published' } }
			]),
			'es',
			'(sin título)'
		);

		expect(group.label).toBe('Entradas');
		expect(group.icon).toBe('file');
		expect(group.hits).toEqual([
			{
				type: 'posts',
				id: 'r1',
				title: 'Hola mundo',
				// `statusLabels` traduce el valor crudo…
				statusLabel: 'Borrador',
				statusKind: 'draft'
			},
			{
				type: 'posts',
				id: 'r2',
				title: 'Otro',
				// …y sin entrada en `statusLabels` se pinta el valor crudo tal cual.
				statusLabel: 'published',
				statusKind: 'pub'
			}
		]);
	});

	test('registro sin título resoluble: el "(sin título)" del llamador, nunca el id crudo', () => {
		const group = toGlobalSearchGroup(
			type,
			page([{ id: 'r1', type: 'posts', values: { title: '', status: '' } }]),
			'es',
			'(sin título)'
		);

		expect(group.hits[0].title).toBe('(sin título)');
		expect(group.hits[0].statusLabel).toBeNull();
		expect(group.hits[0].statusKind).toBeNull();
	});

	test('el total del grupo es el de la colección, no el de aciertos pintados', () => {
		const group = toGlobalSearchGroup(
			type,
			page([{ id: 'r1', type: 'posts', values: { title: 'Hola' } }], 42),
			'es',
			'(sin título)'
		);

		expect(group.totalItems).toBe(42);
		expect(group.hits).toHaveLength(1);
	});
});

describe('flattenHits / nextActiveIndex', () => {
	const groups: GlobalSearchGroup[] = [
		{
			type: 'posts',
			label: 'Posts',
			icon: null,
			totalItems: 2,
			hits: [
				{ type: 'posts', id: 'p1', title: 'A', statusLabel: null, statusKind: null },
				{ type: 'posts', id: 'p2', title: 'B', statusLabel: null, statusKind: null }
			]
		},
		{
			type: 'pages',
			label: 'Pages',
			icon: null,
			totalItems: 1,
			hits: [{ type: 'pages', id: 'g1', title: 'C', statusLabel: null, statusKind: null }]
		}
	];

	test('los aciertos se concatenan en el orden de los grupos', () => {
		expect(flattenHits(groups).map((h) => h.id)).toEqual(['p1', 'p2', 'g1']);
	});

	test('↓/↑ recorren TODOS los grupos como una sola lista, con vuelta circular', () => {
		const count = flattenHits(groups).length;
		expect(nextActiveIndex(-1, 1, count)).toBe(0); // nada activo + ↓ → el primero
		expect(nextActiveIndex(-1, -1, count)).toBe(2); // nada activo + ↑ → el último
		expect(nextActiveIndex(1, 1, count)).toBe(2); // cruza del último acierto de un grupo al siguiente
		expect(nextActiveIndex(2, 1, count)).toBe(0); // vuelta circular
		expect(nextActiveIndex(0, -1, count)).toBe(2);
	});

	test('sin aciertos no hay activo posible', () => {
		expect(nextActiveIndex(0, 1, 0)).toBe(-1);
		expect(flattenHits([])).toEqual([]);
	});
});
