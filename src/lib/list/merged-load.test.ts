/**
 * Tests de `merged-load.svelte.ts` (Fase L7b, regresión del lote 7b): una fuente caída NO tira la
 * vista fusionada entera. Se enseñan las demás con `failedSources` nombrando la que falló; solo si
 * fallan todas es un error, y `auth-expired` sigue yendo al overlay global.
 */

import { describe, expect, test, vi } from 'vitest';
import { createMergedListState } from './merged-load.svelte';
import type { VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { ResolvedMergedSource, ResolvedMergedView } from '$lib/model/types';

function makeSource(collection: string, label: string): ResolvedMergedSource {
	return { collection, where: null, orderField: 'sort', titleField: 'title', label };
}

const view: ResolvedMergedView = {
	id: 'destacados',
	label: 'Destacados',
	icon: null,
	group: null,
	order: 0,
	sources: [makeSource('arte', 'Obra'), makeSource('music', 'Pieza')]
};

function page(items: VegaRecord[], totalItems = items.length): Page<VegaRecord> {
	return { items, page: 1, perPage: 200, totalItems, totalPages: 1 };
}

function makeCtx(list: (collection: string) => Promise<Page<VegaRecord>>) {
	const reportError = vi.fn();
	const ctx = {
		port: { list: vi.fn((collection: string) => list(collection)) },
		feedback: { reportError }
	} as unknown as VegaAppContext;
	return { ctx, reportError };
}

describe('createMergedListState: fuentes caídas', () => {
	test('una fuente falla → se enseñan las demás y `failedSources` nombra la caída', async () => {
		const { ctx, reportError } = makeCtx(async (collection) => {
			if (collection === 'music') throw VegaError.network();
			return page([{ id: 'a1', type: 'arte', values: { sort: 0 } }]);
		});
		const state = createMergedListState();
		await state.load(ctx, view);
		expect(state.status).toEqual({
			kind: 'ready',
			rows: [expect.objectContaining({ record: expect.objectContaining({ id: 'a1' }) })],
			truncatedCollections: [],
			failedSources: ['Pieza']
		});
		expect(reportError).not.toHaveBeenCalled();
	});

	test('todas cargan → `failedSources` vacío', async () => {
		const { ctx } = makeCtx(async () => page([]));
		const state = createMergedListState();
		await state.load(ctx, view);
		expect(state.status).toMatchObject({ kind: 'ready', failedSources: [] });
	});

	test('fallan TODAS → estado de error con el primer error', async () => {
		const { ctx } = makeCtx(async () => {
			throw VegaError.network();
		});
		const state = createMergedListState();
		await state.load(ctx, view);
		expect(state.status).toMatchObject({ kind: 'error', error: { kind: 'network' } });
	});

	test('una fuente con la sesión caducada → overlay global, no un estado local', async () => {
		const { ctx, reportError } = makeCtx(async (collection) => {
			if (collection === 'arte') throw VegaError.authExpired();
			return page([]);
		});
		const state = createMergedListState();
		await state.load(ctx, view);
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(state.status.kind).toBe('loading');
	});

	test('una fuente caída no cuenta como truncada', async () => {
		const { ctx } = makeCtx(async (collection) => {
			if (collection === 'music') throw VegaError.network();
			return page([{ id: 'a1', type: 'arte', values: {} }], 500);
		});
		const state = createMergedListState();
		await state.load(ctx, view);
		expect(state.status).toMatchObject({
			truncatedCollections: ['arte'],
			failedSources: ['Pieza']
		});
	});
});
