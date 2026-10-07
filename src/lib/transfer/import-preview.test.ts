/**
 * Tests unitarios del clasificador de la vista previa (§4.2/§4.3 del contrato, ver la cabecera de
 * `import-preview.ts`): los tres estados —CREA, PISA, BLOQUEADO (permiso y relación colgante)— y
 * el orden topológico simple.
 */

import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { TransferRecord } from './record-serializer';
import {
	classifyCollectionImport,
	levelByRelations,
	outgoingRelationKeys,
	partitionByOutgoingRelations,
	relationKey,
	topologicalWriteOrder
} from './import-preview';

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
	fields: Field[],
	overrides: Partial<ResolvedContentType> = {}
): ResolvedContentType {
	return {
		schema: { name: 'posts', readonly: false, fields },
		name: 'posts',
		label: 'Posts',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: 'title',
		subtitleField: null,
		slugField: null,
		statusField: null,
		statusLabels: null,
		orderField: null,
		defaultSort: null,
		previewUrl: null,
		fields: [],
		listFields: ['title'],
		fieldGroups: [],
		editorRail: false,
		...overrides
	};
}

function record(id: string, values: TransferRecord['values']): TransferRecord {
	return { id, values };
}

describe('classifyCollectionImport', () => {
	it('id que no existe en destino → CREA', () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { title: 'Uno' })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([{ id: 'r1', status: 'create', reasons: [] }]);
	});

	it('id que YA existe en destino, sin ninguna razón de bloqueo → PISA', () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { title: 'Uno' })],
			existingIds: new Set(['r1']),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([{ id: 'r1', status: 'overwrite', reasons: [] }]);
	});

	it('hideCreate conserva altas y actualizaciones permitidas en importación', () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })], {
			hideCreate: true
		});
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('new', { title: 'Nuevo' }), record('old', { title: 'Editado' })],
			existingIds: new Set(['old']),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{ id: 'new', status: 'create', reasons: [] },
			{ id: 'old', status: 'overwrite', reasons: [] }
		]);
	});

	it('sin permissions.create → BLOQUEADO (id nuevo)', () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })], {
			permissions: { ...ALL_PERMISSIONS, create: false }
		});
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { title: 'Uno' })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{ id: 'r1', status: 'blocked', reasons: [{ kind: 'no-create-permission' }] }
		]);
	});

	it('sin permissions.update → BLOQUEADO (id existente)', () => {
		const type = contentType([field({ name: 'title', type: 'text', subtype: 'plain' })], {
			permissions: { ...ALL_PERMISSIONS, update: false }
		});
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { title: 'Uno' })],
			existingIds: new Set(['r1']),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{ id: 'r1', status: 'blocked', reasons: [{ kind: 'no-update-permission' }] }
		]);
	});

	it('relación colgante (single): id que ni viaja en el fichero ni existe en destino → BLOQUEADO', () => {
		const type = contentType([
			field({ name: 'author', type: 'relation', target: 'authors', multiple: false })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { author: 'ghost' })],
			existingIds: new Set(),
			relationTargetExists: () => false,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{
				id: 'r1',
				status: 'blocked',
				reasons: [{ kind: 'dangling-relation', field: 'author', targetId: 'ghost' }]
			}
		]);
	});

	it('relación colgante (multiple): cada id colgante produce su propia razón', () => {
		const type = contentType([
			field({ name: 'tags', type: 'relation', target: 'tagz', multiple: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { tags: ['ok', 'ghost1', 'ghost2'] })],
			existingIds: new Set(),
			relationTargetExists: (_target, id) => id === 'ok',
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{
				id: 'r1',
				status: 'blocked',
				reasons: [
					{ kind: 'dangling-relation', field: 'tags', targetId: 'ghost1' },
					{ kind: 'dangling-relation', field: 'tags', targetId: 'ghost2' }
				]
			}
		]);
	});

	it('relación vacía (sin valor) nunca cuenta como colgante', () => {
		const type = contentType([
			field({ name: 'author', type: 'relation', target: 'authors', multiple: false })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { author: '' })],
			existingIds: new Set(),
			relationTargetExists: () => false,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([{ id: 'r1', status: 'create', reasons: [] }]);
	});

	it('campo file NO required con valor irresoluble NUNCA bloquea', () => {
		const type = contentType([field({ name: 'cover', type: 'file', multiple: false })]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { cover: { file: 'a.jpg', url: 'https://x/a.jpg' } })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => false
		});
		expect(entries).toEqual([{ id: 'r1', status: 'create', reasons: [] }]);
	});

	it('campo file REQUIRED con valor no traíble → BLOQUEADO', () => {
		const type = contentType([
			field({ name: 'cover', type: 'file', multiple: false, required: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { cover: { file: 'a.jpg', url: 'https://x/a.jpg' } })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => false
		});
		expect(entries).toEqual([
			{
				id: 'r1',
				status: 'blocked',
				reasons: [{ kind: 'unreachable-required-file', field: 'cover' }]
			}
		]);
	});

	it('campo file REQUIRED VACÍO en el fichero → BLOQUEADO con required-empty (fix de code-review: antes se dejaba pasar y fallaba a mitad de la escritura)', () => {
		const type = contentType([
			field({ name: 'cover', type: 'file', multiple: false, required: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { cover: '' })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			// `requiredFileReachable` ni se consulta para un campo VACÍO (es "required-empty", no
			// "unreachable-required-file") — `false` a propósito, para probar que no se usa aquí.
			requiredFileReachable: () => false
		});
		expect(entries).toEqual([
			{ id: 'r1', status: 'blocked', reasons: [{ kind: 'required-empty', field: 'cover' }] }
		]);
	});

	it('campo text/select/date/relation REQUIRED vacío → BLOQUEADO con required-empty, para CUALQUIER tipo (fix de code-review)', () => {
		const type = contentType([
			field({ name: 'title', type: 'text', subtype: 'plain', required: true }),
			field({
				name: 'status',
				type: 'select',
				options: ['a', 'b'],
				multiple: false,
				required: true
			}),
			field({
				name: 'author',
				type: 'relation',
				target: 'authors',
				multiple: false,
				required: true
			})
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { title: '', status: null, author: '' })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{
				id: 'r1',
				status: 'blocked',
				reasons: [
					{ kind: 'required-empty', field: 'title' },
					{ kind: 'required-empty', field: 'status' },
					{ kind: 'required-empty', field: 'author' }
				]
			}
		]);
	});

	it('un campo `number` REQUIRED en 0 → BLOQUEADO (landmine de PocketBase: rechaza el 0 aunque sea legítimo, ver cabecera del módulo)', () => {
		const type = contentType([
			field({ name: 'rating', type: 'number', integer: true, required: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { rating: 0 })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([
			{ id: 'r1', status: 'blocked', reasons: [{ kind: 'required-empty', field: 'rating' }] }
		]);
	});

	it('un campo `number` REQUIRED con un valor no-cero pasa sin bloquear', () => {
		const type = contentType([
			field({ name: 'rating', type: 'number', integer: true, required: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { rating: 4 })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([{ id: 'r1', status: 'create', reasons: [] }]);
	});

	it('un campo required READONLY (created/updated) nunca bloquea: Vega no lo escribe, el backend lo rellena solo', () => {
		const type = contentType([
			field({ name: 'created', type: 'date', required: true, readonly: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { created: '' })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => true
		});
		expect(entries).toEqual([{ id: 'r1', status: 'create', reasons: [] }]);
	});

	it('un registro puede acumular varias razones de bloqueo a la vez', () => {
		const type = contentType(
			[field({ name: 'author', type: 'relation', target: 'authors', multiple: false })],
			{ permissions: { ...ALL_PERMISSIONS, create: false } }
		);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { author: 'ghost' })],
			existingIds: new Set(),
			relationTargetExists: () => false,
			requiredFileReachable: () => true
		});
		expect(entries[0].reasons).toEqual([
			{ kind: 'no-create-permission' },
			{ kind: 'dangling-relation', field: 'author', targetId: 'ghost' }
		]);
	});
});

describe('partitionByOutgoingRelations / topologicalWriteOrder', () => {
	const fields: Field[] = [
		field({ name: 'title', type: 'text', subtype: 'plain' }),
		field({ name: 'author', type: 'relation', target: 'posts', multiple: false })
	];

	it('separa los registros SIN relación saliente de los que sí tienen, preservando el orden dentro de cada lote', () => {
		const a = record('a', { title: 'A' }); // sin relación
		const b = record('b', { title: 'B', author: 'a' }); // con relación
		const c = record('c', { title: 'C' }); // sin relación

		const { withoutOutgoing, withOutgoing } = partitionByOutgoingRelations([a, b, c], fields);
		expect(withoutOutgoing).toEqual([a, c]);
		expect(withOutgoing).toEqual([b]);
		expect(topologicalWriteOrder([a, b, c], fields)).toEqual([a, c, b]);
	});

	it('un registro CON el destino de su relación TAMBIÉN en el fichero: el destino (sin salientes) va primero', () => {
		// b.author -> a: para que la relación interna resuelva, `a` debe escribirse antes que `b`.
		const a = record('a', { title: 'A' });
		const b = record('b', { title: 'B', author: 'a' });

		expect(topologicalWriteOrder([b, a], fields)).toEqual([a, b]);
	});

	it('sin ninguna relación saliente en ningún registro, el orden es estable (todos en un único lote)', () => {
		const a = record('a', { title: 'A' });
		const b = record('b', { title: 'B' });
		expect(topologicalWriteOrder([b, a], fields)).toEqual([b, a]);
	});
});

describe('levelByRelations', () => {
	const fields: Field[] = [
		field({ name: 'title', type: 'text', subtype: 'plain' }),
		field({ name: 'refs', type: 'relation', target: 'posts', multiple: true })
	];

	/** Niveles de ids de `records` (todos de la colección `posts`). */
	function levels(records: TransferRecord[]): string[][] {
		const nodes = records.map((r) => ({
			item: r.id,
			key: relationKey('posts', r.id),
			deps: outgoingRelationKeys(r, fields)
		}));
		return levelByRelations(nodes);
	}

	it('cadena A→B→C desordenada: un nivel por eslabón, destino primero', () => {
		const a = record('a', { refs: ['b'] });
		const b = record('b', { refs: ['c'] });
		const c = record('c', {});
		expect(levels([a, b, c])).toEqual([['c'], ['b'], ['a']]);
	});

	it('diamante A→B, A→C, B→D, C→D: D, luego B y C juntos, luego A', () => {
		const a = record('a', { refs: ['b', 'c'] });
		const b = record('b', { refs: ['d'] });
		const c = record('c', { refs: ['d'] });
		const d = record('d', {});
		expect(levels([a, b, c, d])).toEqual([['d'], ['b', 'c'], ['a']]);
	});

	it('auto-referencia: va a un último nivel, tras los demás', () => {
		const self = record('s', { refs: ['s'] });
		const x = record('x', {});
		expect(levels([self, x])).toEqual([['x'], ['s']]);
	});

	it('ciclo de dos: los dos juntos en el último nivel; lo que no depende de ellos va antes', () => {
		const a = record('a', { refs: ['b'] });
		const b = record('b', { refs: ['a'] });
		const x = record('x', {});
		expect(levels([a, b, x])).toEqual([['x'], ['a', 'b']]);
	});

	it('una relación a un registro que NO está en el lote no ordena nada', () => {
		const a = record('a', { refs: ['fuera'] });
		expect(levels([a])).toEqual([['a']]);
	});

	it('sin nodos no hay niveles', () => {
		expect(levels([])).toEqual([]);
	});
});
