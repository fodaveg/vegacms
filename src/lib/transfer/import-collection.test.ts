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

describe('createCachingFileFetcher', () => {
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
