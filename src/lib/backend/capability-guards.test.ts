/**
 * Suite de `capability-guards.ts`: los dos adaptadores reales fijan `explicitRecordId: true`
 * incondicionalmente (v1), así que la rama de rechazo NUNCA la ejercita el contrato contra un
 * backend real — este fichero es la única cobertura de esa rama, con unas `capabilities`
 * fabricadas a mano (el "puerto falso" del review).
 */
import { describe, expect, test } from 'vitest';
import { assertExplicitRecordIdCapability } from './capability-guards';
import { VegaError } from './errors';

describe('assertExplicitRecordIdCapability (ley L8)', () => {
	test('sin la capability y con id explícito, rechaza con VegaError "backend"', () => {
		expect(() => assertExplicitRecordIdCapability({ explicitRecordId: false }, true)).toThrow(
			VegaError
		);
		try {
			assertExplicitRecordIdCapability({ explicitRecordId: false }, true);
			expect.unreachable('debía lanzar');
		} catch (err) {
			expect(err).toBeInstanceOf(VegaError);
			expect((err as VegaError).kind).toBe('backend');
		}
	});

	test('sin la capability pero SIN id explícito, no rechaza (create de siempre, intacto)', () => {
		expect(() =>
			assertExplicitRecordIdCapability({ explicitRecordId: false }, false)
		).not.toThrow();
	});

	test('con la capability presente, nunca rechaza aunque haya id explícito', () => {
		expect(() => assertExplicitRecordIdCapability({ explicitRecordId: true }, true)).not.toThrow();
	});
});
