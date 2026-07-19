/**
 * Suite de `media-tags.ts` (Fase P6·6b): edición pura de la lista libre de `tags` del panel de
 * detalle — añadir/quitar/normalizar/comparar, sin `select`/`options` cerradas (a diferencia de
 * `select-value.ts`).
 */
import { describe, expect, test } from 'vitest';
import { addTag, normalizeTagInput, removeTag, tagsEqual } from './media-tags';

describe('normalizeTagInput', () => {
	test('recorta espacios de los extremos', () => {
		expect(normalizeTagInput('  foto  ')).toBe('foto');
	});

	test('solo espacios normaliza a ""', () => {
		expect(normalizeTagInput('   ')).toBe('');
	});
});

describe('addTag', () => {
	test('añade un tag nuevo al final', () => {
		expect(addTag(['a'], 'b')).toEqual(['a', 'b']);
	});

	test('recorta espacios antes de añadir', () => {
		expect(addTag([], '  foto  ')).toEqual(['foto']);
	});

	test('"" (o solo espacios) es un no-op: misma referencia', () => {
		const tags = ['a'];
		expect(addTag(tags, '   ')).toBe(tags);
	});

	test('un duplicado EXACTO es un no-op: misma referencia', () => {
		const tags = ['foto', 'playa'];
		expect(addTag(tags, 'foto')).toBe(tags);
	});

	test('mayúsculas/minúsculas distintas NO son duplicado (texto libre, no un select)', () => {
		expect(addTag(['Foto'], 'foto')).toEqual(['Foto', 'foto']);
	});

	test('nunca muta la lista original', () => {
		const tags = ['a'];
		addTag(tags, 'b');
		expect(tags).toEqual(['a']);
	});
});

describe('removeTag', () => {
	test('quita el tag por valor exacto', () => {
		expect(removeTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
	});

	test('un tag ausente es un no-op (mismo contenido, nueva referencia por `filter`)', () => {
		expect(removeTag(['a', 'b'], 'z')).toEqual(['a', 'b']);
	});

	test('nunca muta la lista original', () => {
		const tags = ['a', 'b'];
		removeTag(tags, 'a');
		expect(tags).toEqual(['a', 'b']);
	});
});

describe('tagsEqual (el orden importa: no es una comparación de conjuntos)', () => {
	test('mismas listas, mismo orden → true', () => {
		expect(tagsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
	});

	test('mismos elementos, orden distinto → false', () => {
		expect(tagsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
	});

	test('longitudes distintas → false', () => {
		expect(tagsEqual(['a'], ['a', 'b'])).toBe(false);
	});

	test('dos listas vacías → true', () => {
		expect(tagsEqual([], [])).toBe(true);
	});
});
