/**
 * Tests unitarios del orquestador de la Fase 2 (§4.2/§4.3/§4.4 del contrato, ver la cabecera de
 * `import-collection.ts`): existencia por lotes, relación colgante resuelta contra el fichero Y
 * contra destino, campo `file` `required` irresoluble, orden de escritura, aislamiento de fallos
 * (`allSettled`) y la caché de `fetchFile`. El "puerto" es un doble mínimo (`ImportPort`), nada de
 * adaptadores reales — el camino real contra PocketBase lo cubre `tests/contract/
 * pocketbase.contract.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { Field, Page, RecordId, RecordInput, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { VegaError } from '$lib/backend/errors';
import type { ResolvedContentType } from '$lib/model/types';
import type { ResolvedImportCollection } from './import-format';
import type { TransferFileValue, TransferRecord } from './record-serializer';
import {
	buildImportPreview,
	createCachingFileFetcher,
	IMPORT_WRITE_CONCURRENCY,
	runImport,
	type ImportPort
} from './import-collection';

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
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: null,
		subtitleField: null,
		slugField: null,
		statusField: null,
		statusLabels: null,
		orderField: null,
		defaultSort: null,
		previewUrl: null,
		fields: [],
		listFields: [],
		fieldGroups: [],
		editorRail: false,
		...overrides
	};
}

function record(id: string, values: TransferRecord['values']): TransferRecord {
	return { id, values };
}

/** Doble mínimo de `ImportPort`: `list` resuelve el filtro `id in [...]` sobre `existing`
 *  (por colección), `create`/`update` registran cada escritura en `writes` — `create` sin `opts.id`
 *  es un bug del llamador en este módulo (Fase 2 SIEMPRE lo pasa), así que lanza si falta. */
function fakePort(existing: Record<string, string[]>) {
	const listCalls: { type: string; query: Query }[] = [];
	const writes: { op: 'create' | 'update'; type: string; id: RecordId; data: RecordInput }[] = [];
	const failingIds = new Set<string>();

	const port: ImportPort = {
		list: async (type: string, query?: Query): Promise<Page<VegaRecord>> => {
			listCalls.push({ type, query: query! });
			const ids = existing[type] ?? [];
			const filterIds =
				query?.filter && query.filter.kind === 'cond' && query.filter.op === 'in'
					? (query.filter.value as string[])
					: [];
			const items = ids
				.filter((id) => filterIds.includes(id))
				.map((id) => ({ id, type, values: {} }));
			return {
				items,
				page: 1,
				perPage: query?.perPage ?? 30,
				totalItems: items.length,
				totalPages: items.length > 0 ? 1 : 0
			};
		},
		create: async (type: string, data: RecordInput, opts?: { id?: RecordId }) => {
			if (!opts?.id) throw new Error('create() sin opts.id: bug del llamador');
			if (failingIds.has(opts.id)) throw VegaError.validation({}, 'fallo simulado');
			writes.push({ op: 'create', type, id: opts.id, data });
			return { id: opts.id, type, values: data } as VegaRecord;
		},
		update: async (type: string, id: RecordId, data: RecordInput) => {
			if (failingIds.has(id)) throw VegaError.validation({}, 'fallo simulado');
			writes.push({ op: 'update', type, id, data });
			return { id, type, values: data } as VegaRecord;
		}
	};

	return { port, listCalls, writes, failingIds };
}

