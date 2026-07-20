/**
 * Tests de `preview-url.ts` (§4.7 del contrato P2): validación de placeholders en resolución
 * y sustitución en runtime (`buildPreviewUrl`).
 */

import { describe, expect, test } from 'vitest';
import type { VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { buildPreviewUrl, validatePreviewUrlPlaceholders } from '$lib/model/preview-url';
import { postFields } from './fixture';

describe('validatePreviewUrlPlaceholders (§4.7)', () => {
	test('{id} siempre válido', () => {
		expect(validatePreviewUrlPlaceholders('https://x.test/{id}', postFields)).toBe(true);
	});

	test('{campo} válido si el campo existe y es escalar (text)', () => {
		expect(validatePreviewUrlPlaceholders('https://x.test/{title}', postFields)).toBe(true);
	});

	test('{campo} inválido si el campo no existe', () => {
		expect(validatePreviewUrlPlaceholders('https://x.test/{no-existe}', postFields)).toBe(false);
	});

	test('{campo} inválido si el campo no es escalar (richtext)', () => {
		expect(validatePreviewUrlPlaceholders('https://x.test/{content}', postFields)).toBe(false);
	});

	test('{campo} inválido si el campo no es escalar (relation single, no está en la lista de §4.7)', () => {
		expect(validatePreviewUrlPlaceholders('https://x.test/{category}', postFields)).toBe(false);
	});

	test('varios placeholders válidos combinados', () => {
		expect(
			validatePreviewUrlPlaceholders('https://x.test/{publishedAt}/{id}-{rating}', postFields)
		).toBe(true);
	});

	test('sin placeholders → válido (plantilla fija)', () => {
		expect(validatePreviewUrlPlaceholders('https://x.test/fijo', postFields)).toBe(true);
	});
});

function makeResolvedType(previewUrl: string | null): ResolvedContentType {
	return {
		schema: { name: 'post', readonly: false, fields: postFields },
		name: 'post',
		label: 'Post',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		titleField: 'title',
		orderField: null,
		statusField: 'status',
		previewUrl,
		fields: [],
		listFields: [],
		fieldGroups: []
	};
}

describe('buildPreviewUrl (§2/§4.7)', () => {
	test('previewUrl null → null', () => {
		const record: VegaRecord = { id: 'r1', type: 'post', values: { title: 'X' } };
		expect(buildPreviewUrl(makeResolvedType(null), record)).toBeNull();
	});

	test('sustituye con encodeURIComponent (espacios, &, tildes)', () => {
		const type = makeResolvedType('https://example.com/posts/{id}/{title}');
		const record: VegaRecord = {
			id: 'abc123',
			type: 'post',
			values: { title: 'Café & Té raro' }
		};
		expect(buildPreviewUrl(type, record)).toBe(
			`https://example.com/posts/abc123/${encodeURIComponent('Café & Té raro')}`
		);
	});

	test('placeholder con valor vacío → null (botón deshabilitado, no URL rota)', () => {
		const type = makeResolvedType('https://example.com/posts/{title}');
		const record: VegaRecord = { id: 'r1', type: 'post', values: { title: '' } };
		expect(buildPreviewUrl(type, record)).toBeNull();
	});

	test('placeholder con valor null → null', () => {
		const type = makeResolvedType('https://example.com/posts/{title}');
		const record: VegaRecord = { id: 'r1', type: 'post', values: { title: null } };
		expect(buildPreviewUrl(type, record)).toBeNull();
	});

	test('placeholder {id} usa record.id, no values', () => {
		const type = makeResolvedType('https://example.com/posts/{id}');
		const record: VegaRecord = { id: 'r-99', type: 'post', values: {} };
		expect(buildPreviewUrl(type, record)).toBe('https://example.com/posts/r-99');
	});

	test('valor numérico 0 NO se trata como vacío', () => {
		const type = makeResolvedType('https://example.com/posts/{rating}');
		const record: VegaRecord = { id: 'r1', type: 'post', values: { rating: 0 } };
		expect(buildPreviewUrl(type, record)).toBe('https://example.com/posts/0');
	});
});
