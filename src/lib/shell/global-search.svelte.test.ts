/**
 * Tests del estado reactivo de la búsqueda global (`#lote-shell`, `global-search.svelte.ts`): lo
 * que NO puede verificar el módulo puro — rebote, anti-carrera, y qué pasa cuando algunas de las N
 * peticiones fallan.
 *
 * Los tres casos de fallo se prueban por separado a propósito, porque la regla no es "si algo
 * falla, error": un fallo aislado deja el panel con los aciertos que SÍ llegaron (y lo dice en su
 * pie, `failedCount`), y solo un fallo TOTAL pinta el estado de error.
 */

import { describe, expect, test, vi } from 'vitest';
import type { VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { VegaError } from '$lib/backend/errors';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { ContentModel, ResolvedContentType, ResolvedField } from '$lib/model/types';
import type { Field } from '$lib/backend/types';
import { createGlobalSearchState } from './global-search.svelte';

function field(name: string): Field {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

function contentType(name: string): ResolvedContentType {
	const schema = field('title');
	const resolved: ResolvedField = {
		schema,
		name: 'title',
		label: 'Título',
		help: null,
		placeholder: null,
		hidden: false,
		group: null,
		widget: 'text',
		subtype: null,
		listable: true
	};
	return {
		schema: { name, readonly: false, fields: [schema] },
		name,
		label: name,
		labelSingular: name,
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		permissions: ALL_PERMISSIONS,
		titleField: 'title',
		subtitleField: null,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields: [resolved],
		listFields: ['title'],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false
	};
}

function contentModel(types: ResolvedContentType[]): ContentModel {
	return {
		site: { name: 'Vega', defaultTheme: null, locale: 'es' },
		types,
		nav: {
			groups: [
				{
					label: null,
					items: types.map((type) => ({
						kind: 'collection' as const,
						type: type.name,
						label: type.label,
						icon: null,
						singleton: false,
						readonly: false
					}))
				}
			]
		},
		revisions: { enabled: true, keepPerRecord: 20, trashDays: 30 },
		mergedViews: [],
		warnings: [],
		manifest: { status: 'absent' }
	};
}

function pageOf(type: string, titles: string[]): Page<VegaRecord> {
	return {
		items: titles.map((title, index) => ({ id: `${type}-${index}`, type, values: { title } })),
		page: 1,
		perPage: 5,
		totalItems: titles.length,
		totalPages: 1
	};
}

interface Harness {
	ctx: VegaAppContext;
	list: ReturnType<typeof vi.fn>;
	reportError: ReturnType<typeof vi.fn>;
}

function harness(
	list: (type: string) => Promise<Page<VegaRecord>>,
	types = ['posts', 'pages']
): Harness {
	const listMock = vi.fn((type: string) => list(type));
	const reportError = vi.fn();
	const ctx = {
		port: { list: listMock },
		model: contentModel(types.map(contentType)),
		locale: 'es',
		t: (key: string) => key,
		feedback: { reportError, toast: vi.fn() }
	} as unknown as VegaAppContext;
	return { ctx, list: listMock, reportError };
}

/** Deja correr el rebote (0 ms) y las promesas encadenadas de `Promise.allSettled`. */
async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
	await Promise.resolve();
}

describe('createGlobalSearchState', () => {
	test('por debajo del mínimo no toca red y se queda en idle', async () => {
		const { ctx, list } = harness(async (type) => pageOf(type, ['Hola']));
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('h');
		await settle();

		expect(list).not.toHaveBeenCalled();
		expect(state.status.kind).toBe('idle');
		expect(state.input).toBe('h');
	});

	test('busca UNA vez por colección y agrupa solo las que tienen aciertos', async () => {
		const { ctx, list } = harness(async (type) =>
			type === 'posts' ? pageOf(type, ['Hola mundo', 'Hola otra vez']) : pageOf(type, [])
		);
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('hola');
		await settle();

		expect(list).toHaveBeenCalledTimes(2);
		expect(state.searchedTerm).toBe('hola');
		expect(state.status.kind).toBe('ready');
		if (state.status.kind !== 'ready') throw new Error('estado inesperado');
		expect(state.status.groups.map((g) => g.type)).toEqual(['posts']);
		expect(state.hits.map((h) => h.title)).toEqual(['Hola mundo', 'Hola otra vez']);
		expect(state.status.failedCount).toBe(0);
	});

	test('el rebote colapsa la ráfaga de teclas en UNA búsqueda', async () => {
		const { ctx, list } = harness(async (type) => pageOf(type, ['Hola']));
		const state = createGlobalSearchState(ctx, { debounceMs: 20 });

		state.setInput('ho');
		state.setInput('hol');
		state.setInput('hola');
		await new Promise((resolve) => setTimeout(resolve, 40));
		await settle();

		// 2 colecciones × 1 búsqueda (no × 3 teclas).
		expect(list).toHaveBeenCalledTimes(2);
		expect(state.searchedTerm).toBe('hola');
	});

	test('anti-carrera: una respuesta antigua que llega tarde NO pisa a la nueva', async () => {
		// Una sola colección, con la resolución de cada `list()` en manos del test.
		const pending: ((page: Page<VegaRecord>) => void)[] = [];
		const { ctx } = harness(
			() => new Promise<Page<VegaRecord>>((resolve) => pending.push(resolve)),
			['posts']
		);
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('viejo');
		await new Promise((resolve) => setTimeout(resolve, 0));
		state.setInput('nuevo');
		await new Promise((resolve) => setTimeout(resolve, 0));

		// Resuelve PRIMERO la nueva y DESPUÉS la vieja (el orden que rompe sin `RequestSequencer`).
		pending[1](pageOf('posts', ['Resultado nuevo']));
		await settle();
		pending[0](pageOf('posts', ['Resultado viejo']));
		await settle();

		expect(state.searchedTerm).toBe('nuevo');
		expect(state.hits.map((h) => h.title)).toEqual(['Resultado nuevo']);
	});

	test('una colección que falla no borra los aciertos de las demás: búsqueda PARCIAL', async () => {
		const { ctx } = harness(async (type) => {
			if (type === 'pages') throw VegaError.forbidden('sin permiso');
			return pageOf(type, ['Hola mundo']);
		});
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('hola');
		await settle();

		expect(state.status.kind).toBe('ready');
		if (state.status.kind !== 'ready') throw new Error('estado inesperado');
		expect(state.status.groups.map((g) => g.type)).toEqual(['posts']);
		expect(state.status.failedCount).toBe(1);
	});

	test('si fallan TODAS, estado de error', async () => {
		const { ctx } = harness(async () => {
			throw VegaError.network('sin red');
		});
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('hola');
		await settle();

		expect(state.status.kind).toBe('error');
	});

	test('auth-expired sale al feedback global UNA sola vez, nunca al panel', async () => {
		const { ctx, reportError } = harness(async () => {
			throw VegaError.authExpired('sesión caducada');
		});
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('hola');
		await settle();

		// Dos colecciones fallaron por lo mismo: un solo reporte al overlay global.
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(state.status.kind).toBe('error');
	});

	test('volver por debajo del mínimo descarta los resultados anteriores', async () => {
		const { ctx } = harness(async (type) => pageOf(type, ['Hola']));
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('hola');
		await settle();
		expect(state.hits).toHaveLength(2);

		state.setInput('h');
		expect(state.status.kind).toBe('idle');
		expect(state.hits).toEqual([]);
		expect(state.searchedTerm).toBe('');
	});

	test('el índice activo recorre los aciertos y sobrevive al hover; clear() lo resetea', async () => {
		const { ctx } = harness(async (type) => pageOf(type, ['Uno', 'Dos']));
		const state = createGlobalSearchState(ctx, { debounceMs: 0 });

		state.setInput('o');
		state.setInput('uno');
		await settle();

		expect(state.activeIndex).toBe(-1);
		state.moveActive(1);
		expect(state.activeIndex).toBe(0);
		state.setActive(3);
		expect(state.activeHit()?.title).toBe('Dos'); // 4 aciertos (2 colecciones × 2)
		state.moveActive(1);
		expect(state.activeIndex).toBe(0); // vuelta circular

		state.clear();
		expect(state.activeIndex).toBe(-1);
		expect(state.input).toBe('');
		expect(state.status.kind).toBe('idle');
	});
});
