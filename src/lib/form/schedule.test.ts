/**
 * `schedule.ts` (lote 12, lámina 2): la función pura que decide qué control de programación toca
 * junto al campo Estado, y las dos piezas de fecha del diálogo.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { OVERDUE_GRACE_MS } from '$lib/list/cell';
import { ensureLocaleLoaded, t } from '$lib/i18n';
import { describeScheduleControl, formatScheduleMoment, proposeScheduleLocal } from './schedule';

const type = { statusField: 'status', publishAtField: 'publishAt' };
const NOW = Date.parse('2026-10-01T10:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

describe('describeScheduleControl', () => {
	test('2.5 borrador sin fecha: «Programar…»', () => {
		expect(
			describeScheduleControl(type, { status: 'draft', publishAt: null }, 'active', false, NOW)
		).toEqual({ kind: 'draft', unconfirmed: false });
		expect(describeScheduleControl(type, { status: 'draft' }, 'active', false, NOW)).toEqual({
			kind: 'draft',
			unconfirmed: false
		});
	});

	test('2.6 borrador con fecha futura: programada, con su fecha', () => {
		const at = NOW + 86_400_000;
		expect(
			describeScheduleControl(type, { status: 'draft', publishAt: iso(at) }, 'active', false, NOW)
		).toEqual({ kind: 'scheduled', at, unconfirmed: false });
	});

	test('2.7 publicada: sin control', () => {
		expect(
			describeScheduleControl(
				type,
				{ status: 'published', publishAt: iso(NOW + 1000) },
				'active',
				false,
				NOW
			)
		).toEqual({ kind: 'none' });
	});

	test('2.8 fecha pasada hace más de 5 minutos: no se publicó; dentro del margen, borrador normal', () => {
		const late = NOW - OVERDUE_GRACE_MS;
		expect(
			describeScheduleControl(type, { status: 'draft', publishAt: iso(late) }, 'active', false, NOW)
		).toEqual({ kind: 'overdue', at: late, unconfirmed: false });
		// Un milisegundo antes del plazo todavía no se señala.
		expect(
			describeScheduleControl(
				type,
				{ status: 'draft', publishAt: iso(late + 1) },
				'active',
				false,
				NOW
			)
		).toEqual({ kind: 'draft', unconfirmed: false });
	});

	test('2.9 servidor comprobado sin la extensión: ningún control, tenga la fecha que tenga', () => {
		for (const publishAt of [null, iso(NOW + 1000), iso(NOW - 10 * OVERDUE_GRACE_MS)]) {
			expect(
				describeScheduleControl(type, { status: 'draft', publishAt }, 'inactive', false, NOW)
			).toEqual({ kind: 'none' });
		}
	});

	test('2.3 servidor sin comprobar: se ofrece, marcado como sin confirmar', () => {
		expect(describeScheduleControl(type, { status: 'draft' }, 'unknown', false, NOW)).toEqual({
			kind: 'draft',
			unconfirmed: true
		});
		const at = NOW + 1000;
		expect(
			describeScheduleControl(type, { status: 'draft', publishAt: iso(at) }, 'unknown', false, NOW)
		).toEqual({ kind: 'scheduled', at, unconfirmed: true });
	});

	test('solo lectura, o tipo sin estado o sin «Publicar el»: ningún control', () => {
		const draft = { status: 'draft' };
		expect(describeScheduleControl(type, draft, 'active', true, NOW)).toEqual({ kind: 'none' });
		expect(
			describeScheduleControl({ ...type, publishAtField: null }, draft, 'active', false, NOW)
		).toEqual({ kind: 'none' });
		expect(
			describeScheduleControl({ ...type, statusField: null }, draft, 'active', false, NOW)
		).toEqual({ kind: 'none' });
	});

	test('una fecha ilegible cuenta como sin fecha', () => {
		expect(
			describeScheduleControl(
				type,
				{ status: 'draft', publishAt: 'no-es-fecha' },
				'active',
				false,
				NOW
			)
		).toEqual({ kind: 'draft', unconfirmed: false });
	});
});

describe('proposeScheduleLocal', () => {
	test('mañana a las 09:00 hora local, en el formato de datetime-local', () => {
		const now = new Date(2026, 9, 1, 22, 30).getTime();
		expect(proposeScheduleLocal(now)).toBe('2026-10-02T09:00');
	});

	test('cruza el fin de mes', () => {
		const now = new Date(2026, 9, 31, 8, 0).getTime();
		expect(proposeScheduleLocal(now)).toBe('2026-11-01T09:00');
	});
});

describe('formatScheduleMoment', () => {
	const at = new Date(2026, 9, 2, 9, 0).getTime();
	const now = new Date(2026, 9, 1, 12, 0).getTime();

	test('en español: «2 oct a las 09:00»', () => {
		const text = formatScheduleMoment(at, 'es', (k, p) => t('es', k, p), now);
		expect(text).toMatch(/^2 oct\.? a las 09:00$/);
	});

	// El catálogo inglés se carga bajo demanda.
	beforeAll(() => ensureLocaleLoaded('en'));

	test('en inglés, con su orden y su «at»', () => {
		const text = formatScheduleMoment(at, 'en', (k, p) => t('en', k, p), now);
		expect(text).toMatch(/^Oct 2 at 0?9:00/);
	});

	test('otro año: el año aparece', () => {
		const next = new Date(2027, 0, 5, 9, 0).getTime();
		expect(formatScheduleMoment(next, 'es', (k, p) => t('es', k, p), now)).toContain('2027');
	});
});
