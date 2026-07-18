/**
 * Unit del helper de resolución de tipo de ruta (§2.4/§6.5, review de 3a): visible → lo devuelve;
 * inexistente u oculto (`hidden`, incl. `vega`/`vega_*`) → `null` (⇒ la ruta pinta `not-found`).
 */
import { describe, expect, test } from 'vitest';
import { resolveVisibleContentType } from '$lib/nav/content-type';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';

/** `ResolvedContentType` mínimo para el test (solo los campos que el helper mira). */
function type(name: string, hidden: boolean): ResolvedContentType {
	return {
		schema: { name, label: name, fields: [], readonly: false },
		name,
		label: name,
		labelSingular: name,
		icon: null,
		hidden,
		group: null,
		singleton: false,
		readonly: false,
		titleField: null,
		statusField: null,
		previewUrl: null
		// Fixture mínimo: el helper solo lee `name`/`hidden`. `as unknown as` a propósito para no
		// arrastrar los campos de P2 (`fields`/`listFields`/`fieldGroups`) que aquí no importan.
	} as unknown as ResolvedContentType;
}

function model(types: ResolvedContentType[]): ContentModel {
	return {
		site: { name: 'Vega', defaultTheme: null, locale: null },
		types,
		nav: { groups: [] },
		warnings: [],
		manifest: { status: 'absent' }
	};
}

describe('resolveVisibleContentType', () => {
	const m = model([type('posts', false), type('vega', true), type('secret', true)]);

	test('tipo visible → lo devuelve', () => {
		expect(resolveVisibleContentType(m, 'posts')?.name).toBe('posts');
	});

	test('tipo inexistente → null', () => {
		expect(resolveVisibleContentType(m, 'no-existe')).toBeNull();
	});

	test('tipo oculto (vega / hidden) → null, nunca navegable (P2-L7)', () => {
		expect(resolveVisibleContentType(m, 'vega')).toBeNull();
		expect(resolveVisibleContentType(m, 'secret')).toBeNull();
	});

	test('param vacío → null', () => {
		expect(resolveVisibleContentType(m, '')).toBeNull();
	});
});
