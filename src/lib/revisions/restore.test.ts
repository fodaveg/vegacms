/**
 * Suite de `restore.ts` (`#lote-integridad`, Fase B §8·B2): `hasFileValues` (la señal del aviso
 * "los ficheros adjuntos no se recuperan", §10.3) y `buildRestoreInput` (descarta `readonly`/
 * `file`/`unsupported` al restaurar un borrado).
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import { buildRestoreInput, hasFileValues, requiredFileFieldName } from './restore';

function textField(name: string, opts: Partial<Field> = {}): Field {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...opts
	} as Field;
}

function fileField(name: string, opts: Partial<Field> = {}): Field {
	return {
		name,
		type: 'file',
		multiple: false,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...opts
	} as Field;
}

function autodateField(name: string): Field {
	return {
		name,
		type: 'date',
		required: false,
		readonly: true,
		presentable: false,
		hidden: false,
		unique: false
	} as Field;
}

function unsupportedField(name: string): Field {
	return {
		name,
		type: 'unsupported',
		backendType: 'geoPoint',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	} as Field;
}

describe('hasFileValues', () => {
	test('sin campos file: false', () => {
		expect(hasFileValues([textField('title')], { title: 'x' })).toBe(false);
	});

	test('campo file con valor: true', () => {
		expect(hasFileValues([fileField('cover')], { cover: 'foto.png' })).toBe(true);
	});

	test('campo file múltiple con al menos un elemento: true', () => {
		expect(hasFileValues([fileField('gallery', { multiple: true })], { gallery: ['a.png'] })).toBe(
			true
		);
	});

	test("campo file vacío ('', [], null): false", () => {
		expect(hasFileValues([fileField('cover')], { cover: '' })).toBe(false);
		expect(hasFileValues([fileField('cover')], { cover: null })).toBe(false);
		expect(hasFileValues([fileField('gallery', { multiple: true })], { gallery: [] })).toBe(false);
	});

	test('varios campos file: basta con que UNO tenga valor', () => {
		const fields = [fileField('cover'), fileField('extra')];
		expect(hasFileValues(fields, { cover: '', extra: 'algo.pdf' })).toBe(true);
	});
});

describe('buildRestoreInput', () => {
	test('incluye los campos normales tal cual', () => {
		const fields = [textField('title')];
		const input = buildRestoreInput(fields, { title: 'Hola' });
		expect(input).toEqual({ title: 'Hola' });
	});

	test('descarta los campos readonly (autodate)', () => {
		const fields = [textField('title'), autodateField('created')];
		const input = buildRestoreInput(fields, { title: 'Hola', created: '2026-01-01T00:00:00.000Z' });
		expect(input).toEqual({ title: 'Hola' });
		expect('created' in input).toBe(false);
	});

	test('descarta los campos file: sus FileRef apuntan a binarios ya destruidos (§0.3)', () => {
		const fields = [textField('title'), fileField('cover')];
		const input = buildRestoreInput(fields, { title: 'Hola', cover: 'foto.png' });
		expect(input).toEqual({ title: 'Hola' });
		expect('cover' in input).toBe(false);
	});

	test('descarta los campos unsupported', () => {
		const fields = [textField('title'), unsupportedField('location')];
		const input = buildRestoreInput(fields, { title: 'Hola', location: { lat: 1, lng: 2 } });
		expect(input).toEqual({ title: 'Hola' });
	});

	test('un campo del esquema ausente en la pre-imagen (esquema cambiado desde entonces): undefined, no crashea', () => {
		const fields = [textField('title'), textField('nuevoCampo')];
		const input = buildRestoreInput(fields, { title: 'Hola' });
		expect(input.title).toBe('Hola');
		expect(input.nuevoCampo).toBeUndefined();
	});
});

describe('requiredFileFieldName (fix de code-review: "Restaurar" no puede prometer lo que no cumple)', () => {
	test('sin campos file: null', () => {
		expect(requiredFileFieldName([textField('title')])).toBeNull();
	});

	test('campo file NO required: null — buildRestoreInput lo descarta igual, pero el resto del registro sí se recrea', () => {
		expect(requiredFileFieldName([textField('title'), fileField('cover')])).toBeNull();
	});

	test('campo file required (caso vega_media.file, D-P6.1): devuelve su nombre', () => {
		expect(requiredFileFieldName([textField('title'), fileField('file', { required: true })])).toBe(
			'file'
		);
	});

	test('varios campos file required: se queda con el PRIMERO en el orden de fields', () => {
		const fields = [
			fileField('cover', { required: true }),
			fileField('gallery', { required: true })
		];
		expect(requiredFileFieldName(fields)).toBe('cover');
	});
});