describe('buildImportPreview', () => {
	it('resuelve existencia EN LOTES (> MAX_PER_PAGE ids → varias llamadas a list)', async () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const ids = Array.from({ length: 250 }, (_, i) => `p${i}`);
		const { port, listCalls } = fakePort({ posts: [] });
		const collections: ResolvedImportCollection[] = [
			{
				collection: { type: 'posts', records: ids.map((id) => record(id, { title: id })) },
				contentType: type
			}
		];

		const preview = await buildImportPreview(port, collections);

		expect(preview.collections[0].entries).toHaveLength(250);
		expect(preview.collections[0].entries.every((e) => e.status === 'create')).toBe(true);
		// 250 ids en lotes de MAX_PER_PAGE (200): 2 llamadas de existencia (200 + 50).
		const existenceCalls = listCalls.filter((c) => c.type === 'posts');
		expect(existenceCalls).toHaveLength(Math.ceil(250 / MAX_PER_PAGE));
	});

	it('id ya existente → PISA; id nuevo → CREA, en la misma colección', async () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const { port } = fakePort({ posts: ['p1'] });
		const collections: ResolvedImportCollection[] = [
			{
				collection: {
					type: 'posts',
					records: [record('p1', { title: 'Ya existe' }), record('p2', { title: 'Nuevo' })]
				},
				contentType: type
			}
		];

		const preview = await buildImportPreview(port, collections);

		expect(preview.collections[0].entries).toEqual([
			{ id: 'p1', status: 'overwrite', reasons: [] },
			{ id: 'p2', status: 'create', reasons: [] }
		]);
	});

	it('relación colgante resuelta CONTRA EL FICHERO: el destino viaja en OTRA colección del mismo documento', async () => {
		const authorType = contentType('authors', [
			field({ name: 'name', type: 'text', subtype: 'plain' })
		]);
		const postType = contentType('posts', [
			field({ name: 'author', type: 'relation', target: 'authors', multiple: false })
		]);
		const { port, listCalls } = fakePort({ posts: [], authors: [] });
		const collections: ResolvedImportCollection[] = [
			{
				collection: { type: 'authors', records: [record('a1', { name: 'Ada' })] },
				contentType: authorType
			},
			{
				collection: { type: 'posts', records: [record('p1', { author: 'a1' })] },
				contentType: postType
			}
		];

		const preview = await buildImportPreview(port, collections);

		const postEntry = preview.collections.find((c) => c.type === 'posts')!.entries[0];
		expect(postEntry).toEqual({ id: 'p1', status: 'create', reasons: [] });
		// Una única llamada a `list` sobre `authors` (la existencia de SU PROPIA entrada, `a1`): la
		// resolución de la relación colgante no necesita otra, `a1` ya viaja en el propio fichero.
		expect(listCalls.filter((c) => c.type === 'authors')).toHaveLength(1);
	});

	it('relación colgante resuelta CONTRA DESTINO: el destino no viaja en el fichero pero ya existe', async () => {
		const postType = contentType('posts', [
			field({ name: 'author', type: 'relation', target: 'authors', multiple: false })
		]);
		const { port } = fakePort({ posts: [], authors: ['a1'] });
		const collections: ResolvedImportCollection[] = [
			{
				collection: { type: 'posts', records: [record('p1', { author: 'a1' })] },
				contentType: postType
			}
		];

		const preview = await buildImportPreview(port, collections);

		expect(preview.collections[0].entries).toEqual([{ id: 'p1', status: 'create', reasons: [] }]);
	});

	it('relación colgante DE VERDAD: ni en el fichero ni en destino → BLOQUEADO', async () => {
		const postType = contentType('posts', [
			field({ name: 'author', type: 'relation', target: 'authors', multiple: false })
		]);
		const { port } = fakePort({ posts: [], authors: [] });
		const collections: ResolvedImportCollection[] = [
			{
				collection: { type: 'posts', records: [record('p1', { author: 'ghost' })] },
				contentType: postType
			}
		];

		const preview = await buildImportPreview(port, collections);

		expect(preview.collections[0].entries).toEqual([
			{
				id: 'p1',
				status: 'blocked',
				reasons: [{ kind: 'dangling-relation', field: 'author', targetId: 'ghost' }]
			}
		]);
	});

	it('campo file required que fetchFile no puede traer → BLOQUEADO', async () => {
		const type = contentType('posts', [
			field({ name: 'cover', type: 'file', multiple: false, required: true })
		]);
		const { port } = fakePort({ posts: [] });
		const transferFile: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };
		const collections: ResolvedImportCollection[] = [
			{
				collection: { type: 'posts', records: [record('p1', { cover: transferFile })] },
				contentType: type
			}
		];

		const preview = await buildImportPreview(port, collections, async () => null);

		expect(preview.collections[0].entries).toEqual([
			{
				id: 'p1',
				status: 'blocked',
				reasons: [{ kind: 'unreachable-required-file', field: 'cover' }]
			}
		]);
	});
});

