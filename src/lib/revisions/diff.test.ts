/**
 * Suite de `diffRecordValues` (`#lote-integridad`, Fase B §9): igualdad estructural para arrays
 * (orden importa) y objetos (orden de claves no importa), campos `readonly` excluidos,
 * presente-en-uno-ausente-en-otro es `added`/`removed` y nunca `changed`.
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import { diffRecordValues } from './diff';

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

function relationField(name: string, multiple: boolean): Field {
	return {
		name,
		type: 'relation',
		target: 'other',
		multiple,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	} as Field;
}

function jsonField(name: string): Field {
	return {
		name,
		type: 'json',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	} as Field;
}

describe('diffRecordValues', () => {
	test('valor escalar sin cambios → same', () => {
		const fields = [textField('title')];
		const result = diffRecordValues(fields, { title: 'X' }, { title: 'X' });
		expect(result).toEqual([{ field: 'title', status: 'same', before: 'X', after: 'X' }]);
	});

	test('valor escalar distinto → changed', () => {
		const fields = [textField('title')];
		const result = diffRecordValues(fields, { title: 'Antes' }, { title: 'Después' });
		expect(result).toEqual([
			{ field: 'title', status: 'changed', before: 'Antes', after: 'Después' }
		]);
	});

	test('campo readonly se EXCLUYE del diff (§9: "cambian siempre y son ruido puro")', () => {
		const fields = [textField('updated', { readonly: true })];
		const result = diffRecordValues(fields, { updated: 'a' }, { updated: 'b' });
		expect(result).toEqual([]);
	});

	test('presente en uno y ausente en el otro: added/removed, nunca changed', () => {
		const fields = [textField('extra')];
		expect(diffRecordValues(fields, {}, { extra: 'nuevo' })).toEqual([
			{ field: 'extra', status: 'added', before: undefined, after: 'nuevo' }
		]);
		expect(diffRecordValues(fields, { extra: 'viejo' }, {})).toEqual([
			{ field: 'extra', status: 'removed', before: 'viejo', after: undefined }
		]);
	});

	test('ausente en los DOS lados: no produce entrada', () => {
		const fields = [textField('extra')];
		expect(diffRecordValues(fields, {}, {})).toEqual([]);
	});

	test('relación múltiple: mismo contenido y mismo orden → same', () => {
		const fields = [relationField('tags', true)];
		const result = diffRecordValues(fields, { tags: ['a', 'b'] }, { tags: ['a', 'b'] });
		expect(result[0].status).toBe('same');
	});

	test('relación múltiple: mismo contenido, orden distinto → changed (§9: "mismo contenido Y mismo orden")', () => {
		const fields = [relationField('tags', true)];
		const result = diffRecordValues(fields, { tags: ['a', 'b'] }, { tags: ['b', 'a'] });
		expect(result[0].status).toBe('changed');
	});

	test('campo json: igualdad estructural profunda, sin mirar orden de claves', () => {
		const fields = [jsonField('meta')];
		const result = diffRecordValues(fields, { meta: { a: 1, b: 2 } }, { meta: { b: 2, a: 1 } });
		expect(result[0].status).toBe('same');
	});

	test('campo json con un valor distinto anidado → changed', () => {
		const fields = [jsonField('meta')];
		const result = diffRecordValues(fields, { meta: { a: 1 } }, { meta: { a: 2 } });
		expect(result[0].status).toBe('changed');
	});

	test('respeta el orden de fields de entrada', () => {
		const fields = [textField('b'), textField('a')];
		const result = diffRecordValues(fields, { a: '1', b: '2' }, { a: '9', b: '9' });
		expect(result.map((d) => d.field)).toEqual(['b', 'a']);
	});
});
