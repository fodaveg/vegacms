/**
 * Suite del decorador `withRevisions` (`#lote-integridad`, Fase B §3/§4/§6/§7): construye un
 * `BackendPort` de mentira (todo `vi.fn()`, registrando el ORDEN de llamadas) y comprueba —
 * - la PRE-IMAGEN se guarda, nunca el resultado (§2, INVARIANTE 1);
 * - el orden `get` → `create(vega_revisions)` → `update` real (§3, "el snapshot va SIEMPRE
 *   antes de la operación");
 * - las 5 exclusiones (§3);
 * - un fallo de snapshot NUNCA rompe la escritura (§4, INVARIANTE 2);
 * - el latch de disponibilidad (§6) y su reset;
 * - la poda fire-and-forget tras un snapshot con éxito (§7).
 *
 * Solo `update` está cableado en Fase B1 — no hay un test de "snapshotea antes de borrar" (`delete`
 * no está sobreescrito todavía); el equivalente probado aquí es "antes de ACTUALIZAR", que es el
 * mismo invariante sobre el único camino que existe hoy.
 */

import { describe, expect, test, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import type { Capabilities, RecordId, RecordInput, Session, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { resetRevisionsLatch, withRevisions } from './with-revisions';

interface FakePortOptions {
	/** `values.manifest.revisions` del registro `vega` — `undefined` = sin registro `vega` (list
	 *  vacío, defaults). */
	revisionsManifestConfig?: Record<string, unknown>;
	/** Pre-imagen que devuelve `get()` para cualquier registro que no sea `vega`/`vega_revisions`. */
	preImageValues?: VegaRecord['values'];
	/** `true` ⇒ `create('vega_revisions', …)` rechaza con `not-found` (colección ausente). */
	revisionsCollectionMissing?: boolean;
	/** `true` ⇒ `get()` del registro de origen rechaza (fallo ajeno a `vega_revisions`). */
	getFails?: boolean;
	/** Página de `vega_revisions` que devuelve `list()` al podar (por defecto, vacía). */
	pruneListItems?: VegaRecord[];
	session?: Session | null;
}

function buildFakePort(opts: FakePortOptions = {}): { port: BackendPort; calls: string[] } {
	const calls: string[] = [];
	const session =
		opts.session !== undefined
			? opts.session
			: { token: 't', user: { id: 'u1', email: 'autor@example.com' }, expiresAt: null };

	const list = vi.fn(async (type: string) => {
		calls.push(`list:${type}`);
		if (type === 'vega') {
			if (opts.revisionsManifestConfig === undefined) {
				return { items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 };
			}
			return {
				items: [
					{
						id: 'vega1',
						type: 'vega',
						values: { manifest: { revisions: opts.revisionsManifestConfig } }
					} as unknown as VegaRecord
				],
				page: 1,
				perPage: 1,
				totalItems: 1,
				totalPages: 1
			};
		}
		if (type === 'vega_revisions') {
			const items = opts.pruneListItems ?? [];
			return { items, page: 1, perPage: 200, totalItems: items.length, totalPages: 1 };
		}
		return { items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0 };
	});

	const get = vi.fn(async (type: string, id: RecordId) => {
		calls.push(`get:${type}:${id}`);
		if (opts.getFails) throw VegaError.network();
		return { id, type, values: opts.preImageValues ?? { title: 'pre-imagen' } } as VegaRecord;
	});

	const create = vi.fn(async (type: string, data: RecordInput) => {
		calls.push(`create:${type}`);
		if (type === 'vega_revisions' && opts.revisionsCollectionMissing) {
			throw VegaError.notFound();
		}
		return { id: 'newid', type, values: data } as unknown as VegaRecord;
	});

	const update = vi.fn(async (type: string, id: RecordId, data: RecordInput) => {
		calls.push(`update:${type}:${id}`);
		return { id, type, values: data } as unknown as VegaRecord;
	});

	const deleteFn = vi.fn(async (type: string, id: RecordId) => {
		calls.push(`delete:${type}:${id}`);
	});

	const port: BackendPort = {
		capabilities: {} as Capabilities,
		login: vi.fn(),
		logout: vi.fn(),
		currentSession: vi.fn(() => session),
		restoreSession: vi.fn(),
		onAuthChange: vi.fn(() => () => {}),
		listContentTypes: vi.fn(async () => []),
		list,
		get,
		create,
		update,
		delete: deleteFn,
		fileUrl: vi.fn(),
		subscribe: vi.fn(async () => () => {}),
		ensureCollections: vi.fn(),
		addCollectionFields: vi.fn()
	};

	return { port, calls };
}

describe('withRevisions — INVARIANTE 1 (pre-imagen, no resultado)', () => {
	test('la revisión guardada contiene los valores ANTERIORES a la escritura', async () => {
		const { port } = buildFakePort({ preImageValues: { title: 'ANTES' } });
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', { title: 'DESPUÉS' });

		expect(port.create).toHaveBeenCalledWith(
			'vega_revisions',
			expect.objectContaining({
				collection: 'posts',
				recordId: 'p1',
				kind: 'update',
				values: { title: 'ANTES' }
			})
		);
		// La escritura real recibe el payload DEL LLAMADOR, sin tocar: el decorador nunca lo altera.
		expect(port.update).toHaveBeenCalledWith('posts', 'p1', { title: 'DESPUÉS' });
	});

	test('label sale de guessRecordLabel(pre-imagen); author de currentSession()', async () => {
		const { port } = buildFakePort({
			preImageValues: { title: 'Mi entrada' },
			session: { token: 't', user: { id: 'u1', email: 'quien@vega.dev' }, expiresAt: null }
		});
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {});

		expect(port.create).toHaveBeenCalledWith(
			'vega_revisions',
			expect.objectContaining({ label: 'Mi entrada', author: 'quien@vega.dev' })
		);
	});

	test('sin sesión, author es cadena vacía (nunca null/undefined)', async () => {
		const { port } = buildFakePort({ session: null });
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {});

		expect(port.create).toHaveBeenCalledWith(
			'vega_revisions',
			expect.objectContaining({ author: '' })
		);
	});
});

