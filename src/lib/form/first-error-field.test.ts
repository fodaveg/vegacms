/**
 * Tests de `firstErrorFieldName` (Fase F5-g, L-P5.2): el primer campo con error en el ORDEN de
 * `fields`, sin importar el orden de inserción de `errors.byField`. Fixtures a mano, mismo
 * criterio que `form-model.test.ts`.
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import type { ResolvedField } from '$lib/model/types';
import { firstErrorFieldName } from './first-error-field';
import type { FieldErrorsView, TranslatedError } from './field-errors';

function makeField(
	name: string,
	overrides: Partial<Omit<ResolvedField, 'schema'>> = {}
): ResolvedField {
	const schema: Field = {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	return {
		schema,
		name,
		label: name,
		help: null,
		placeholder: null,
		hidden: false,
		group: null,
		widget: 'text',
		subtype: null,
		listable: false,
		...overrides
	};
}

const dummyError: TranslatedError = { code: 'required', message: 'Obligatorio', known: true };

function errorsFor(...names: string[]): FieldErrorsView {
	const byField: Record<string, TranslatedError> = {};
	for (const name of names) byField[name] = dummyError;
	return { byField, record: null };
}

describe('firstErrorFieldName', () => {
	const fields = [
		makeField('title'),
		makeField('tags', { widget: 'chips' }),
		makeField('relatedPost', { widget: 'relation' }),
		makeField('body')
	];

	test('sin errores → null', () => {
		expect(firstErrorFieldName(fields, { byField: {}, record: null })).toBeNull();
	});

	test('un único campo con error → ese', () => {
		expect(firstErrorFieldName(fields, errorsFor('body'))).toBe('body');
	});

	test('varios campos con error → el PRIMERO en el orden de `fields`, no el de inserción', () => {
		// `errorsFor` inserta 'body' antes que 'title' en el objeto — el orden de `Object.keys` no
		// debe filtrarse: `title` va antes en `fields`, así que gana.
		expect(firstErrorFieldName(fields, errorsFor('body', 'title'))).toBe('title');
	});

	test('el primer error cae en un widget de tipo GRUPO (chips/relation) → se devuelve igual', () => {
		expect(firstErrorFieldName(fields, errorsFor('relatedPost', 'tags'))).toBe('tags');
	});

	test("solo error de REGISTRO (clave '', sin campo) → null, nada que enfocar", () => {
		expect(firstErrorFieldName(fields, { byField: {}, record: dummyError })).toBeNull();
	});

	test('sin campos → null', () => {
		expect(firstErrorFieldName([], errorsFor('title'))).toBeNull();
	});
});
