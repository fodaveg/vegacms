/**
 * Contrato de las tres lecturas que el lote «menos peticiones» recortó con `Query.fields` y con
 * `id in [...]`, medido por la forma EXACTA de consulta que arma producción (no una parecida):
 *
 * - `buildTitlesByIdsQuery` (`$lib/form/widgets/relation-search`): `id in` + `perPage` = tamaño
 *   del lote + proyección del campo título.
 * - `emptyTrash` (`$lib/revisions/empty-trash`): `fields: []` (solo `id`) con `totalItems` fiable.
 * - `buildGlobalSearchQuery` (`$lib/shell/global-search`): búsqueda + proyección.
 *
 * Corre IDÉNTICA contra `memory` y contra PocketBase real (cada fichero hermano pasa su `makePort`,
 * que debe devolver un puerto autenticado sobre el dataset canónico del fixture).
 */

import { describe, expect, test } from 'vitest';
import type { BackendPort } from '$lib/backend';
import { loadContentModel } from '$lib/model/load';
import { buildTitlesByIdsQuery } from '$lib/form/widgets/relation-search';
import { buildGlobalSearchQuery, globalSearchFields } from '$lib/shell/global-search';
import { KS_ALPHA, KS_ECHO } from './fixture';

/** Tamaño de lote con el que `Relation.svelte` resuelve títulos. */
const BATCH = 50;

const ids = (records: Array<{ id: string }>): string[] => records.map((r) => r.id).sort();

async function createBatch(port: BackendPort, prefix: string, count: number): Promise<string[]> {
	const created: string[] = [];
	for (let i = 0; i < count; i++) {
		const id = `${prefix}-${String(i).padStart(3, '0')}`;
		await port.create('kitchen_sink', { title: `Título ${id}` }, { id });
		created.push(id);
	}
	return created;
}

