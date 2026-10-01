// @vitest-environment jsdom
/**
 * Suite de `richtext-link.ts`: qué destinos admite un enlace del texto enriquecido, qué `href`
 * queda en el HTML y qué páginas se ofrecen. jsdom por `stripNewTabFromInternalLinks`, que lee el
 * HTML con un `<template>`.
 */
import { describe, expect, test } from 'vitest';
import type { Page, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import {
	buildPageSearchQuery,
	isInternalHref,
	pageCandidatesFromPage,
	pagePathColumn,
	pageTypesWithPath,
	stripNewTabFromInternalLinks,
	validateLinkHref
} from './richtext-link';

function textField(name: string) {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

function pageType(overrides: Partial<ResolvedContentType> = {}): ResolvedContentType {
	return {
		name: 'paginas',
		label: 'Páginas',
		labelSingular: 'Página',
		titleField: 'title',
		schema: { name: 'paginas', fields: [textField('title'), textField('ruta')] },
		page: { pathField: 'ruta', pathFieldUnique: true, layoutField: null, localizedPath: null },
		...overrides
	} as unknown as ResolvedContentType;
}

function pageOf(records: { id: string; values: Record<string, unknown> }[]): Page<VegaRecord> {
	return {
		items: records.map((record) => ({ ...record, type: 'paginas' }) as unknown as VegaRecord),
		page: 1,
		perPage: 20,
		totalItems: records.length,
		totalPages: 1
	};
}

describe('validateLinkHref — lo que se admite', () => {
	test.each([
		['https://fodaveg.net/blog', false],
		['http://ejemplo.com', false],
		['HTTPS://Ejemplo.com/a?b=1#c', false],
		['mailto:hola@fodaveg.net', false],
		['tel:+34600000000', false],
		['/sobre-mi', true],
		['/', true],
		['/blog/entrada#notas', true]
	])('%s', (raw, internal) => {
		expect(validateLinkHref(raw)).toEqual({ ok: true, href: raw, internal });
	});

	test('recorta los espacios de los extremos', () => {
		expect(validateLinkHref('  /sobre-mi \n')).toEqual({
			ok: true,
			href: '/sobre-mi',
			internal: true
		});
	});
});

describe('validateLinkHref — lo que se rechaza', () => {
	test.each([
		['', 'empty'],
		['   ', 'empty'],
		['javascript:alert(1)', 'scheme'],
		['JavaScript:alert(1)', 'scheme'],
		['data:text/html,<script>alert(1)</script>', 'scheme'],
		['vbscript:x', 'scheme'],
		['ftp://ejemplo.com/f', 'scheme'],
		['java\tscript:alert(1)', 'format'],
		// Entidad en hexadecimal a propósito: la decimal (`&#` + 115) la lee `check-theme-coverage`
		// como un color crudo.
		['java&#x73;cript:alert(1)', 'format'],
		['ejemplo.com', 'format'],
		['sobre-mi', 'format'],
		['#ancla', 'format'],
		['//ejemplo.com', 'format'],
		['/\\ejemplo.com', 'format'],
		['/sobre mi', 'format'],
		['https://', 'format'],
		['https:ejemplo.com', 'format'],
		['mailto:', 'format'],
		['tel:', 'format']
	])('%j → %s', (raw, reason) => {
		expect(validateLinkHref(raw)).toEqual({ ok: false, reason });
	});
});

describe('isInternalHref', () => {
	test('una ruta del sitio sí; otra web, no', () => {
		expect(isInternalHref('/sobre-mi')).toBe(true);
		expect(isInternalHref('//ejemplo.com')).toBe(false);
		expect(isInternalHref('/\\ejemplo.com')).toBe(false);
		expect(isInternalHref('https://ejemplo.com')).toBe(false);
		expect(isInternalHref('')).toBe(false);
	});
});

describe('stripNewTabFromInternalLinks — una ruta del sitio no abre pestaña nueva', () => {
	const REL = 'noopener noreferrer nofollow';

	test('quita target y rel del enlace interno y deja el externo como estaba', () => {
		const html =
			`<p><a target="_blank" rel="${REL}" href="/sobre-mi">Sobre mí</a> y ` +
			`<a target="_blank" rel="${REL}" href="https://fodaveg.net">fuera</a></p>`;
		expect(stripNewTabFromInternalLinks(html)).toBe(
			`<p><a href="/sobre-mi">Sobre mí</a> y ` +
				`<a target="_blank" rel="${REL}" href="https://fodaveg.net">fuera</a></p>`
		);
	});

	test('sin enlaces internos devuelve la MISMA cadena', () => {
		const html = `<p><a target="_blank" rel="${REL}" href="https://fodaveg.net">fuera</a></p>`;
		expect(stripNewTabFromInternalLinks(html)).toBe(html);
	});

	test('un protocolo-relativo no es interno: conserva target y rel', () => {
		const html = `<p><a target="_blank" rel="${REL}" href="//ejemplo.com">x</a></p>`;
		expect(stripNewTabFromInternalLinks(html)).toBe(html);
	});

	test('un enlace interno que ya venía sin target no cambia nada', () => {
		const html = '<p><a href="/sobre-mi">Sobre mí</a></p>';
		expect(stripNewTabFromInternalLinks(html)).toBe(html);
	});
});

describe('páginas del sitio', () => {
	test('pagePathColumn: la columna de la ruta, o null si el tipo no es de páginas', () => {
		expect(pagePathColumn(pageType())).toBe('ruta');
		expect(pagePathColumn(pageType({ page: null }))).toBeNull();
	});

	test('pagePathColumn con ruta por idioma: la columna del idioma por defecto', () => {
		const type = pageType({
			page: {
				pathField: 'ruta',
				pathFieldUnique: true,
				layoutField: null,
				localizedPath: { defaultLocale: 'es', fields: { es: 'ruta_es', en: 'ruta_en' } }
			}
		});
		expect(pagePathColumn(type)).toBe('ruta_es');
	});

	test('pageTypesWithPath deja fuera los tipos sin ruta', () => {
		const withPath = pageType();
		const without = pageType({ name: 'entradas', page: null });
		expect(pageTypesWithPath({ types: [without, withPath] })).toEqual([withPath]);
	});

	test('buildPageSearchQuery: por título, por ruta si el término empieza por /, o sin filtro', () => {
		expect(buildPageSearchQuery(pageType(), 'sobre')).toEqual({
			filter: { kind: 'cond', field: 'title', op: 'contains', value: 'sobre' },
			perPage: 20
		});
		expect(buildPageSearchQuery(pageType(), ' /sob ')).toEqual({
			filter: { kind: 'cond', field: 'ruta', op: 'contains', value: '/sob' },
			perPage: 20
		});
		expect(buildPageSearchQuery(pageType(), '  ')).toEqual({ perPage: 20 });
		expect(buildPageSearchQuery(pageType({ titleField: null }), 'sobre')).toEqual({ perPage: 20 });
	});

	test('pageCandidatesFromPage: el href de una página es su RUTA, no su id', () => {
		const candidates = pageCandidatesFromPage(
			pageType(),
			pageOf([
				{ id: 'p1', values: { title: 'Sobre mí', ruta: '/sobre-mi' } },
				{ id: 'p2', values: { title: 'Borrador', ruta: '' } },
				{ id: 'p3', values: { title: '', ruta: '/contacto' } }
			])
		);
		expect(candidates).toEqual([
			{ key: 'paginas:p1', typeLabel: 'Página', title: 'Sobre mí', path: '/sobre-mi' },
			{ key: 'paginas:p2', typeLabel: 'Página', title: 'Borrador', path: '' },
			{ key: 'paginas:p3', typeLabel: 'Página', title: '/contacto', path: '/contacto' }
		]);
	});
});
