/**
 * Suite de `restore.ts` (`#lote-integridad`, Fase B §8·B2): `hasFileValues` (la señal del aviso
 * "los ficheros adjuntos no se recuperan", §10.3) y `buildRestoreInput` (descarta `readonly`/
 * `file`/`unsupported` al restaurar un borrado).
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import {
	buildRestoreInput,
	hasFileValues,
	requiredFileFieldName,
	restoreTargetType,
	type RestoreTargetCandidate
} from './restore';

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

describe('restoreTargetType (el destino de una restauración sale de un dato, no de la app)', () => {
	function type(name: string, readonly = false): RestoreTargetCandidate {
		return { name, schema: { readonly, fields: [textField('title')] } };
	}
	// Lo que trae `ContentModel.types`: tipos de contenido, las colecciones internas de Vega
	// (ocultas, pero en la lista) y las vistas (`readonly`).
	const types = [
		type('pages'),
		type('posts'),
		type('vega'),
		type('vega_media'),
		type('vega_revisions'),
		type('resumen', true)
	];

	test('un tipo de contenido del modelo: se devuelve ESE tipo', () => {
		expect(restoreTargetType(types, 'pages')).toBe(types[0]);
		expect(restoreTargetType(types, 'posts')).toBe(types[1]);
	});

	test.each([
		['vega', 'el manifiesto'],
		['vega_revisions', 'el propio historial'],
		['vega_media', 'interna de Vega'],
		['vega_editors', 'auth, y además reservada'],
		['vega_cualquiera', 'reservada aunque no exista']
	])('colección interna de Vega "%s" (%s): null aunque esté en el modelo', (collection) => {
		expect(restoreTargetType(types, collection)).toBeNull();
	});

	test.each(['_superusers', '_mfas', '_externalAuths', 'users', 'otra'])(
		'colección que no está en el modelo ("%s", de sistema, auth o borrada): null',
		(collection) => {
			expect(restoreTargetType(types, collection)).toBeNull();
		}
	);

	test('una vista (readonly): null, no se crea nada en ella', () => {
		expect(restoreTargetType(types, 'resumen')).toBeNull();
	});

	test('el nombre casa EXACTO: ni mayúsculas, ni espacios, ni prefijos', () => {
		for (const collection of ['Pages', ' pages', 'pages ', 'page', 'pages/../vega', '']) {
			expect(restoreTargetType(types, collection)).toBeNull();
		}
	});

	test('un `collection` que no es un string (revisión manipulada): null', () => {
		for (const collection of [null, undefined, 7, {}, ['pages'], { toString: () => 'pages' }]) {
			expect(restoreTargetType(types, collection)).toBeNull();
		}
	});

	test('claves heredadas de Object no cuelan como nombre de tipo', () => {
		for (const collection of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
			expect(restoreTargetType(types, collection)).toBeNull();
		}
	});

	test('sin tipos en el modelo: null para todo', () => {
		expect(restoreTargetType([], 'pages')).toBeNull();
	});
});