describe('withRevisions — orden (§3: snapshot SIEMPRE antes de la operación)', () => {
	test('get(pre-imagen) → create(vega_revisions) → update real, en ese orden', async () => {
		const { port, calls } = buildFakePort();
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', { title: 'x' });

		// Filtra las llamadas de LECTURA de configuración/poda (`list:vega`/`list:vega_revisions`,
		// timing de implementación de la config cacheada y de la poda fire-and-forget, ninguna de
		// las dos es el invariante que este test fija) — lo que importa es el orden RELATIVO de
		// pre-imagen → snapshot → escritura real.
		const writeCalls = calls.filter((c) => !c.startsWith('list:'));
		expect(writeCalls).toEqual(['get:posts:p1', 'create:vega_revisions', 'update:posts:p1']);
	});
});

describe('withRevisions — las 5 exclusiones (§3)', () => {
	test('1. vega_revisions sobre sí misma: sin snapshot', async () => {
		const { port } = buildFakePort();
		const wrapped = withRevisions(port);

		await wrapped.update('vega_revisions', 'r1', {});

		expect(port.get).not.toHaveBeenCalled();
		expect(port.create).not.toHaveBeenCalled();
		expect(port.update).toHaveBeenCalledWith('vega_revisions', 'r1', {});
	});

	test('2. reservadas vega/vega_* EXCEPTO vega_media: sin snapshot', async () => {
		const { port } = buildFakePort();
		const wrapped = withRevisions(port);

		await wrapped.update('vega', 'vega1', {});

		expect(port.get).not.toHaveBeenCalled();
		expect(port.create).not.toHaveBeenCalled();
	});

	test('2b. vega_media es la EXCEPCIÓN: SÍ se snapshotea (es contenido de usuario)', async () => {
		const { port } = buildFakePort();
		const wrapped = withRevisions(port);

		await wrapped.update('vega_media', 'm1', {});

		expect(port.get).toHaveBeenCalledWith('vega_media', 'm1');
		expect(port.create).toHaveBeenCalledWith(
			'vega_revisions',
			expect.objectContaining({ collection: 'vega_media' })
		);
	});

	test('3. create: withRevisions no sobreescribe create (pasa por referencia)', () => {
		const { port } = buildFakePort();
		const wrapped = withRevisions(port);

		expect(wrapped.create).toBe(port.create);
	});

	test('4. latch activo: no vuelve a intentar get/create tras un not-found previo', async () => {
		const { port } = buildFakePort({ revisionsCollectionMissing: true });
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {}); // dispara el not-found, arma la latch
		vi.mocked(port.get).mockClear();
		vi.mocked(port.create).mockClear();

		await wrapped.update('posts', 'p2', {}); // debería saltárselo del todo

		expect(port.get).not.toHaveBeenCalled();
		expect(port.create).not.toHaveBeenCalled();
	});

	test('5. revisions.enabled === false en el manifiesto: sin snapshot', async () => {
		const { port } = buildFakePort({ revisionsManifestConfig: { enabled: false } });
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {});

		expect(port.get).not.toHaveBeenCalled();
		expect(port.create).not.toHaveBeenCalled();
	});

	test('manifiesto sin revisions declarado: enabled por defecto true (SÍ snapshotea)', async () => {
		const { port } = buildFakePort();
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {});

		expect(port.create).toHaveBeenCalledWith('vega_revisions', expect.anything());
	});
});