export function describeProjectionAndIdInContract(opts: {
	name: string;
	makePort: () => Promise<BackendPort>;
	/** `true` ⇒ el adaptador tiene los defectos de filtro medidos (barra invertida y `%`): esos
	 *  casos se declaran con `test.fails` en vez de desaparecer. */
	knownFilterDefects?: boolean;
}): void {
	const knownBackslashDefect = opts.knownFilterDefects ? test.fails : test;

	describe(`lecturas con proyección e «id in» — ${opts.name}`, () => {
		describe('buildTitlesByIdsQuery (títulos de relaciones)', () => {
			test('50 ids existentes devuelven los 50: la paginación no recorta el lote', async () => {
				const port = await opts.makePort();
				const created = await createBatch(port, 'rel', BATCH);
				const page = await port.list('kitchen_sink', buildTitlesByIdsQuery(created, ['title']));
				expect(ids(page.items)).toEqual([...created].sort());
			});

			test('totalItems del lote de 50 es 50 (no más, no menos)', async () => {
				const port = await opts.makePort();
				const created = await createBatch(port, 'rel', BATCH);
				const page = await port.list('kitchen_sink', buildTitlesByIdsQuery(created, ['title']));
				expect(page.totalItems).toBe(BATCH);
			});

			test('mezcla de ids existentes e inexistentes devuelve solo los existentes, sin error', async () => {
				const port = await opts.makePort();
				const page = await port.list(
					'kitchen_sink',
					buildTitlesByIdsQuery([KS_ALPHA, 'no-existe-1', KS_ECHO, 'no-existe-2'], ['title'])
				);
				expect(ids(page.items)).toEqual([KS_ALPHA, KS_ECHO].sort());
			});

			test('solo ids inexistentes devuelve una página vacía', async () => {
				const port = await opts.makePort();
				const page = await port.list(
					'kitchen_sink',
					buildTitlesByIdsQuery(['no-existe-1'], ['title'])
				);
				expect(page.items).toEqual([]);
			});

			test.each([
				["comilla simple: x' || 1=1 || '", "x' || 1=1 || '"],
				['comilla doble: x" || 1=1 || "', 'x" || 1=1 || "'],
				['espacio: ks alpha', 'ks alpha'],
				['porcentaje: %', '%'],
				['cadena vacía', '']
			])(
				'id hostil (%s) no rompe la consulta ni casa registros de más',
				async (_label, hostile) => {
					const port = await opts.makePort();
					const page = await port.list(
						'kitchen_sink',
						buildTitlesByIdsQuery([hostile, KS_ALPHA], ['title'])
					);
					expect(ids(page.items)).toEqual([KS_ALPHA]);
				}
			);

			test('varios ids hostiles sin barra invertida juntos no devuelven ningún registro', async () => {
				const port = await opts.makePort();
				const page = await port.list(
					'kitchen_sink',
					buildTitlesByIdsQuery(["x' || 1=1 || '", '%', 'a b'], ['title'])
				);
				expect(page.totalItems).toBe(0);
			});

			// DEFECTO REAL medido en PocketBase (`pb.filter` solo escapa la comilla, no la barra
			// invertida): un id terminado en `\` deja la cadena sin cerrar y el servidor responde 400.
			// `memory` lo resuelve bien. `test.fails` deja la suite verde mientras exista y se pone
			// ROJO el día que se arregle, para quitar la marca.
			knownBackslashDefect('id con barra invertida no rompe la consulta', async () => {
				const port = await opts.makePort();
				const page = await port.list(
					'kitchen_sink',
					buildTitlesByIdsQuery(['\\', KS_ALPHA], ['title'])
				);
				expect(ids(page.items)).toEqual([KS_ALPHA]);
			});

			knownBackslashDefect('id con barra invertida y comilla no rompe la consulta', async () => {
				const port = await opts.makePort();
				const page = await port.list(
					'kitchen_sink',
					buildTitlesByIdsQuery(["\\'", KS_ALPHA], ['title'])
				);
				expect(ids(page.items)).toEqual([KS_ALPHA]);
			});

			test('la respuesta trae id y SOLO el campo pedido en values', async () => {
				const port = await opts.makePort();
				const page = await port.list(
					'kitchen_sink',
					buildTitlesByIdsQuery([KS_ALPHA, KS_ECHO], ['title'])
				);
				expect(page.items.map((r) => [r.id, Object.keys(r.values)])).toEqual(
					[KS_ALPHA, KS_ECHO].sort().map((id) => [id, ['title']])
				);
			});

			test('el título proyectado coincide con el del registro completo', async () => {
				const port = await opts.makePort();
				const page = await port.list('kitchen_sink', buildTitlesByIdsQuery([KS_ECHO], ['title']));
				expect(page.items[0]?.values.title).toBe('amanecer');
			});
		});

		describe('fields: [] (vaciado de papelera: solo ids)', () => {
			test('devuelve los registros con id y values vacío', async () => {
				const port = await opts.makePort();
				const page = await port.list('kitchen_sink', { fields: [] });
				expect(page.items.map((r) => [typeof r.id, r.values])).toEqual(
					page.items.map(() => ['string', {}])
				);
			});

			test('devuelve los mismos ids que sin proyección', async () => {
				const port = await opts.makePort();
				const bare = await port.list('kitchen_sink', { fields: [] });
				const full = await port.list('kitchen_sink', {});
				expect(ids(bare.items)).toEqual(ids(full.items));
			});

			test('totalItems es el recuento real aunque la página sea más corta que el total', async () => {
				const port = await opts.makePort();
				await createBatch(port, 'trash', 12);
				const full = await port.list('kitchen_sink', {});
				const page = await port.list('kitchen_sink', { fields: [], perPage: 5 });
				expect([page.items.length, page.totalItems]).toEqual([5, full.totalItems]);
			});

			test('con filtro (como `kind = delete`) filtra por un campo no proyectado', async () => {
				const port = await opts.makePort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'eq', value: 'Zebra' },
					fields: []
				});
				expect([page.items.length, page.totalItems, page.items[0]?.values]).toEqual([1, 1, {}]);
			});

			test('colección sin coincidencias: página vacía y totalItems 0', async () => {
				const port = await opts.makePort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'eq', value: 'nadie-se-llama-asi' },
					fields: []
				});
				expect([page.items, page.totalItems]).toEqual([[], 0]);
			});
		});

		describe('buildGlobalSearchQuery (búsqueda global con proyección)', () => {
			async function kitchenSinkType(port: BackendPort) {
				const model = await loadContentModel(port);
				const type = model.types.find((t) => t.name === 'kitchen_sink');
				if (!type) throw new Error('kitchen_sink no está en el modelo');
				return type;
			}

			test('devuelve los aciertos del término', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, 'amanecer'));
				expect(ids(page.items)).toEqual([KS_ECHO]);
			});

			test('values lleva solo los campos proyectados por globalSearchFields', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, 'amanecer'));
				expect(Object.keys(page.items[0]?.values ?? {}).sort()).toEqual(
					[...globalSearchFields(type)].sort()
				);
			});

			test('el título proyectado es el del acierto', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, 'amanecer'));
				expect(page.items[0]?.values[type.titleField!]).toBe('amanecer');
			});

			test('término sin aciertos: ninguno y totalItems 0', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, 'zzzqqq'));
				expect([page.items, page.totalItems]).toEqual([[], 0]);
			});

			test('un término con comillas y operadores (sin %) casa como texto literal', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list(
					'kitchen_sink',
					buildGlobalSearchQuery(type, `' and " and || && ~`)
				);
				expect(page.items.map((r) => r.id)).toEqual(['ks-charlie']);
			});

			// DEFECTO REAL medido en PocketBase: `contains` con `%` en el valor lo interpreta como
			// comodín LIKE y deja de envolver el patrón (`%` casa los 5 registros; `~ % test` no casa
			// el título que lo contiene). `memory` lo trata como texto. Ver `knownBackslashDefect`.
			const knownLikeDefect = opts.knownFilterDefects ? test.fails : test;

			knownLikeDefect('un término con % casa solo los títulos que lo contienen', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, '%'));
				expect(page.items.map((r) => r.id)).toEqual(['ks-charlie']);
			});

			knownLikeDefect('un término con % en medio sigue siendo una subcadena literal', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, `~ % test`));
				expect(page.items.map((r) => r.id)).toEqual(['ks-charlie']);
			});

			knownBackslashDefect('un término con barra invertida no rompe la búsqueda', async () => {
				const port = await opts.makePort();
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, '\\'));
				expect(page.items).toEqual([]);
			});

			test('con más aciertos que el tope por colección, trae el tope y totalItems el total', async () => {
				const port = await opts.makePort();
				await createBatch(port, 'busq', 8);
				const type = await kitchenSinkType(port);
				const page = await port.list('kitchen_sink', buildGlobalSearchQuery(type, 'Título busq'));
				expect([page.items.length, page.totalItems]).toEqual([5, 8]);
			});
		});
	});
}
