/**
 * `/papelera` montada con un puerto de mentira: una página que llega vacía con `totalItems > 0`
 * (borrar el último de la página, o un `?page=` que ya no existe) lleva a la última página con
 * datos en vez de pintar «papelera vacía» sin paginación para volver.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort, Page, VegaRecord } from '$lib/backend';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';

const goto = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ value: '' }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL(`http://localhost/papelera${search.value}`);
		}
	}
}));

import TrashPage from '../../routes/papelera/+page.svelte';

function revision(id: string): VegaRecord {
	return {
		id,
		type: VEGA_REVISIONS_COLLECTION.name,
		values: { kind: 'delete', collection: 'posts', recordId: `r-${id}`, label: `Entrada ${id}` }
	} as VegaRecord;
}

let mounted: { target: HTMLElement; instance: Record<string, never> } | null = null;

function mountPage(list: (type: string, query: { page?: number }) => Promise<Page<VegaRecord>>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string) => key,
		locale: 'es',
		model: {
			types: [{ name: VEGA_REVISIONS_COLLECTION.name, schema: { fields: [] } }],
			revisions: { enabled: true, trashDays: 30 }
		},
		port: {
			capabilities: { explicitRecordId: true },
			list: vi.fn(list),
			delete: vi.fn(async () => {})
		} as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		nav: { toSettings: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(TrashPage as never, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	}) as Record<string, never>;
	mounted = { target, instance };
	return { target, ctx };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
	await tick();
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	search.value = '';
	vi.clearAllMocks();
});

describe('/papelera: página fuera de rango', () => {
	test('página vacía con total > 0: va a la última página con datos', async () => {
		search.value = '?page=3';
		mountPage(async (_type, query) => ({
			items: [],
			page: query.page ?? 1,
			perPage: 30,
			totalItems: 40,
			totalPages: 2
		}));
		await settle();

		expect(goto).toHaveBeenCalledTimes(1);
		expect(goto).toHaveBeenCalledWith('/papelera?page=2');
	});

	test('si la última página es la 1, vuelve a /papelera sin parámetro', async () => {
		search.value = '?page=2';
		mountPage(async (_type, query) => ({
			items: [],
			page: query.page ?? 1,
			perPage: 30,
			totalItems: 5,
			totalPages: 1
		}));
		await settle();

		expect(goto).toHaveBeenCalledWith('/papelera');
	});

	test('una papelera realmente vacía NO redirige y dice que está vacía', async () => {
		const { target } = mountPage(async () => ({
			items: [],
			page: 1,
			perPage: 30,
			totalItems: 0,
			totalPages: 0
		}));
		await settle();

		expect(goto).not.toHaveBeenCalled();
		expect(target.querySelector('[data-trash-state="empty"]')).not.toBeNull();
	});

	test('una página con datos NO redirige', async () => {
		const { target } = mountPage(async () => ({
			items: [revision('a')],
			page: 1,
			perPage: 30,
			totalItems: 1,
			totalPages: 1
		}));
		await settle();

		expect(goto).not.toHaveBeenCalled();
		expect(target.querySelector('[data-trash-state="ready"]')).not.toBeNull();
	});

	test('filas que no parsean NO cuentan como página vacía (no hay salto)', async () => {
		mountPage(async () => ({
			items: [{ id: 'x', type: VEGA_REVISIONS_COLLECTION.name, values: { kind: 'raro' } }],
			page: 1,
			perPage: 30,
			totalItems: 31,
			totalPages: 2
		}));
		await settle();

		expect(goto).not.toHaveBeenCalled();
	});
});
