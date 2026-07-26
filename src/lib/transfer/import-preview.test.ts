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
	partitionByOutgoingRelations,
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

	it('campo file REQUIRED pero VACÍO en el fichero no lo bloquea aquí (lo rechazará la propia escritura)', () => {
		const type = contentType([
			field({ name: 'cover', type: 'file', multiple: false, required: true })
		]);
		const entries = classifyCollectionImport({
			contentType: type,
			records: [record('r1', { cover: '' })],
			existingIds: new Set(),
			relationTargetExists: () => true,
			requiredFileReachable: () => false
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
