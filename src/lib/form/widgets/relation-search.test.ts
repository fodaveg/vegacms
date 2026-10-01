/**
 * Suite de `relation-search.ts` (F5-e, widget `relation`, L-P5.9/D-P5.9): anti-carrera
 * (`RelationSearchSequencer`), degradación sin `titleField` (Audit Finding 3), construcción de
 * queries, mapeo de candidatos, caché de títulos de los ya seleccionados y toggle de selección
 * múltiple respetando `maxSelect`.
 */
import { describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { VegaError } from '$lib/backend/errors';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import {
	buildDegradedListQuery,
	buildTitleSearchQuery,
	candidatesFromPage,
	idsNeedingTitles,
	RELATION_SEARCH_PER_PAGE,
	RelationSearchSequencer,
	supportsTitleSearch,
	titleOf,
	toggleRelationSelection,
	withCachedTitle,
	buildTitlesByIdsQuery,
	chunkIds,
	fetchRecordsByIds
} from './relation-search';

// ————— Helpers de fixture (mínimos, no el `ContentModel` completo) —————

function textField(name: string): Field {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false
	};
}

function numberField(name: string): Field {
	return {
		name,
		type: 'number',
		integer: true,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

function makeTarget(opts: { titleField: string | null; fields: Field[] }): ResolvedContentType {
	const schema: ContentType = { name: 'authors', readonly: false, fields: opts.fields };
	return {
		schema,
		name: 'authors',
		label: 'Authors',
		labelSingular: 'Author',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: opts.titleField,
		subtitleField: null,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields: [],
		listFields: [],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false
	};
}

describe('RelationSearchSequencer (anti-carrera, L-P5.9)', () => {
	it('la última llamada emitida es "latest"; una anterior deja de serlo', () => {
		const seq = new RelationSearchSequencer();
		const a = seq.next();
		expect(seq.isLatest(a)).toBe(true);

		const b = seq.next();
		expect(seq.isLatest(a)).toBe(false);
		expect(seq.isLatest(b)).toBe(true);
	});

	it('una respuesta stale (b resuelve antes que a) se descarta: solo b es "latest"', () => {
		const seq = new RelationSearchSequencer();
		const a = seq.next();
		const b = seq.next();
		expect(seq.isLatest(b)).toBe(true);
		expect(seq.isLatest(a)).toBe(false);
	});
});

describe('supportsTitleSearch (Audit Finding 3)', () => {
	it('titleField null ⇒ no soporta búsqueda por título (degradado)', () => {
		const target = makeTarget({ titleField: null, fields: [numberField('count')] });
		expect(supportsTitleSearch(target)).toBe(false);
	});

	it('titleField de familia texto ⇒ soporta búsqueda por título', () => {
		const target = makeTarget({ titleField: 'name', fields: [textField('name')] });
		expect(supportsTitleSearch(target)).toBe(true);
	});

	it('titleField que ya no existe en schema.fields (defensivo) ⇒ no soporta', () => {
		const target = makeTarget({ titleField: 'ghost', fields: [textField('name')] });
		expect(supportsTitleSearch(target)).toBe(false);
	});
});

describe('buildTitleSearchQuery', () => {
	it('término en blanco ⇒ sin filtro, solo perPage acotado', () => {
		expect(buildTitleSearchQuery('title', '   ')).toEqual({ perPage: RELATION_SEARCH_PER_PAGE });
	});

	it('término no vacío ⇒ filtro contains sobre titleField, recortado', () => {
		expect(buildTitleSearchQuery('title', '  Vega  ')).toEqual({
			filter: { kind: 'cond', field: 'title', op: 'contains', value: 'Vega' },
			perPage: RELATION_SEARCH_PER_PAGE
		});
	});
});

describe('buildDegradedListQuery', () => {
	it('pagina sin filtro, con el perPage acotado', () => {
		expect(buildDegradedListQuery(2)).toEqual({ page: 2, perPage: RELATION_SEARCH_PER_PAGE });
	});
});

describe('titleOf', () => {
	const record: VegaRecord = { id: 'rec_1', type: 'authors', values: { name: 'Ada Lovelace' } };

	it('titleField presente y con valor ⇒ ese valor', () => {
		expect(titleOf(record, 'name')).toBe('Ada Lovelace');
	});

	it('titleField null (degradado) ⇒ el id', () => {
		expect(titleOf(record, null)).toBe('rec_1');
	});

	it('titleField presente pero valor vacío/no-string ⇒ el id (degrada sin fila en blanco)', () => {
		const blank: VegaRecord = { id: 'rec_2', type: 'authors', values: { name: '' } };
		expect(titleOf(blank, 'name')).toBe('rec_2');
		const nonString: VegaRecord = { id: 'rec_3', type: 'authors', values: { name: null } };
		expect(titleOf(nonString, 'name')).toBe('rec_3');
	});
});

describe('candidatesFromPage', () => {
	it('mapea items → {id, title} en el mismo orden', () => {
		const page = {
			items: [
				{ id: 'a', type: 'authors', values: { name: 'Ada' } },
				{ id: 'b', type: 'authors', values: { name: 'Bob' } }
			],
			page: 1,
			perPage: 20,
			totalItems: 2,
			totalPages: 1
		};
		expect(candidatesFromPage(page, 'name')).toEqual([
			{ id: 'a', title: 'Ada' },
			{ id: 'b', title: 'Bob' }
		]);
	});

	it('titleField null (degradado) ⇒ cada candidato se representa por su id', () => {
		const page = {
			items: [{ id: 'metric_1', type: 'metrics', values: { count: 42 } }],
			page: 1,
			perPage: 20,
			totalItems: 1,
			totalPages: 1
		};
		expect(candidatesFromPage(page, null)).toEqual([{ id: 'metric_1', title: 'metric_1' }]);
	});
});

describe('caché de títulos (withCachedTitle / idsNeedingTitles, D-P5.9)', () => {
	it('withCachedTitle añade sin mutar la caché original', () => {
		const cache = {};
		const next = withCachedTitle(cache, 'a', { status: 'ok', title: 'Ada' });
		expect(cache).toEqual({});
		expect(next).toEqual({ a: { status: 'ok', title: 'Ada' } });
	});

	it('withCachedTitle reemplaza una entrada existente', () => {
		const cache = withCachedTitle({}, 'a', { status: 'not-found' });
		const next = withCachedTitle(cache, 'a', { status: 'ok', title: 'Ada (ya existe)' });
		expect(next).toEqual({ a: { status: 'ok', title: 'Ada (ya existe)' } });
	});

	it('idsNeedingTitles solo devuelve los ids AUSENTES de la caché', () => {
		const cache = withCachedTitle({}, 'a', { status: 'ok', title: 'Ada' });
		expect(idsNeedingTitles(['a', 'b', 'c'], cache)).toEqual(['b', 'c']);
	});

	it('idsNeedingTitles: un id ya cacheado como not-found NO se vuelve a pedir', () => {
		const cache = withCachedTitle({}, 'x', { status: 'not-found' });
		expect(idsNeedingTitles(['x'], cache)).toEqual([]);
	});

	it('idsNeedingTitles: un id EN VUELO (pending) tampoco se vuelve a pedir (fix de code-review, O(n²))', () => {
		// El escenario real del bug: 3 ids seleccionados a la vez, ninguno cacheado todavía, pero
		// uno (b) ya tiene un `ctx.port.get` en curso — sin el parámetro `pending`, `idsNeedingTitles`
		// lo devolvería igual y el shell dispararía un SEGUNDO `get` para él en cada re-render.
		const pending = new Set(['b']);
		expect(idsNeedingTitles(['a', 'b', 'c'], {}, pending)).toEqual(['a', 'c']);
	});

	it('idsNeedingTitles: sin `pending` (default), se comporta igual que antes del fix', () => {
		expect(idsNeedingTitles(['a', 'b'], {})).toEqual(['a', 'b']);
	});
});

describe('toggleRelationSelection (múltiple, maxSelect — D-P5.9)', () => {
	it('sin maxSelect: añade y quita libremente (delega en toggleValue)', () => {
		expect(toggleRelationSelection([], 'a', undefined)).toEqual(['a']);
		expect(toggleRelationSelection(['a'], 'a', undefined)).toEqual([]);
	});

	it('bajo el límite: añade con normalidad', () => {
		expect(toggleRelationSelection(['a'], 'b', 2)).toEqual(['a', 'b']);
	});

	it('en el límite: añadir uno NUEVO es un no-op (misma referencia, sin cambios)', () => {
		const current = ['a', 'b'];
		expect(toggleRelationSelection(current, 'c', 2)).toBe(current);
	});

	it('en el límite: quitar uno YA seleccionado sigue permitido', () => {
		expect(toggleRelationSelection(['a', 'b'], 'a', 2)).toEqual(['b']);
	});
});

describe('chunkIds / buildTitlesByIdsQuery', () => {
	it('trocea en lotes consecutivos de 50 y conserva el orden', () => {
		const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
		const chunks = chunkIds(ids);
		expect(chunks.map((c) => c.length)).toEqual([50, 50, 20]);
		expect(chunks.flat()).toEqual(ids);
		expect(chunkIds([])).toEqual([]);
	});

	it('la query filtra por id con perPage = nº de ids y proyecta solo si se pide', () => {
		expect(buildTitlesByIdsQuery(['a', 'b'])).toEqual({
			filter: { kind: 'cond', field: 'id', op: 'in', value: ['a', 'b'] },
			perPage: 2
		});
		expect(buildTitlesByIdsQuery(['a'], ['title']).fields).toEqual(['title']);
	});
});

describe('fetchRecordsByIds (list por ids + get de los que el list no devuelve)', () => {
	const rec = (id: string): VegaRecord => ({ id, type: 'articles', values: { title: `T ${id}` } });
	const pageOf = (items: VegaRecord[]) => ({
		items,
		page: 1,
		perPage: 50,
		totalItems: items.length,
		totalPages: 1
	});

	it('el list devuelve 1 de 2 ids y el get del otro lo devuelve: los dos se resuelven', async () => {
		const list = vi.fn(async () => pageOf([rec('a')]));
		const get = vi.fn(async (_type: string, id: string) => rec(id));
		const out = await fetchRecordsByIds({ list, get }, 'articles', ['a', 'b'], ['title']);
		expect([...out.records.keys()].sort()).toEqual(['a', 'b']);
		expect(out.notFound.size).toBe(0);
		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith('articles', 'b');
	});

	it('si el get del que falta responde 404, queda notFound', async () => {
		const list = vi.fn(async () => pageOf([rec('a')]));
		const get = vi.fn(async (_type: string, id: string): Promise<VegaRecord> => {
			throw VegaError.notFound(id);
		});
		const out = await fetchRecordsByIds({ list, get }, 'articles', ['a', 'b']);
		expect([...out.records.keys()]).toEqual(['a']);
		expect([...out.notFound]).toEqual(['b']);
		expect(out.errors).toEqual([]);
	});

	it('un get que falla con otra cosa que 404 no marca notFound: queda sin resolver y se reporta', async () => {
		const boom = VegaError.backend('caído');
		const list = vi.fn(async () => pageOf([]));
		const get = vi.fn(async (): Promise<VegaRecord> => {
			throw boom;
		});
		const out = await fetchRecordsByIds({ list, get }, 'articles', ['b']);
		expect(out.records.size).toBe(0);
		expect(out.notFound.size).toBe(0);
		expect(out.errors).toEqual([boom]);
	});

	it('sin ids ausentes no hace ningún get', async () => {
		const list = vi.fn(async () => pageOf([rec('a')]));
		const get = vi.fn();
		await fetchRecordsByIds({ list, get }, 'articles', ['a']);
		expect(get).not.toHaveBeenCalled();
	});

	it('acota la concurrencia de los get', async () => {
		const ids = Array.from({ length: 12 }, (_, i) => `x${i}`);
		let inFlight = 0;
		let peak = 0;
		const get = vi.fn(async (_type: string, id: string) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight -= 1;
			return rec(id);
		});
		const list = vi.fn(async () => pageOf([]));
		const out = await fetchRecordsByIds({ list, get }, 'articles', ids, undefined, 3);
		expect(out.records.size).toBe(12);
		expect(peak).toBe(3);
	});
});