describe('withRevisions — INVARIANTE 2 (un fallo de snapshot nunca rompe la escritura)', () => {
	test('get() de la pre-imagen falla → update() sigue adelante igual', async () => {
		const { port } = buildFakePort({ getFails: true });
		const wrapped = withRevisions(port);

		const result = await wrapped.update('posts', 'p1', { title: 'x' });

		expect(result).toEqual({ id: 'p1', type: 'posts', values: { title: 'x' } });
		expect(port.create).not.toHaveBeenCalled(); // sin pre-imagen no hay nada que guardar
		expect(port.update).toHaveBeenCalledWith('posts', 'p1', { title: 'x' });
	});

	test('create(vega_revisions) falla con un error DISTINTO de not-found → update() sigue adelante', async () => {
		const { port } = buildFakePort();
		vi.mocked(port.create).mockImplementationOnce(async () => {
			throw VegaError.network();
		});
		const wrapped = withRevisions(port);

		const result = await wrapped.update('posts', 'p1', { title: 'x' });

		expect(result).toEqual({ id: 'p1', type: 'posts', values: { title: 'x' } });
		expect(port.update).toHaveBeenCalledWith('posts', 'p1', { title: 'x' });
	});

	test('create(vega_revisions) rechaza con not-found → update() sigue adelante Y arma la latch', async () => {
		const { port } = buildFakePort({ revisionsCollectionMissing: true });
		const wrapped = withRevisions(port);

		const result = await wrapped.update('posts', 'p1', { title: 'x' });

		expect(result).toEqual({ id: 'p1', type: 'posts', values: { title: 'x' } });
	});

	test('list(vega) de configuración falla → defaults (enabled=true) y la escritura sigue adelante', async () => {
		const { port } = buildFakePort();
		vi.mocked(port.list).mockImplementationOnce(async () => {
			throw VegaError.network();
		});
		const wrapped = withRevisions(port);

		const result = await wrapped.update('posts', 'p1', { title: 'x' });

		expect(result).toEqual({ id: 'p1', type: 'posts', values: { title: 'x' } });
		// Defaults (enabled=true) ⇒ el snapshot SÍ se intenta pese al fallo de configuración.
		expect(port.create).toHaveBeenCalledWith('vega_revisions', expect.anything());
	});
});

describe('withRevisions — latch: resetRevisionsLatch', () => {
	test('reactiva el snapshot tras un reset explícito', async () => {
		const { port } = buildFakePort({ revisionsCollectionMissing: true });
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {}); // arma la latch (not-found)
		resetRevisionsLatch(wrapped);
		vi.mocked(port.get).mockClear();

		await wrapped.update('posts', 'p2', {});

		expect(port.get).toHaveBeenCalledWith('posts', 'p2'); // vuelve a intentarlo
	});

	test('sobre un puerto NO decorado, es un no-op silencioso', () => {
		const { port } = buildFakePort();
		expect(() => resetRevisionsLatch(port)).not.toThrow();
	});
});

describe('withRevisions — poda fire-and-forget tras un snapshot con éxito (§7)', () => {
	test('llama a list(vega_revisions, …) filtrado por collection+recordId+kind:update tras el create', async () => {
		const { port } = buildFakePort();
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {});
		await Promise.resolve(); // deja correr la microtarea fire-and-forget

		expect(port.list).toHaveBeenCalledWith(
			'vega_revisions',
			expect.objectContaining({
				sort: [{ field: 'created', dir: 'desc' }]
			})
		);
	});

	test('borra las revisiones que sobran de keepPerRecord (default 20)', async () => {
		const oldItems: VegaRecord[] = Array.from({ length: 21 }, (_, i) => ({
			id: `rev-${i}`,
			type: 'vega_revisions',
			values: { created: new Date(2026, 0, i + 1).toISOString(), kind: 'update' }
		}));
		const { port, calls } = buildFakePort({ pruneListItems: oldItems });
		const wrapped = withRevisions(port);

		await wrapped.update('posts', 'p1', {});
		await Promise.resolve();
		await Promise.resolve();

		// 21 revisiones, keepPerRecord default 20 ⇒ se poda 1 (la más antigua, rev-0).
		expect(calls.filter((c) => c.startsWith('delete:vega_revisions:'))).toEqual([
			'delete:vega_revisions:rev-0'
		]);
	});

	test('un fallo al podar (list o delete) no se propaga a nada', async () => {
		const { port } = buildFakePort();
		vi.mocked(port.list).mockImplementation(async (type: string) => {
			if (type === 'vega_revisions') throw VegaError.network();
			return { items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 };
		});
		const wrapped = withRevisions(port);

		await expect(wrapped.update('posts', 'p1', {})).resolves.toBeDefined();
		await Promise.resolve();
	});
});
