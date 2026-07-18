/**
 * Tests de `fieldIds` (Fase F5-a): determinismo (mismo `name` → mismos ids siempre, base de que
 * `FieldRow` y el widget del registry no se desincronicen) y que los tres ids sean distintos
 * entre sí para un mismo campo.
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
});