describe('runImport', () => {
	it('CREA → create() con opts.id; PISA confirmado → update(); BLOQUEADO nunca se escribe', async () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })], {
			permissions: { ...ALL_PERMISSIONS, create: false }
		});
		const { port, writes } = fakePort({ posts: ['p2'] });
		const preview = {
			collections: [
				{
					type: 'posts',
					contentType: type,
					records: [record('p1', { title: 'Nuevo' }), record('p2', { title: 'Ya existe' })],
					entries: [
						{
							id: 'p1',
							status: 'blocked' as const,
							reasons: [{ kind: 'no-create-permission' as const }]
						},
						{ id: 'p2', status: 'overwrite' as const, reasons: [] }
					]
				}
			]
		};

		const report = await runImport(port, preview, { overwriteConfirmed: true });

		expect(writes).toEqual([
			{ op: 'update', type: 'posts', id: 'p2', data: { title: 'Ya existe' } }
		]);
		expect(report).toMatchObject({
			createdCount: 0,
			updatedCount: 1,
			failedCount: 0,
			skippedCount: 1,
			success: true
		});
	});

	it('PISA SIN confirmar: se salta (no se escribe), cuenta como skipped', async () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const { port, writes } = fakePort({ posts: ['p1'] });
		const preview = {
			collections: [
				{
					type: 'posts',
					contentType: type,
					records: [record('p1', { title: 'Ya existe' })],
					entries: [{ id: 'p1', status: 'overwrite' as const, reasons: [] }]
				}
			]
		};

		const report = await runImport(port, preview, { overwriteConfirmed: false });

		expect(writes).toEqual([]);
		expect(report).toMatchObject({
			createdCount: 0,
			updatedCount: 0,
			skippedCount: 1,
			success: false
		});
	});

	it('orden de escritura: el destino de una relación interna se escribe ANTES que quien lo referencia', async () => {
		const type = contentType('posts', [
			field({ name: 'title', type: 'text', subtype: 'plain' }),
			field({ name: 'author', type: 'relation', target: 'posts', multiple: false })
		]);
		const { port, writes } = fakePort({ posts: [] });
		const a = record('a', { title: 'A' });
		const b = record('b', { title: 'B', author: 'a' });
		const preview = {
			collections: [
				{
					type: 'posts',
					contentType: type,
					// Orden del FICHERO deliberadamente al revés (b antes que a): el orden de escritura
					// no debe depender del orden de `records`.
					records: [b, a],
					entries: [
						{ id: 'b', status: 'create' as const, reasons: [] },
						{ id: 'a', status: 'create' as const, reasons: [] }
					]
				}
			]
		};

		await runImport(port, preview, { overwriteConfirmed: true });

		expect(writes.map((w) => w.id)).toEqual(['a', 'b']);
	});

	it('un fallo de escritura NO aborta los demás (allSettled) y el informe nunca dice éxito', async () => {
		const type = contentType('posts', [field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const { port, writes, failingIds } = fakePort({ posts: [] });
		failingIds.add('bad');
		const preview = {
			collections: [
				{
					type: 'posts',
					contentType: type,
					records: [record('good', { title: 'Bien' }), record('bad', { title: 'Mal' })],
					entries: [
						{ id: 'good', status: 'create' as const, reasons: [] },
						{ id: 'bad', status: 'create' as const, reasons: [] }
					]
				}
			]
		};

		const report = await runImport(port, preview, { overwriteConfirmed: true });

		expect(writes.map((w) => w.id)).toEqual(['good']);
		expect(report.createdCount).toBe(1);
		expect(report.failedCount).toBe(1);
		expect(report.outcomes.find((o) => o.id === 'bad')).toMatchObject({ status: 'failed' });
		expect(report.success).toBe(false); // §4.3: nunca "importado" si algo falló
	});

	it('campos file: el registro escrito omite el binario que no se pudo traer, y lo reporta en missingFiles', async () => {
		const type = contentType('posts', [field({ name: 'cover', type: 'file', multiple: false })]);
		const { port, writes } = fakePort({ posts: [] });
		const transferFile: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };
		const preview = {
			collections: [
				{
					type: 'posts',
					contentType: type,
					records: [record('p1', { cover: transferFile })],
					entries: [{ id: 'p1', status: 'create' as const, reasons: [] }]
				}
			]
		};

		const report = await runImport(port, preview, { overwriteConfirmed: true }, async () => null);

		// `null`, NUNCA `''` (bug real corregido en `record-deserializer.ts`: PocketBase rechaza un
		// `''` en un campo `file` single como `vega_foreign_file_ref`, ver su cabecera).
		expect(writes[0].data.cover).toBeNull();
		expect(report.outcomes[0]).toMatchObject({ status: 'created', missingFiles: ['cover'] });
	});
});

