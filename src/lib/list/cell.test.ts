/**
 * Tests unitarios de `describeCell` (Fase 4a, tabla §4 del contrato P4): un caso por tipo de
 * campo, incluido null/vacío uniforme, relación NUNCA-id-crudo (Audit H5), richtext sin HTML
 * (riesgo XSS) y formateo de number/date por locale.
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import type { ResolvedField } from '$lib/model/types';
import { describeCell } from './cell';

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

function resolvedField(schema: Field, overrides: Partial<ResolvedField> = {}): ResolvedField {
	return {
		schema,
		name: schema.name,
		label: schema.name,
		help: null,
		placeholder: null,
		hidden: schema.hidden,
		group: null,
		widget: 'text',
		subtype: null,
		listable: true,
		...overrides
	};
}

describe('describeCell — vacío uniforme', () => {
	test('null → empty', () => {
		const f = resolvedField(field({ name: 'title', type: 'text', subtype: 'plain' }));
		expect(describeCell(f, null, 'es')).toEqual({ kind: 'empty' });
	});

	test("'' en text → empty", () => {
		const f = resolvedField(field({ name: 'title', type: 'text', subtype: 'plain' }));
		expect(describeCell(f, '', 'es')).toEqual({ kind: 'empty' });
	});

	test('[] en relation múltiple → empty', () => {
		const f = resolvedField(
			field({ name: 'tags', type: 'relation', target: 'tags', multiple: true })
		);
		expect(describeCell(f, [], 'es')).toEqual({ kind: 'empty' });
	});
});

describe('describeCell — texto (text/email/url/select simple)', () => {
	test('text: incluye el texto completo, sin truncar (el truncado es CSS de 4c)', () => {
		const f = resolvedField(field({ name: 'title', type: 'text', subtype: 'plain' }));
		const longText = 'a'.repeat(500);
		expect(describeCell(f, longText, 'es')).toEqual({ kind: 'text', text: longText });
	});

	test('email/url: texto plano', () => {
		const email = resolvedField(field({ name: 'contact', type: 'email' }));
		expect(describeCell(email, 'a@b.com', 'es')).toEqual({ kind: 'text', text: 'a@b.com' });

		const url = resolvedField(field({ name: 'site', type: 'url' }));
		expect(describeCell(url, 'https://x.test', 'es')).toEqual({
			kind: 'text',
			text: 'https://x.test'
		});
	});

	test('select simple: valor literal como texto', () => {
		const f = resolvedField(
			field({ name: 'status', type: 'select', options: ['draft', 'published'], multiple: false })
		);
		expect(describeCell(f, 'published', 'es')).toEqual({ kind: 'text', text: 'published' });
	});
});

describe('describeCell — number', () => {
	test('formatea según locale', () => {
		const f = resolvedField(field({ name: 'price', type: 'number', integer: false }));
		expect(describeCell(f, 1234.5, 'es')).toEqual({
			kind: 'number',
			text: new Intl.NumberFormat('es').format(1234.5)
		});
		expect(describeCell(f, 1234.5, 'en')).toEqual({
			kind: 'number',
			text: new Intl.NumberFormat('en').format(1234.5)
		});
	});

	test('integer: sin decimales', () => {
		const f = resolvedField(field({ name: 'views', type: 'number', integer: true }));
		expect(describeCell(f, 3, 'es')).toEqual({
			kind: 'number',
			text: new Intl.NumberFormat('es', { maximumFractionDigits: 0 }).format(3)
		});
	});
});

describe('describeCell — bool', () => {
	test('true/false se transportan tal cual (i18n Sí/No es de 4c)', () => {
		const f = resolvedField(field({ name: 'featured', type: 'bool' }));
		expect(describeCell(f, true, 'es')).toEqual({ kind: 'bool', value: true });
		expect(describeCell(f, false, 'es')).toEqual({ kind: 'bool', value: false });
	});
});

describe('describeCell — date', () => {
	test('ISO válido → formateado por locale', () => {
		const f = resolvedField(field({ name: 'publishedAt', type: 'date' }));
		const iso = '2026-01-15T10:00:00.000Z';
		const expected = new Intl.DateTimeFormat('es', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(iso));
		expect(describeCell(f, iso, 'es')).toEqual({ kind: 'date', text: expected });
	});

	test('ISO inválido → empty (nunca un string crudo)', () => {
		const f = resolvedField(field({ name: 'publishedAt', type: 'date' }));
		expect(describeCell(f, 'no es una fecha', 'es')).toEqual({ kind: 'empty' });
	});
});

describe('describeCell — select múltiple', () => {
	test('devuelve los valores; 4c decide contador vs chips', () => {
		const f = resolvedField(
			field({ name: 'tags', type: 'select', options: ['a', 'b', 'c'], multiple: true })
		);
		expect(describeCell(f, ['a', 'c'], 'es')).toEqual({ kind: 'select-multi', values: ['a', 'c'] });
	});
});

describe('describeCell — relation: NUNCA el id crudo (Audit H5)', () => {
	test('simple: marcador de presencia, no el id', () => {
		const f = resolvedField(
			field({ name: 'author', type: 'relation', target: 'users', multiple: false })
		);
		const descriptor = describeCell(f, 'rec_abc123', 'es');
		expect(descriptor).toEqual({ kind: 'relation', count: 1 });
		expect(JSON.stringify(descriptor)).not.toContain('rec_abc123');
	});

	test('múltiple: contador del array, no los ids', () => {
		const f = resolvedField(
			field({ name: 'related', type: 'relation', target: 'posts', multiple: true })
		);
		const descriptor = describeCell(f, ['id1', 'id2', 'id3'], 'es');
		expect(descriptor).toEqual({ kind: 'relation', count: 3 });
		expect(JSON.stringify(descriptor)).not.toContain('id1');
	});
});

describe('describeCell — file', () => {
	test('simple: se envuelve en array de 1', () => {
		const f = resolvedField(field({ name: 'cover', type: 'file', multiple: false }));
		expect(describeCell(f, 'foto.jpg', 'es')).toEqual({ kind: 'file', refs: ['foto.jpg'] });
	});

	test('múltiple: refs tal cual', () => {
		const f = resolvedField(field({ name: 'gallery', type: 'file', multiple: true }));
		expect(describeCell(f, ['a.jpg', 'b.jpg'], 'es')).toEqual({
			kind: 'file',
			refs: ['a.jpg', 'b.jpg']
		});
	});
});

describe('describeCell — richtext: HTML→texto plano, NUNCA HTML (riesgo XSS)', () => {
	test('extrae texto y descarta las etiquetas', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		const descriptor = describeCell(f, '<p>Hola <strong>mundo</strong></p>', 'es');
		expect(descriptor).toEqual({ kind: 'richtext', text: 'Hola mundo' });
	});

	test('un payload con script no deja pasar la etiqueta ni el contenido inyectable', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		const descriptor = describeCell(f, '<script>alert(1)</script>texto', 'es');
		expect(descriptor.kind).toBe('richtext');
		if (descriptor.kind === 'richtext') {
			expect(descriptor.text).not.toContain('<script>');
			expect(descriptor.text).not.toContain('</script>');
		}
	});

	test('se trunca a un tamaño acotado con elipsis, sin desbordar la celda', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		const huge = `<p>${'palabra '.repeat(200)}</p>`;
		const descriptor = describeCell(f, huge, 'es');
		expect(descriptor.kind).toBe('richtext');
		if (descriptor.kind === 'richtext') {
			expect(descriptor.text.length).toBeLessThan(huge.length);
			expect(descriptor.text.endsWith('…')).toBe(true);
		}
	});

	test('solo etiquetas y espacios (sin texto real) → empty', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		expect(describeCell(f, '<p>   </p>', 'es')).toEqual({ kind: 'empty' });
	});

	test('entidades que "revelen" un tag (&lt;script&gt;) NO resucitan markup activo', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		const descriptor = describeCell(f, '&lt;script&gt;alert(1)&lt;/script&gt;', 'es');
		expect(descriptor.kind).toBe('richtext');
		if (descriptor.kind === 'richtext') {
			expect(descriptor.text).not.toContain('<script>');
			expect(descriptor.text).not.toContain('</script>');
			expect(descriptor.text).not.toContain('<');
			expect(descriptor.text).not.toContain('>');
		}
	});

	test('un "<" sin ">" posterior sobrevive como literal (no es un tag)', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		const descriptor = describeCell(f, 'el precio < 100 sin cierre', 'es');
		expect(descriptor).toEqual({ kind: 'richtext', text: 'el precio < 100 sin cierre' });
	});

	test('tag anidado/malformado (<scr<script>ipt>) no deja ningún "<" activo en el texto', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		const descriptor = describeCell(f, '<scr<script>ipt>hola', 'es');
		expect(descriptor.kind).toBe('richtext');
		if (descriptor.kind === 'richtext') {
			expect(descriptor.text).not.toContain('<');
		}
	});

	test('truncado emoji-safe: no parte un par sustituto por la mitad', () => {
		const f = resolvedField(field({ name: 'body', type: 'richtext', subtype: 'html' }));
		// El emoji cae justo en el límite de RICHTEXT_MAX_CHARS (200 code points): 199 'a' + 😀.
		const raw = 'a'.repeat(199) + '😀' + 'b'.repeat(50);
		const descriptor = describeCell(f, raw, 'es');
		expect(descriptor.kind).toBe('richtext');
		if (descriptor.kind === 'richtext') {
			expect(descriptor.text).toContain('😀'); // el emoji entero sobrevive, no un surrogate suelto
			expect(descriptor.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // sin surrogate alto huérfano
			expect(descriptor.text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/); // sin surrogate bajo huérfano
			expect(descriptor.text.endsWith('…')).toBe(true);
		}
	});
});

describe('describeCell — json/unsupported: marcador mono, nunca el valor crudo', () => {
	test('json: marcador corto, no el objeto', () => {
		const f = resolvedField(field({ name: 'meta', type: 'json' }));
		const descriptor = describeCell(f, { a: 1, b: [1, 2, 3] }, 'es');
		expect(descriptor).toEqual({ kind: 'mono', text: '{…}' });
	});

	test('unsupported: el backendType, no el valor crudo', () => {
		const f = resolvedField(
			field({ name: 'location', type: 'unsupported', backendType: 'geoPoint' })
		);
		const descriptor = describeCell(f, { lat: 1, lon: 2 } as never, 'es');
		expect(descriptor).toEqual({ kind: 'mono', text: 'geoPoint' });
	});
});
