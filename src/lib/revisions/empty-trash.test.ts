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
import { MAX_PER_PAGE, type Query } from '$lib/backend/query';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
import { emptyTrash, EMPTY_TRASH_CONCURRENCY } from './empty-trash';

/** Puerto falso con un array mutable de entradas de papelera — `list` respeta `perPage` (como
 *  cualquier adaptador real) y `delete` las quita de verdad, así que una segunda página SOLO
 *  aparece si la primera vuelta se comió TODO su lote. `failAtCall` (1-based, sobre las llamadas a
 *  `delete`) simula el fallo a mitad que el bucle debe cortar en el acto. */
function buildFakeTrashPort(
	count: number,
	opts: { failAtCall?: number; deleteLatencyMs?: number } = {}
): {
	port: BackendPort;
	stats: { listCalls: number; peakInFlight: number; queries: Query[] };
	deleteCalls: string[];
} {
	let entries: string[] = Array.from({ length: count }, (_, i) => `rev_${i}`);
	const stats = { listCalls: 0, peakInFlight: 0, queries: [] as Query[] };
	let inFlight = 0;
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
			if (query) stats.queries.push(query);
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
			inFlight++;
			stats.peakInFlight = Math.max(stats.peakInFlight, inFlight);
			try {
				if (opts.deleteLatencyMs) await new Promise((r) => setTimeout(r, opts.deleteLatencyMs));
				if (opts.failAtCall === calls) throw VegaError.network();
				entries = entries.filter((e) => e !== id);
			} finally {
				inFlight--;
			}
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
		// Con borrado concurrente, las entradas que ya estaban en vuelo cuando falló la 3ª también
		// terminan: lo que importa es que se cuente lo borrado de verdad, la que falló NO cuente
		// como borrada y quede reflejada en `remaining`, y se informe el fallo.
		expect(result.deleted).toBeGreaterThanOrEqual(2);
		expect(result.deleted).toBeLessThanOrEqual(4);
		expect(result.deleted + result.remaining).toBe(5);
		expect(result.remaining).toBeGreaterThanOrEqual(1);
		expect(result.failure).toBeInstanceOf(VegaError);
	});

	test('el fallo NO dispara una segunda vuelta de `list` (aborta, no reintenta)', async () => {
		const { port, stats } = buildFakeTrashPort(5, { failAtCall: 1 });
		await emptyTrash(port);
		expect(stats.listCalls).toBe(1);
	});
});

describe('emptyTrash — lote 9: solo ids y borrado con concurrencia acotada', () => {
	test('el listado pide solo ids (sin los snapshots) y el borrado solapa peticiones con techo fijo', async () => {
		const { port, stats } = buildFakeTrashPort(40, { deleteLatencyMs: 2 });

		const result = await emptyTrash(port);

		// Medido ANTES del cambio: proyección ausente (snapshot completo de cada entrada) y pico
		// de 1 borrado en vuelo (en serie). Después: `fields: []` y pico = EMPTY_TRASH_CONCURRENCY.
		console.info(
			`[l9-papelera] fields=${JSON.stringify(stats.queries[0]?.fields)} picoEnVuelo=${stats.peakInFlight}`
		);
		expect(result).toEqual({ deleted: 40, remaining: 0, failure: null });
		expect(stats.queries.every((q) => Array.isArray(q.fields) && q.fields.length === 0)).toBe(true);
		expect(stats.peakInFlight).toBeGreaterThan(1);
		expect(stats.peakInFlight).toBeLessThanOrEqual(EMPTY_TRASH_CONCURRENCY);
	});

	test('un fallo a mitad no lanza más borrados, y borradas + restantes siempre suman el total', async () => {
		const { port, stats, deleteCalls } = buildFakeTrashPort(40, {
			failAtCall: 5,
			deleteLatencyMs: 2
		});

		const result = await emptyTrash(port);

		expect(result.failure).toBeInstanceOf(VegaError);
		expect(result.deleted + result.remaining).toBe(40);
		expect(result.deleted).toBeLessThan(40);
		// Tras el fallo solo terminan los que ya estaban en vuelo: nada nuevo se lanza.
		expect(deleteCalls.length).toBeLessThanOrEqual(5 + EMPTY_TRASH_CONCURRENCY - 1);
		expect(stats.listCalls).toBe(1);
	});
});
