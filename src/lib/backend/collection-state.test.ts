/**
 * Suite A.5 (§7 del contrato P3, generalizada en P6 §9): `computeCollectionState`
 * (present/creatable/manual) contra un `collectionName` arbitrario — ya no hardcodea `VEGA_COLLECTION`
 * (P6 la reutiliza para `vega_media`, ver `$lib/media/media-collection.ts`).
 */

import { describe, expect, test } from 'vitest';
import type { ContentType } from './types';
import { computeCollectionState } from './collection-state';

const post: ContentType = { name: 'post', readonly: false, fields: [] };
const vega: ContentType = { name: 'vega', readonly: false, fields: [] };
const media: ContentType = { name: 'vega_media', readonly: false, fields: [] };

describe('computeCollectionState', () => {
	test('present: el nombre pedido está entre los tipos descubiertos', () => {
		expect(computeCollectionState([post, vega], 'vega', false)).toBe('present');
		expect(computeCollectionState([post, vega], 'vega', true)).toBe('present');
	});

	test('present: funciona igual para otro nombre de colección (p.ej. "vega_media")', () => {
		expect(computeCollectionState([post, media], 'vega_media', true)).toBe('present');
	});

	test('creatable: ausente y schemaBootstrap true', () => {
		expect(computeCollectionState([post], 'vega', true)).toBe('creatable');
	});

	test('manual: ausente y schemaBootstrap false', () => {
		expect(computeCollectionState([post], 'vega', false)).toBe('manual');
	});

	test('sin tipos en absoluto y schemaBootstrap false → manual', () => {
		expect(computeCollectionState([], 'vega', false)).toBe('manual');
	});
});
