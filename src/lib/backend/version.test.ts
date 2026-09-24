/**
 * `recordVersion` (`version.ts`): la huella que decide si un `update` con versión esperada es un
 * conflicto. Lo que importa aquí es que NO dé conflictos falsos (misma información, misma huella)
 * y que sí cambie cuando cambia un dato que el usuario podría perder.
 */
import { describe, expect, test } from 'vitest';
import { recordVersion } from './version';

const rec = (values: Record<string, unknown>) =>
	({ values }) as Parameters<typeof recordVersion>[0];

describe('recordVersion', () => {
	test('es determinista y opaca (una cadena corta, no los valores)', () => {
		const values = { title: 'Hola', body: '<p>texto largo</p>'.repeat(50) };
		expect(recordVersion(rec(values))).toBe(recordVersion(rec({ ...values })));
		expect(recordVersion(rec(values)).length).toBeLessThan(20);
	});

	test('el orden de las claves (registro o json anidado) no es un cambio', () => {
		const a = rec({ title: 'x', meta: { a: 1, b: { c: 2, d: 3 } } });
		const b = rec({ meta: { b: { d: 3, c: 2 }, a: 1 }, title: 'x' });
		expect(recordVersion(a)).toBe(recordVersion(b));
	});

	test('el orden de un array SÍ es un cambio (relación o select múltiple reordenados)', () => {
		expect(recordVersion(rec({ tags: ['a', 'b'] }))).not.toBe(
			recordVersion(rec({ tags: ['b', 'a'] }))
		);
	});

	test('cualquier valor distinto cambia la versión, también solo `updated`', () => {
		const base = { title: 'x', updated: '2026-09-24T10:00:00.000Z' };
		const v = recordVersion(rec(base));
		expect(recordVersion(rec({ ...base, title: 'y' }))).not.toBe(v);
		expect(recordVersion(rec({ ...base, updated: '2026-09-24T10:00:00.001Z' }))).not.toBe(v);
	});

	test('null, cadena vacía, 0 y false no se confunden entre sí', () => {
		const versions = [null, '', 0, false, [], {}].map((value) => recordVersion(rec({ f: value })));
		expect(new Set(versions).size).toBe(versions.length);
	});
});
