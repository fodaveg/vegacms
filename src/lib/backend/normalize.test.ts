/**
 * Tests unitarios de `normalizeFieldValue` para el caso `date` con `raw` no parseable (§2.1,
 * L5/L10: "string ISO 8601 UTC | null", nunca un valor NO-ISO escapando sin normalizar).
 */

import { describe, expect, test } from 'vitest';
import type { Field } from './types';
import { normalizeFieldValue } from './normalize';

const dateField: Field = {
	name: 'publishedAt',
	type: 'date',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
};

describe('normalizeFieldValue — date con raw no parseable (bug corregido)', () => {
	test('string no parseable como fecha → null, NUNCA el string crudo (violaría L5/L10)', () => {
		expect(normalizeFieldValue(dateField, 'esto no es una fecha')).toBeNull();
	});

	test('string vacío → null (caso ya cubierto, sigue igual)', () => {
		expect(normalizeFieldValue(dateField, '')).toBeNull();
	});

	test('valor con espacio (formato PB, no ISO con T) sigue normalizando a ISO con T', () => {
		expect(normalizeFieldValue(dateField, '2026-01-01 00:00:00.000Z')).toBe(
			'2026-01-01T00:00:00.000Z'
		);
	});

	test('undefined/null → null', () => {
		expect(normalizeFieldValue(dateField, undefined)).toBeNull();
		expect(normalizeFieldValue(dateField, null)).toBeNull();
	});

	test('un número (tipo equivocado) → null, no se deja pasar como si fuera fecha', () => {
		expect(normalizeFieldValue(dateField, 12345)).toBeNull();
	});
});
