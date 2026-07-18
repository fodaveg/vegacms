/**
 * Round-trip UTC↔local del widget `datetime` (D-P5.13, ver cabecera de `datetime.ts`). Las
 * pruebas que fijan `process.env.TZ` verifican que la conversión es correcta en CUALQUIER zona
 * (no solo la del runner de CI), sin depender de mocks de `Date`: Node relee `TZ` en cada
 * operación de hora local, así que basta con cambiarla antes de cada caso y restaurarla después.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { isoUtcToLocalInput, localInputToIsoUtc } from './datetime';

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

describe('isoUtcToLocalInput', () => {
	test('ISO no parseable → cadena vacía (degrada sin lanzar)', () => {
		expect(isoUtcToLocalInput('no-es-una-fecha')).toBe('');
	});

	test('trunca a minutos: descarta segundos/milisegundos del ISO de entrada', () => {
		process.env.TZ = 'UTC';
		expect(isoUtcToLocalInput('2024-03-15T10:30:45.123Z')).toBe('2024-03-15T10:30');
	});

	test('rellena el año a 4 dígitos (año < 1000): `datetime-local` exige YYYY', () => {
		process.env.TZ = 'UTC';
		expect(isoUtcToLocalInput('0075-06-01T10:30:00.000Z')).toBe('0075-06-01T10:30');
	});
});

describe('localInputToIsoUtc', () => {
	test('vacío → null', () => {
		expect(localInputToIsoUtc('')).toBeNull();
	});

	test('cadena que no encaja en el patrón → null', () => {
		expect(localInputToIsoUtc('no-es-una-fecha')).toBeNull();
	});

	test('siempre fija segundos/milisegundos a :00.000', () => {
		process.env.TZ = 'UTC';
		expect(localInputToIsoUtc('2024-06-01T09:15')).toBe('2024-06-01T09:15:00.000Z');
	});
});

describe('round-trip ISO UTC → local → ISO UTC (D-P5.13)', () => {
	test('valor ya en minuto exacto es estable en UTC', () => {
		process.env.TZ = 'UTC';
		const iso = '2024-03-15T10:30:00.000Z';
		expect(localInputToIsoUtc(isoUtcToLocalInput(iso))).toBe(iso);
	});

	test('un valor con segundos se trunca al minuto (floor), no se redondea', () => {
		process.env.TZ = 'UTC';
		const iso = '2024-03-15T10:30:45.123Z';
		expect(localInputToIsoUtc(isoUtcToLocalInput(iso))).toBe('2024-03-15T10:30:00.000Z');
	});

	test('estable en una zona con offset negativo (America/Anchorage, sin DST en marzo... UTC-9)', () => {
		process.env.TZ = 'America/Anchorage';
		const iso = '2024-01-10T10:30:00.000Z';
		expect(localInputToIsoUtc(isoUtcToLocalInput(iso))).toBe(iso);
	});

	test('estable en una zona con offset positivo de fracción de hora (Asia/Kathmandu, UTC+5:45)', () => {
		process.env.TZ = 'Asia/Kathmandu';
		const iso = '2024-01-10T18:00:00.000Z';
		expect(localInputToIsoUtc(isoUtcToLocalInput(iso))).toBe(iso);
	});

	test('cruce de medianoche local (Pacific/Kiritimati, UTC+14) sigue siendo estable', () => {
		process.env.TZ = 'Pacific/Kiritimati';
		const iso = '2024-01-10T23:30:00.000Z';
		expect(localInputToIsoUtc(isoUtcToLocalInput(iso))).toBe(iso);
	});

	test('año < 1000 hace round-trip estable (regresión del padding de año)', () => {
		process.env.TZ = 'UTC';
		const iso = '0075-06-01T10:30:00.000Z';
		expect(localInputToIsoUtc(isoUtcToLocalInput(iso))).toBe(iso);
	});
});

describe('round-trip valor local → ISO UTC → valor local', () => {
	test('estable con independencia de la zona del runner', () => {
		process.env.TZ = 'Europe/Madrid';
		const local = '2024-06-01T09:15';
		const iso = localInputToIsoUtc(local);
		expect(iso).not.toBeNull();
		expect(isoUtcToLocalInput(iso as string)).toBe(local);
	});
});
