/**
 * Tests de `list-state.svelte.ts` — recarga SIN parpadeo (lote 9 del audit del 30 sep 2026):
 * tras borrar/reordenar/importar, `reload()` conserva la tabla visible mientras llegan los datos
 * nuevos (`refreshing`), pero la carga inicial y la navegación (`load()`) siguen pasando por
 * `'loading'`. Mide, además, cuántas veces el estado pasa por `'loading'` durante una recarga.
 */
import { describe, expect, test, vi } from 'vitest';
import { createListState } from './list-state.svelte';
import type { VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { ViewState } from './query-state';

const type = {
	name: 'posts',
	schema: { name: 'posts', readonly: false, fields: [] },
	statusField: null,
	defaultSort: null,
	orderField: null,
	titleField: null,
	fields: []
} as unknown as ResolvedContentType;
const view: ViewState = { q: '', status: null, sort: null, page: 1 };

function page(...ids: string[]): Page<VegaRecord> {
	return {
		items: ids.map((id) => ({ id, type: 'posts', values: {} })),
		page: 1,
		perPage: 30,
		totalItems: ids.length,
		totalPages: 1
	};
}

/** Puerto falso cuyas respuestas se resuelven a mano, en el orden que decida cada test. */
function makeCtx() {
	const pending: { resolve: (p: Page<VegaRecord>) => void; reject: (e: unknown) => void }[] = [];
	const reportError = vi.fn();
	const list = vi.fn(
		() =>
			new Promise<Page<VegaRecord>>((resolve, reject) => {
				pending.push({ resolve, reject });
			})
	);
	const reportConnectivity = vi.fn();
	const ctx = {
		port: { list },
		feedback: { reportError, reportConnectivity }
	} as unknown as VegaAppContext;
	return { ctx, list, pending, reportError, reportConnectivity };
}

/** Deja correr los microtasks pendientes tras resolver una promesa del puerto falso. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('createListState: recarga conservando la tabla', () => {
	test('reload() no pasa por loading: la tabla vieja se queda y `refreshing` avisa', async () => {
		const { ctx, list, pending } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		expect(state.status.kind).toBe('loading'); // carga inicial: sin datos previos
		expect(state.refreshing).toBe(false);
		pending[0].resolve(page('a', 'b'));
		await first;

		let loadingSeen = 0;
		state.reload();
		if (state.status.kind === 'loading') loadingSeen += 1;
		expect(loadingSeen).toBe(0);
		expect(state.status).toMatchObject({
			kind: 'ready',
			page: { items: [{ id: 'a' }, { id: 'b' }] }
		});
		expect(state.refreshing).toBe(true);

		pending[1].resolve(page('a'));
		await flush();
		expect(state.status).toMatchObject({ kind: 'ready', page: { items: [{ id: 'a' }] } });
		expect(state.refreshing).toBe(false);
		expect(list).toHaveBeenCalledTimes(2);
	});

	test('load() (navegación) sigue pasando por loading aunque hubiera datos', async () => {
		const { ctx, pending } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].resolve(page('a'));
		await first;
		void state.load(ctx, type, { ...view, page: 2 });
		expect(state.status.kind).toBe('loading');
		expect(state.refreshing).toBe(false);
	});

	test('un error de recarga se muestra como error (no se queda la tabla vieja)', async () => {
		const { ctx, pending } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].resolve(page('a'));
		await first;
		state.reload();
		pending[1].reject(VegaError.network());
		await flush();
		expect(state.status).toMatchObject({ kind: 'error', error: { kind: 'network' } });
		expect(state.refreshing).toBe(false);
	});

	test('una respuesta vieja que llega después de otra más nueva no la pisa', async () => {
		const { ctx, pending } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].resolve(page('a'));
		await first;
		state.reload(); // pending[1]
		state.reload(); // pending[2]
		pending[2].resolve(page('nuevo'));
		await flush();
		pending[1].resolve(page('viejo'));
		await flush();
		expect(state.status).toMatchObject({ kind: 'ready', page: { items: [{ id: 'nuevo' }] } });
		expect(state.refreshing).toBe(false);
	});

	test('auth-expired en la recarga va al overlay global y apaga `refreshing`', async () => {
		const { ctx, pending, reportError } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].resolve(page('a'));
		await first;
		state.reload();
		pending[1].reject(VegaError.authExpired());
		await flush();
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(state.status.kind).toBe('ready');
		expect(state.refreshing).toBe(false);
	});

	test('un fallo de red marca el transporte caído SIN banner (no llama a reportError)', async () => {
		const { ctx, pending, reportError, reportConnectivity } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].reject(VegaError.network());
		await first;
		expect(state.status).toMatchObject({ kind: 'error', error: { kind: 'network' } });
		expect(reportConnectivity).toHaveBeenCalledTimes(1);
		expect(reportConnectivity).toHaveBeenCalledWith(false);
		expect(reportError).not.toHaveBeenCalled();
	});

	test('falla por red y un «Reintentar» que funciona marca el transporte recuperado', async () => {
		const { ctx, pending, reportConnectivity } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].reject(VegaError.network());
		await first;
		expect(reportConnectivity).toHaveBeenLastCalledWith(false);
		state.retry();
		pending[1].resolve(page('a'));
		await flush();
		expect(state.status.kind).toBe('ready');
		expect(reportConnectivity).toHaveBeenCalledTimes(2);
		expect(reportConnectivity).toHaveBeenLastCalledWith(true);
	});

	test('un error que no es de red solo va al panel del listado: ni reportError ni conectividad', async () => {
		const { ctx, pending, reportError, reportConnectivity } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].reject(VegaError.backend('boom'));
		await first;
		expect(state.status).toMatchObject({ kind: 'error', error: { kind: 'backend' } });
		expect(reportError).not.toHaveBeenCalled();
		expect(reportConnectivity).not.toHaveBeenCalled();
	});

	test('retry() desde error sí vuelve a loading (no hay tabla que conservar)', async () => {
		const { ctx, pending } = makeCtx();
		const state = createListState();
		const first = state.load(ctx, type, view);
		pending[0].reject(VegaError.network());
		await first;
		expect(state.status.kind).toBe('error');
		state.retry();
		expect(state.status.kind).toBe('loading');
	});
});
