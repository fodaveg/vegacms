/** Tests de `formatSavedAt`: hoy → solo hora; otro día → fecha y hora. */
import { describe, expect, test } from 'vitest';
import { formatSavedAt } from './saved-at';

describe('formatSavedAt', () => {
	const now = new Date(2026, 8, 30, 18, 30);

	test('hoy: solo la hora', () => {
		const text = formatSavedAt(new Date(2026, 8, 30, 12, 0), now, 'es');
		expect(text).toBe('12:00');
	});

	test('otro día: fecha y hora', () => {
		const text = formatSavedAt(new Date(2026, 8, 29, 12, 0), now, 'es');
		expect(text).toContain('12:00');
		expect(text).toContain('29');
	});

	test('otro mes y año: la fecha distingue, con el locale de la interfaz', () => {
		const text = formatSavedAt(new Date(2025, 0, 5, 9, 5), now, 'en');
		expect(text).toContain('1/5/25');
		expect(text).toMatch(/9:05/);
	});

	test('mismo día pero 23:59 / 00:01 de días distintos: no es hoy', () => {
		const late = new Date(2026, 8, 29, 23, 59);
		const early = new Date(2026, 8, 30, 0, 1);
		expect(formatSavedAt(late, early, 'es')).toContain('29');
	});
});
