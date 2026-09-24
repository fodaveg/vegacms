/**
 * `canonicalJson`/`schemaSnapshotMatches` (`model/schema-snapshot.ts`): la comparación que decide
 * si hay que reescribir el snapshot de esquema de los editores. Tiene que ignorar el orden de
 * claves (PocketBase no promete conservarlo en un campo `json`) y respetar el de los arrays.
 */

import { describe, expect, test } from 'vitest';
import { canonicalJson, schemaSnapshotMatches } from '$lib/model/schema-snapshot';

describe('canonicalJson', () => {
	test('el orden de claves no cambia el resultado, a ninguna profundidad', () => {
		expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
			canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 })
		);
	});

	test('el orden de los arrays SÍ cuenta', () => {
		expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
	});

	test('undefined se trata como JSON: fuera en objetos, null en arrays', () => {
		expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
		expect(canonicalJson([undefined])).toBe(canonicalJson([null]));
	});
});

describe('schemaSnapshotMatches', () => {
	const types = [{ name: 'post', readonly: false, fields: [{ name: 'title', type: 'text' }] }];

	test('mismo contenido con otras claves y un undefined de menos coincide', () => {
		const stored = [{ fields: [{ type: 'text', name: 'title' }], readonly: false, name: 'post' }];
		expect(schemaSnapshotMatches([{ ...types[0], access: undefined }], stored)).toBe(true);
	});

	test('un campo de más o de menos no coincide', () => {
		const stored = [{ name: 'post', readonly: false, fields: [] }];
		expect(schemaSnapshotMatches(types, stored)).toBe(false);
	});

	test('snapshot ausente o null nunca coincide', () => {
		expect(schemaSnapshotMatches(types, undefined)).toBe(false);
		expect(schemaSnapshotMatches(types, null)).toBe(false);
	});
});
