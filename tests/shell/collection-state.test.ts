/**
 * Suite A.5 (§7 del contrato P3): `computeCollectionState` (present/creatable/manual), §3.5.
 */

import { describe, expect, test } from 'vitest';
import type { ContentType } from '$lib/backend';
import { computeCollectionState } from '$lib/settings/collection-state';

const post: ContentType = { name: 'post', readonly: false, fields: [] };
const vega: ContentType = { name: 'vega', readonly: false, fields: [] };

describe('computeCollectionState', () => {
	test('present: "vega" está entre los tipos descubiertos', () => {
		expect(computeCollectionState([post, vega], false)).toBe('present');
		expect(computeCollectionState([post, vega], true)).toBe('present');
	});

	test('creatable: "vega" ausente y schemaBootstrap true', () => {
		expect(computeCollectionState([post], true)).toBe('creatable');
	});

	test('manual: "vega" ausente y schemaBootstrap false', () => {
		expect(computeCollectionState([post], false)).toBe('manual');
	});

	test('sin tipos en absoluto y schemaBootstrap false → manual', () => {
		expect(computeCollectionState([], false)).toBe('manual');
	});
});
