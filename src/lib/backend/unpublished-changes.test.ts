/**
 * Suite de `detectUnpublishedChanges` (lote "publicación", fase A): degradación a `null` cuando
 * ningún `ContentType` tiene un campo `updated` legible, exclusión de `vega`/colecciones
 * `readonly`, resiliencia ante una colección que falla, y la comparación real contra
 * `lastPublishedAt`.
 */

import { describe, expect, test, vi } from 'vitest';
import type { ContentType, Field, Page, VegaRecord } from './types';
import type { BackendPort } from './port';
import { detectUnpublishedChanges } from './unpublished-changes';

const updatedField: Field = {
	name: 'updated',
	type: 'date',
	readonly: true,
	required: false,
	presentable: false,
	hidden: false,
	unique: false
};

const post: ContentType = { name: 'post', readonly: false, fields: [updatedField] };
const noUpdatedField: ContentType = { name: 'settings', readonly: false, fields: [] };
const view: ContentType = { name: 'a_view', readonly: true, fields: [updatedField] };
const manifest: ContentType = { name: 'vega', readonly: false, fields: [updatedField] };

function pageOf(value: string | undefined): Page<VegaRecord> {
	const items: VegaRecord[] = value ? [{ id: 'r1', type: 'post', values: { updated: value } }] : [];
	return { items, page: 1, perPage: 1, totalItems: items.length, totalPages: items.length };
}

function fakePort(list: BackendPort['list']): BackendPort {
	return { list } as unknown as BackendPort;
}

describe('detectUnpublishedChanges', () => {
	test('ningún ContentType elegible tiene campo "updated" → degrada a null (nunca inventa false)', async () => {
		const list = vi.fn();
		const result = await detectUnpublishedChanges(fakePort(list), [noUpdatedField], null);
		expect(result).toEqual({ hasChanges: null, latestChangeAt: null });
		expect(list).not.toHaveBeenCalled();
	});

	test('excluye la colección reservada "vega" y las de solo lectura (views)', async () => {
		const list = vi.fn(async () => pageOf(undefined));
		await detectUnpublishedChanges(fakePort(list), [manifest, view], null);
		expect(list).not.toHaveBeenCalled();
	});

	test('consulta cada colección elegible ordenada -updated con perPage 1', async () => {
		const list = vi.fn(async () => pageOf('2026-07-25T10:00:00.000Z'));
		await detectUnpublishedChanges(fakePort(list), [post], null);
		expect(list).toHaveBeenCalledWith('post', {
			sort: [{ field: 'updated', dir: 'desc' }],
			page: 1,
			perPage: 1
		});
	});

	test('sin lastPublishedAt, cualquier registro encontrado cuenta como pendiente', async () => {
		const list = vi.fn(async () => pageOf('2026-07-25T10:00:00.000Z'));
		const result = await detectUnpublishedChanges(fakePort(list), [post], null);
		expect(result).toEqual({ hasChanges: true, latestChangeAt: '2026-07-25T10:00:00.000Z' });
	});

	test('compara el "updated" más reciente contra lastPublishedAt', async () => {
		const list = vi.fn(async () => pageOf('2026-07-20T08:00:00.000Z'));
		await expect(
			detectUnpublishedChanges(fakePort(list), [post], '2026-07-25T10:00:00.000Z')
		).resolves.toEqual({ hasChanges: false, latestChangeAt: '2026-07-20T08:00:00.000Z' });

		await expect(
			detectUnpublishedChanges(fakePort(list), [post], '2026-07-01T00:00:00.000Z')
		).resolves.toEqual({ hasChanges: true, latestChangeAt: '2026-07-20T08:00:00.000Z' });
	});

	test('colecciones elegibles sin ningún registro todavía → hasChanges false (no null)', async () => {
		const list = vi.fn(async () => pageOf(undefined));
		await expect(detectUnpublishedChanges(fakePort(list), [post], null)).resolves.toEqual({
			hasChanges: false,
			latestChangeAt: null
		});
	});

	test('una colección que falla no tumba la detección de las demás', async () => {
		const other: ContentType = { name: 'page', readonly: false, fields: [updatedField] };
		const list = vi.fn(async (type: string) => {
			if (type === 'post') throw new Error('403 forbidden');
			return pageOf('2026-07-22T00:00:00.000Z');
		});
		await expect(
			detectUnpublishedChanges(fakePort(list), [post, other], '2026-07-01T00:00:00.000Z')
		).resolves.toEqual({ hasChanges: true, latestChangeAt: '2026-07-22T00:00:00.000Z' });
	});

	test('TODAS las colecciones elegibles fallan → null, distinto de "sin cambios"', async () => {
		const list = vi.fn(async () => {
			throw new Error('network');
		});
		await expect(detectUnpublishedChanges(fakePort(list), [post], null)).resolves.toEqual({
			hasChanges: null,
			latestChangeAt: null
		});
	});
});
