import { describe, expect, test } from 'vitest';
import { formatDay, formatDayTime, formatElapsed } from './format';

describe('formatElapsed', () => {
	test('minutos:segundos y, pasada la hora, horas:minutos:segundos', () => {
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(42_400)).toBe('0:42');
		expect(formatElapsed(725_000)).toBe('12:05');
		expect(formatElapsed(3_729_000)).toBe('1:02:09');
		expect(formatElapsed(-5)).toBe('0:00');
	});
});

describe('formatDay / formatDayTime', () => {
	test('fecha media del locale, con hora solo en la de las copias', () => {
		expect(formatDay('2026-02-03T10:00:00.000Z', 'es')).toBe(
			new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(
				new Date('2026-02-03T10:00:00Z')
			)
		);
		expect(formatDayTime('2026-09-24T10:15:30.000Z', 'en')).toBe(
			new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
				new Date('2026-09-24T10:15:30Z')
			)
		);
	});

	test('una fecha ilegible da cadena vacía, nunca «Invalid Date»', () => {
		expect(formatDay('ayer', 'es')).toBe('');
		expect(formatDayTime('', 'es')).toBe('');
	});
});