describe('runImport: pool de escrituras', () => {
	const postsType = () =>
		contentType('posts', [
			field({ name: 'title', type: 'text', subtype: 'plain' }),
			field({ name: 'author', type: 'relation', target: 'posts', multiple: false })
		]);

	function previewOf(records: TransferRecord[]) {
		return {
			collections: [
				{
					type: 'posts',
					contentType: postsType(),
					records,
					entries: records.map((r) => ({ id: r.id, status: 'create' as const, reasons: [] }))
				}
			]
		};
	}

	it('nunca hay más de IMPORT_WRITE_CONCURRENCY escrituras en vuelo y se escriben TODAS con su id', async () => {
		const { port, writes } = fakePort({ posts: [] });
		let inFlight = 0;
		let peak = 0;
		const baseCreate = port.create;
		port.create = async (type, data, opts) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight -= 1;
			return baseCreate(type, data, opts);
		};
		const records = Array.from({ length: 25 }, (_, i) => record(`r${i}`, { title: `T${i}` }));

		const report = await runImport(port, previewOf(records), { overwriteConfirmed: true });

		expect(peak).toBe(IMPORT_WRITE_CONCURRENCY);
		expect(writes.map((w) => w.id).sort()).toEqual(records.map((r) => r.id).sort());
		expect(report).toMatchObject({ createdCount: 25, failedCount: 0, success: true });
		// El informe conserva el orden de entrada, no el de terminación.
		expect(report.outcomes.map((o) => o.id)).toEqual(records.map((r) => r.id));
	});

	it('el lote con relaciones salientes no arranca hasta que TERMINA el de sus destinos', async () => {
		const { port } = fakePort({ posts: [] });
		const events: string[] = [];
		const baseCreate = port.create;
		port.create = async (type, data, opts) => {
			events.push(`start:${opts!.id}`);
			await new Promise((resolve) => setTimeout(resolve, opts!.id!.startsWith('t') ? 10 : 1));
			events.push(`end:${opts!.id}`);
			return baseCreate(type, data, opts);
		};
		const targets = Array.from({ length: 6 }, (_, i) => record(`t${i}`, { title: 'T' }));
		const referrers = Array.from({ length: 6 }, (_, i) =>
			record(`x${i}`, { title: 'X', author: 't0' })
		);

		await runImport(port, previewOf([...referrers, ...targets]), { overwriteConfirmed: true });

		const lastTargetEnd = Math.max(...targets.map((t) => events.indexOf(`end:${t.id}`)));
		const firstReferrerStart = Math.min(...referrers.map((r) => events.indexOf(`start:${r.id}`)));
		expect(lastTargetEnd).toBeLessThan(firstReferrerStart);
	});

	it('A→B→C: cada destino se escribe ANTES que quien lo apunta aunque B tarde más', async () => {
		const { port } = fakePort({ posts: [] });
		const events: string[] = [];
		const baseCreate = port.create;
		port.create = async (type, data, opts) => {
			events.push(`start:${opts!.id}`);
			await new Promise((resolve) => setTimeout(resolve, opts!.id === 'b' ? 10 : 1));
			events.push(`end:${opts!.id}`);
			return baseCreate(type, data, opts);
		};
		// a → b → c: con dos lotes, a y b irían juntos y concurrentes.
		const a = record('a', { title: 'A', author: 'b' });
		const b = record('b', { title: 'B', author: 'c' });
		const c = record('c', { title: 'C' });

		const report = await runImport(port, previewOf([a, b, c]), { overwriteConfirmed: true });

		expect(events).toEqual(['start:c', 'end:c', 'start:b', 'end:b', 'start:a', 'end:a']);
		expect(report).toMatchObject({ createdCount: 3, failedCount: 0, success: true });
	});

	it('un fallo en medio del pool se cuenta como failed y no tapa al resto', async () => {
		const { port, failingIds } = fakePort({ posts: [] });
		failingIds.add('r3');
		failingIds.add('r9');
		const records = Array.from({ length: 12 }, (_, i) => record(`r${i}`, { title: 'T' }));

		const report = await runImport(port, previewOf(records), { overwriteConfirmed: true });

		expect(report).toMatchObject({ createdCount: 10, failedCount: 2, success: false });
		expect(report.outcomes).toHaveLength(12);
	});

	it('onProgress informa 0/total y luego cada registro terminado (omitidos fuera del total)', async () => {
		const { port, failingIds } = fakePort({ posts: [] });
		failingIds.add('r1');
		const records = Array.from({ length: 5 }, (_, i) => record(`r${i}`, { title: 'T' }));
		const preview = previewOf(records);
		preview.collections[0].entries[4] = {
			id: 'r4',
			status: 'blocked' as never,
			reasons: [{ kind: 'no-create-permission' }] as never
		};
		const seen: { done: number; total: number }[] = [];

		await runImport(port, preview, {
			overwriteConfirmed: true,
			onProgress: (p) => seen.push({ ...p })
		});

		expect(seen[0]).toEqual({ done: 0, total: 4 });
		expect(seen.at(-1)).toEqual({ done: 4, total: 4 });
		expect(seen).toHaveLength(5); // fallido incluido: cuenta como hecho
	});

	it('suelta de la caché el fichero de cada registro al terminar (éxito o fallo)', async () => {
		const type = contentType('posts', [field({ name: 'cover', type: 'file', multiple: false })]);
		const { port, failingIds } = fakePort({ posts: [] });
		failingIds.add('bad');
		const released: string[] = [];
		const fetcher = Object.assign(async (f: TransferFileValue) => new File(['x'], f.file), {
			release: (url: string) => released.push(url)
		});
		const records = [
			record('ok', { cover: { file: 'a.jpg', url: 'https://x/a.jpg' } }),
			record('bad', { cover: { file: 'b.jpg', url: 'https://x/b.jpg' } })
		];
		const preview = {
			collections: [
				{
					type: 'posts',
					contentType: type,
					records,
					entries: records.map((r) => ({ id: r.id, status: 'create' as const, reasons: [] }))
				}
			]
		};

		await runImport(port, preview, { overwriteConfirmed: true }, fetcher);

		expect(released.sort()).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
	});
});

describe('createCachingFileFetcher', () => {
	it('release(url) suelta la entrada: la siguiente petición vuelve a traerla', async () => {
		let calls = 0;
		const fetcher = createCachingFileFetcher(async (file) => {
			calls += 1;
			return new File(['x'], file.file);
		});
		const value: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };
		await fetcher(value);
		fetcher.release?.(value.url);
		await fetcher(value);
		expect(calls).toBe(2);
	});

	it('el mismo url se trae UNA sola vez aunque se pida varias veces', async () => {
		let calls = 0;
		const fetcher = createCachingFileFetcher(async (file) => {
			calls += 1;
			return new File(['x'], file.file);
		});
		const transferFile: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };

		await fetcher(transferFile);
		await fetcher(transferFile);
		await fetcher({ ...transferFile });

		expect(calls).toBe(1);
	});

	it('un fallo (null) también se cachea, no se reintenta', async () => {
		let calls = 0;
		const fetcher = createCachingFileFetcher(async () => {
			calls += 1;
			return null;
		});
		const transferFile: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };

		expect(await fetcher(transferFile)).toBeNull();
		expect(await fetcher(transferFile)).toBeNull();
		expect(calls).toBe(1);
	});
});
