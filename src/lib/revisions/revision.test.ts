/**
 * Suite de `parseRevisionRecord` (`#lote-integridad`, Fase B): tolerante ante forma inesperada —
 * `null` en vez de reventar, mismo criterio que `media-item.ts#toMediaItemView`.
 */

import { describe, expect, test } from 'vitest';
import type { VegaRecord } from '$lib/backend/types';
import { parseRevisionRecord } from './revision';

function record(values: VegaRecord['values']): VegaRecord {
	return { id: 'rev1', type: 'vega_revisions', values };
}

describe('parseRevisionRecord', () => {
	test('forma completa y válida', () => {
		const parsed = parseRevisionRecord(
			record({
				collection: 'posts',
				recordId: 'post1',
				kind: 'update',
				values: { title: 'Antes' },
				label: 'Antes',
				author: 'a@b.c',
				created: '2026-07-25T00:00:00.000Z'
			})
		);
		expect(parsed).toEqual({
			id: 'rev1',
			collection: 'posts',
			recordId: 'post1',
			kind: 'update',
			values: { title: 'Antes' },
			label: 'Antes',
			author: 'a@b.c',
			created: '2026-07-25T00:00:00.000Z'
		});
	});

	test("kind fuera del vocabulario cerrado ('select'/dato hostil) → null", () => {
		expect(
			parseRevisionRecord(
				record({ collection: 'posts', recordId: 'post1', kind: 'archive', values: {} })
			)
		).toBeNull();
	});

	test('collection/recordId ausentes o no-texto → null', () => {
		expect(parseRevisionRecord(record({ kind: 'update', values: {} }))).toBeNull();
		expect(
			parseRevisionRecord(record({ collection: 42, recordId: 'x', kind: 'update', values: {} }))
		).toBeNull();
	});

	test('label/author/created ausentes degradan sin invalidar el resto', () => {
		const parsed = parseRevisionRecord(
			record({ collection: 'posts', recordId: 'post1', kind: 'update', values: { a: 1 } })
		);
		expect(parsed).toEqual({
			id: 'rev1',
			collection: 'posts',
			recordId: 'post1',
			kind: 'update',
			values: { a: 1 },
			label: 'post1',
			author: '',
			created: null
		});
	});

	test('values no-objeto (dato hostil) degrada a {} en vez de invalidar', () => {
		const parsed = parseRevisionRecord(
			record({ collection: 'posts', recordId: 'post1', kind: 'update', values: 'nope' })
		);
		expect(parsed?.values).toEqual({});
	});
});
