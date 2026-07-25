/**
 * Suite del motor de referencias (`#lote-integridad`, Fase A). `list` se dobla con `vi.fn()`: el
 * motor solo depende de esa función (ver cabecera de `references.ts`), así que estos tests nunca
 * montan un puerto real ni Svelte.
 */

import { describe, expect, test, vi } from 'vitest';
import type { ContentType, Field, Page, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { findReferences } from './references';

/** Base común de `FieldBase` para no repetirla en cada fixture (ningún test de este módulo mira
 *  `required`/`presentable`/`hidden`/`unique`, así que un valor fijo basta). */
function fieldBase() {
	return { required: false, readonly: false, presentable: false, hidden: false, unique: false };
}

function relationField(name: string, target: string, multiple: boolean): Field {
	return { ...fieldBase(), name, type: 'relation', target, multiple };
}

function textField(name: string): Field {
	return { ...fieldBase(), name, type: 'text', subtype: 'plain' };
}

function richtextField(name: string): Field {
	return { ...fieldBase(), name, type: 'richtext', subtype: 'html' };
}

function jsonField(name: string): Field {
	return { ...fieldBase(), name, type: 'json' };
}

function urlField(name: string): Field {
	return { ...fieldBase(), name, type: 'url' };
}

function emailField(name: string): Field {
	return { ...fieldBase(), name, type: 'email' };
}

function type(name: string, fields: Field[], readonly = false): ContentType {
	return { name, readonly, fields };
}

function record(collection: string, id: string): VegaRecord {
	return { id, type: collection, values: {} };
}

function page(items: VegaRecord[], totalItems: number): Page<VegaRecord> {
	return { items, page: 1, perPage: 5, totalItems, totalPages: Math.ceil(totalItems / 5) };
}

describe('findReferences — vía relación', () => {
	test('relación SINGLE: filtra con "eq" y agrupa por colección', async () => {
		const posts = type('posts', [relationField('author', 'authors', false)]);
		const list = vi.fn().mockResolvedValue(page([record('posts', 'p1')], 1));

		const report = await findReferences([posts], { collection: 'authors', id: 'a1' }, list);

		expect(list).toHaveBeenCalledTimes(1);
		expect(list).toHaveBeenCalledWith('posts', {
			filter: { kind: 'cond', field: 'author', op: 'eq', value: 'a1' },
			perPage: 5
		});
		expect(report.partial).toBe(false);
		expect(report.groups).toEqual([
			{
				collection: 'posts',
				readonly: false,
				matches: [
					{
						via: 'relation',
						status: 'ok',
						fields: ['author'],
						count: 1,
						sample: [record('posts', 'p1')]
					}
				]
			}
		]);
	});

	test('relación MÚLTIPLE: filtra con "in: [id]", nunca "eq" sobre el array', async () => {
		const posts = type('posts', [relationField('tags', 'categories', true)]);
		const list = vi.fn().mockResolvedValue(page([], 0));

		await findReferences([posts], { collection: 'categories', id: 'c1' }, list);

		expect(list).toHaveBeenCalledWith('posts', {
			filter: { kind: 'cond', field: 'tags', op: 'in', value: ['c1'] },
			perPage: 5
		});
	});

	test('varios campos de la MISMA colección apuntando al destino: una sola query, combinada con OR', async () => {
		const posts = type('posts', [
			relationField('author', 'people', false),
			relationField('editor', 'people', false)
		]);
		const list = vi.fn().mockResolvedValue(page([record('posts', 'p1')], 1));

		await findReferences([posts], { collection: 'people', id: 'x1' }, list);

		expect(list).toHaveBeenCalledTimes(1);
		expect(list).toHaveBeenCalledWith('posts', {
			filter: {
				kind: 'group',
				combinator: 'or',
				nodes: [
					{ kind: 'cond', field: 'author', op: 'eq', value: 'x1' },
					{ kind: 'cond', field: 'editor', op: 'eq', value: 'x1' }
				]
			},
			perPage: 5
		});
	});

	test('colección sin ningún campo hacia el destino: ni se consulta', async () => {
		const other = type('other', [textField('title')]);
		const list = vi.fn().mockResolvedValue(page([], 0));

		const report = await findReferences([other], { collection: 'people', id: 'x1' }, list);

		expect(list).not.toHaveBeenCalled();
		expect(report.groups).toEqual([]);
		expect(report.partial).toBe(false);
	});

	test('colecciones reservadas (vega/vega_*) nunca son origen, aunque tengan el campo', async () => {
		const vega = type('vega', [relationField('site', 'people', false)]);
		const media = type('vega_media', [relationField('owner', 'people', false)]);
		const list = vi.fn();

		await findReferences([vega, media], { collection: 'people', id: 'x1' }, list);

		expect(list).not.toHaveBeenCalled();
	});

	test('un acierto con count 0 y sin error no aporta nada: se descarta', async () => {
		const posts = type('posts', [relationField('author', 'people', false)]);
		const list = vi.fn().mockResolvedValue(page([], 0));

		const report = await findReferences([posts], { collection: 'people', id: 'x1' }, list);

		expect(report.groups).toEqual([]);
		expect(report.partial).toBe(false);
	});

	test('caso límite "usado en 200 sitios": count real (totalItems) distinto del tamaño de muestra', async () => {
		const posts = type('posts', [relationField('author', 'people', false)]);
		// `sample` (perPage 5) nunca es el recuento real: el motor SIEMPRE reporta `totalItems`,
		// nunca `items.length` — la UI (`ReferencesSummary`, "y N más") depende de que ambos
		// números puedan diferir de verdad.
		const sample = [record('posts', 'p1'), record('posts', 'p2')];
		const list = vi.fn().mockResolvedValue(page(sample, 200));

		const report = await findReferences([posts], { collection: 'people', id: 'x1' }, list);

		const match = report.groups[0].matches[0];
		expect(match).toMatchObject({ status: 'ok', count: 200 });
		if (match.status === 'ok') {
			expect(match.sample).toHaveLength(2);
			expect(match.count - match.sample.length).toBe(198);
		}
	});

	test('una vista (readonly) que referencia se muestra igual, marcada readonly', async () => {
		const overview = type('overview', [relationField('subject', 'people', false)], true);
		const list = vi.fn().mockResolvedValue(page([record('overview', 'o1')], 1));

		const report = await findReferences([overview], { collection: 'people', id: 'x1' }, list);

		expect(report.groups[0].readonly).toBe(true);
	});
});

describe('findReferences — vía URL (solo vega_media)', () => {
	test('busca "contains <filename>" en campos text/richtext, combinados con OR', async () => {
		const posts = type('posts', [textField('body'), richtextField('notes'), jsonField('meta')]);
		const list = vi.fn().mockResolvedValue(page([record('posts', 'p1')], 1));

		const report = await findReferences(
			[posts],
			{ collection: 'vega_media', id: 'm1', fileRef: 'foto_ab12.png' },
			list
		);

		expect(list).toHaveBeenCalledTimes(1);
		expect(list).toHaveBeenCalledWith('posts', {
			filter: {
				kind: 'group',
				combinator: 'or',
				nodes: [
					{ kind: 'cond', field: 'body', op: 'contains', value: 'foto_ab12.png' },
					{ kind: 'cond', field: 'notes', op: 'contains', value: 'foto_ab12.png' }
				]
			},
			perPage: 5
		});
		expect(report.groups[0].matches[0].via).toBe('url');
	});

	test('un campo `url` TAMBIÉN entra en la búsqueda: es el caso para el que existe esta vía', async () => {
		// Regresión de un hallazgo de code-review: el filtro se quedaba en `text`/`richtext`, así que
		// una URL de asset pegada a mano en un campo `url` (widget `Url.svelte`, de primera clase) no
		// se buscaba NUNCA y el panel contestaba "nadie le apunta" sobre un asset sí enlazado —
		// exactamente el fallo caro que este motor existe para evitar. El criterio vive ahora en
		// `isTextLikeField` (`$lib/list/search.ts`), compartido con el buscador del listado.
		const posts = type('posts', [
			urlField('externalCover'),
			emailField('contact'),
			jsonField('meta')
		]);
		const list = vi.fn().mockResolvedValue(page([record('posts', 'p1')], 1));

		await findReferences(
			[posts],
			{ collection: 'vega_media', id: 'm1', fileRef: 'foto_ab12.png' },
			list
		);

		// Una sola query (el coste no cambia: son condiciones del mismo `or`), y `json` sigue fuera.
		expect(list).toHaveBeenCalledTimes(1);
		expect(list).toHaveBeenCalledWith('posts', {
			filter: {
				kind: 'group',
				combinator: 'or',
				nodes: [
					{ kind: 'cond', field: 'externalCover', op: 'contains', value: 'foto_ab12.png' },
					{ kind: 'cond', field: 'contact', op: 'contains', value: 'foto_ab12.png' }
				]
			},
			perPage: 5
		});
	});

	test('sin fileRef, la vía URL se omite entera (nunca se consulta)', async () => {
		const posts = type('posts', [textField('body')]);
		const list = vi.fn();

		await findReferences([posts], { collection: 'vega_media', id: 'm1' }, list);

		expect(list).not.toHaveBeenCalled();
	});

	test('destino que NO es vega_media: la vía URL nunca aplica aunque haya fileRef', async () => {
		const posts = type('posts', [textField('body')]);
		const list = vi.fn();

		await findReferences([posts], { collection: 'people', id: 'x1', fileRef: 'foto.png' }, list);

		expect(list).not.toHaveBeenCalled();
	});

	test('relación + URL en la misma colección: dos queries, un único grupo con dos matches', async () => {
		const posts = type('posts', [relationField('cover', 'vega_media', false), textField('body')]);
		const list = vi
			.fn()
			.mockResolvedValueOnce(page([record('posts', 'p1')], 1)) // relation
			.mockResolvedValueOnce(page([record('posts', 'p2')], 1)); // url

		const report = await findReferences(
			[posts],
			{ collection: 'vega_media', id: 'm1', fileRef: 'foto.png' },
			list
		);

		expect(list).toHaveBeenCalledTimes(2);
		expect(report.groups).toHaveLength(1);
		expect(report.groups[0].matches).toHaveLength(2);
		expect(report.groups[0].matches.map((m) => m.via).sort()).toEqual(['relation', 'url']);
	});
});

describe('findReferences — degradado por colección, nunca global', () => {
	test('una colección forbidden no tumba el resto; el resultado marca partial', async () => {
		const posts = type('posts', [relationField('author', 'people', false)]);
		const pages = type('pages', [relationField('owner', 'people', false)]);
		const list = vi
			.fn()
			.mockImplementationOnce(async () => {
				throw VegaError.forbidden();
			})
			.mockResolvedValueOnce(page([record('pages', 'g1')], 1));

		const report = await findReferences([posts, pages], { collection: 'people', id: 'x1' }, list);

		expect(report.partial).toBe(true);
		const postsGroup = report.groups.find((g) => g.collection === 'posts');
		const pagesGroup = report.groups.find((g) => g.collection === 'pages');
		expect(postsGroup?.matches[0]).toEqual({
			via: 'relation',
			status: 'degraded',
			fields: ['author'],
			reason: 'forbidden'
		});
		expect(pagesGroup?.matches[0].status).toBe('ok');
	});

	test('un error que no es VegaError degrada con reason "unknown", sin reventar', async () => {
		const posts = type('posts', [relationField('author', 'people', false)]);
		const list = vi.fn().mockRejectedValue(new Error('boom'));

		const report = await findReferences([posts], { collection: 'people', id: 'x1' }, list);

		expect(report.partial).toBe(true);
		expect(report.groups[0].matches[0]).toMatchObject({ status: 'degraded', reason: 'unknown' });
	});
});

describe('findReferences — sampleSize', () => {
	test('perPage por defecto es 5; se puede sobrescribir con opts.sampleSize', async () => {
		const posts = type('posts', [relationField('author', 'people', false)]);
		const list = vi.fn().mockResolvedValue(page([], 0));

		await findReferences([posts], { collection: 'people', id: 'x1' }, list, { sampleSize: 2 });

		expect(list).toHaveBeenCalledWith('posts', expect.objectContaining({ perPage: 2 }));
	});
});
