/**
 * Suite de `emptyTrash` (`#lote-integridad`, Fase B2, fix de code-review): un `BackendPort` de
 * mentira con estado real (un array mutable de entradas `kind:'delete'`) para comprobar que el
 * bucle pagina de verdad — el bug que arregla este fichero era invisible con menos de
 * `MAX_PER_PAGE` (200) entradas.
 */
import { describe, expect, test } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import type { Capabilities, RecordId, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
import { emptyTrash } from './empty-trash';

/** Puerto falso con un array mutable de entradas de papelera — `list` respeta `perPage` (como
 *  cualquier adaptador real) y `delete` las quita de verdad, así que una segunda página SOLO
 *  aparece si la primera vuelta se comió TODO su lote. `failAtCall` (1-based, sobre las llamadas a
 *  `delete`) simula el fallo a mitad que el bucle debe cortar en el acto. */
function buildFakeTrashPort(
	count: number,
	opts: { failAtCall?: number } = {}
): { port: BackendPort; stats: { listCalls: number }; deleteCalls: string[] } {
	let entries: string[] = Array.from({ length: count }, (_, i) => `rev_${i}`);
	const stats = { listCalls: 0 };
	const deleteCalls: string[] = [];
	let calls = 0;

	const port: BackendPort = {
		capabilities: {} as Capabilities,
		login: async () => {
			throw new Error('no usado');
		},
		logout: async () => {},
		currentSession: () => null,
		restoreSession: async () => null,
		onAuthChange: () => () => {},
		listContentTypes: async () => [],
		async list(type, query) {
			if (type !== VEGA_REVISIONS_COLLECTION.name) throw new Error(`list inesperado: ${type}`);
			stats.listCalls++;
			const perPage = query?.perPage ?? MAX_PER_PAGE;
			const page = entries.slice(0, perPage);
			return {
				items: page.map((id) => ({ id, type, values: {} }) as unknown as VegaRecord),
				page: 1,
				perPage,
				totalItems: entries.length,
				totalPages: Math.ceil(entries.length / perPage) || 1
			};
		},
		async get() {
			throw new Error('no usado');
		},
		async create() {
			throw new Error('no usado');
		},
		async update() {
			throw new Error('no usado');
		},
		async delete(type: string, id: RecordId) {
			calls++;
			deleteCalls.push(String(id));
			if (opts.failAtCall === calls) throw VegaError.network();
			entries = entries.filter((e) => e !== id);
		},
		fileUrl: () => '',
		subscribe: async () => () => {},
		ensureCollections: async () => {
			throw new Error('no usado');
		},
		addCollectionFields: async () => {
			throw new Error('no usado');
		}
	};

	return { port, stats, deleteCalls };
}

describe('emptyTrash — sin fallos', () => {
	test('papelera ya vacía: 0 borradas, 0 restantes, sin fallo', async () => {
		const { port } = buildFakeTrashPort(0);
		const result = await emptyTrash(port);
		expect(result).toEqual({ deleted: 0, remaining: 0, failure: null });
	});

	test('menos de MAX_PER_PAGE entradas: una sola página, todas borradas', async () => {
		const { port } = buildFakeTrashPort(5);
		const result = await emptyTrash(port);
		expect(result).toEqual({ deleted: 5, remaining: 0, failure: null });
	});

	test('más de MAX_PER_PAGE entradas (el bug del review): pagina en bucle hasta agotarlas todas', async () => {
		const total = MAX_PER_PAGE * 2 + 50; // 450 con MAX_PER_PAGE=200: exige 3 páginas
		const { port, stats } = buildFakeTrashPort(total);
		const result = await emptyTrash(port);
		expect(result).toEqual({ deleted: total, remaining: 0, failure: null });
		// 3 páginas con entradas + la 4ª que confirma "ya no queda nada".
		expect(stats.listCalls).toBe(4);
	});
});

describe('emptyTrash — un fallo corta el bucle (nunca reintenta sin techo)', () => {
	test('falla borrando la 3ª entrada de 5: cuenta lo YA borrado, refleja lo que queda', async () => {
		const { port } = buildFakeTrashPort(5, { failAtCall: 3 });
		const result = await emptyTrash(port);
		expect(result.deleted).toBe(2);
		expect(result.remaining).toBe(3);
		expect(result.failure).toBeInstanceOf(VegaError);
	});

	test('el fallo NO dispara una segunda vuelta de `list` (aborta, no reintenta)', async () => {
		const { port, stats } = buildFakeTrashPort(5, { failAtCall: 1 });
		await emptyTrash(port);
		expect(stats.listCalls).toBe(1);
	});
});
