/**
 * Tests de `fieldIds` (Fase F5-a): determinismo (mismo `name` → mismos ids siempre, base de que
 * `FieldRow` y el widget del registry no se desincronicen), que los tres ids sean distintos entre
 * sí para un mismo campo, y `scope` (hallazgo p1, lote "formularios y medios"): namespacea sin
 * romper el comportamiento histórico sin él.
 */

import { describe, expect, test } from 'vitest';
import { fieldIds } from './field-ids';

describe('fieldIds', () => {
	test('determinista: mismo name → mismos ids', () => {
		expect(fieldIds('title')).toEqual(fieldIds('title'));
	});

	test('inputId/helpId/errorId son distintos entre sí', () => {
		const ids = fieldIds('title');
		expect(new Set([ids.inputId, ids.helpId, ids.errorId]).size).toBe(3);
	});

	test('nombres de campo distintos → ids distintos (sin colisión)', () => {
		expect(fieldIds('title').inputId).not.toBe(fieldIds('body').inputId);
	});

	test('mismo name, distinto scope → ids distintos (sin colisión entre filas de bloque)', () => {
		expect(fieldIds('heading', 'block-1').inputId).not.toBe(fieldIds('heading', 'block-2').inputId);
	});

	test('sin scope (undefined/null): comportamiento histórico intacto', () => {
		expect(fieldIds('title', undefined)).toEqual(fieldIds('title'));
		expect(fieldIds('title', null)).toEqual(fieldIds('title'));
	});

	test('con scope: determinista, mismo (name, scope) → mismos ids', () => {
		expect(fieldIds('heading', 'block-1')).toEqual(fieldIds('heading', 'block-1'));
	});
});
