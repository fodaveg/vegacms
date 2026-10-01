import { describe, expect, test } from 'vitest';
import type { ServerSettings } from './server-settings';
import {
	CRON_DAILY,
	CRON_WEEKLY,
	buildServerSettingsPatch,
	cronFor,
	frequencyOf,
	isEmptyPatch,
	isValidMaxKeep
} from './server-settings-rules';

const CURRENT: ServerSettings = {
	meta: { appURL: 'https://cms.example.test' },
	smtp: { enabled: true, host: 'smtp.example.test', port: 587, username: 'u', tls: true },
	backups: {
		cron: CRON_DAILY,
		cronMaxKeep: 7,
		s3: {
			enabled: true,
			endpoint: 'https://s3.example.test',
			bucket: 'copias',
			region: 'eu',
			accessKey: 'AK',
			forcePathStyle: false
		}
	}
};

describe('frequencyOf / cronFor', () => {
	test('reconoce las dos expresiones de la lista y la cadena vacía', () => {
		expect([frequencyOf(''), frequencyOf(CRON_DAILY), frequencyOf(CRON_WEEKLY)]).toEqual([
			'never',
			'daily',
			'weekly'
		]);
	});

	test('tolera espacios de más y trata cualquier otra expresión (también una macro) como personalizada', () => {
		expect([
			frequencyOf('  0  0 * * * '),
			frequencyOf('30 3 * * 1,4'),
			frequencyOf('@daily')
		]).toEqual(['daily', 'custom', 'custom']);
	});

	test('«Nunca» guarda la cadena vacía y «personalizada» la expresión limpia', () => {
		expect([
			cronFor('never', 'x'),
			cronFor('daily', 'x'),
			cronFor('weekly', 'x'),
			cronFor('custom', ' 30  3 * * 1,4 ')
		]).toEqual(['', CRON_DAILY, CRON_WEEKLY, '30 3 * * 1,4']);
	});
});

describe('isValidMaxKeep', () => {
	test.each([
		[1, true],
		[7, true],
		[0, false],
		[-1, false],
		[2.5, false],
		[Number.NaN, false]
	])('%s → %s', (n, expected) => {
		expect(isValidMaxKeep(n)).toBe(expected);
	});
});

describe('buildServerSettingsPatch', () => {
	test('sin cambios, el parche está vacío', () => {
		const patch = buildServerSettingsPatch(CURRENT, {
			backups: { cron: CRON_DAILY, cronMaxKeep: 7, s3: { bucket: 'copias' } }
		});
		expect(isEmptyPatch(patch)).toBe(true);
	});

	test('cambiar la frecuencia y cuántas conservar manda solo esas dos claves, sin tocar backups.s3', () => {
		const patch = buildServerSettingsPatch(CURRENT, {
			backups: { cron: CRON_WEEKLY, cronMaxKeep: 4 }
		});
		expect(patch).toEqual({ backups: { cron: CRON_WEEKLY, cronMaxKeep: 4 } });
	});

	test('«Nunca» manda la cadena vacía (no es «sin cambio»)', () => {
		expect(buildServerSettingsPatch(CURRENT, { backups: { cron: '' } })).toEqual({
			backups: { cron: '' }
		});
	});

	test('cambiar un campo del almacén manda solo ese campo y NUNCA un secreto', () => {
		const patch = buildServerSettingsPatch(CURRENT, {
			backups: { s3: { bucket: 'otro', region: 'eu' } },
			secrets: { backupsS3Secret: { kind: 'set', value: '' } }
		});
		expect(patch).toEqual({ backups: { s3: { bucket: 'otro' } } });
		expect(JSON.stringify(patch)).not.toContain('secret');
	});

	test('una clave secreta nueva viaja; vacía se ignora', () => {
		expect(
			buildServerSettingsPatch(CURRENT, {
				secrets: { backupsS3Secret: { kind: 'set', value: 'nueva-clave' } }
			})
		).toEqual({ backups: { s3: { secret: 'nueva-clave' } } });
		expect(
			buildServerSettingsPatch(CURRENT, {
				secrets: { smtpPassword: { kind: 'set', value: '' } }
			})
		).toEqual({});
	});

	test('«quitar» es el único caso que manda un secreto vacío (la contraseña del correo)', () => {
		expect(
			buildServerSettingsPatch(CURRENT, { secrets: { smtpPassword: { kind: 'clear' } } })
		).toEqual({ smtp: { password: '' } });
	});

	test('volver a este servidor manda solo enabled: false', () => {
		expect(buildServerSettingsPatch(CURRENT, { backups: { s3: { enabled: false } } })).toEqual({
			backups: { s3: { enabled: false } }
		});
	});

	test('meta y smtp: solo lo que cambia', () => {
		expect(
			buildServerSettingsPatch(CURRENT, {
				meta: { appURL: 'https://nuevo.example.test' },
				smtp: { host: 'smtp.example.test', port: 465 }
			})
		).toEqual({ meta: { appURL: 'https://nuevo.example.test' }, smtp: { port: 465 } });
	});

	test('no muta el estado actual ni el borrador', () => {
		const before = structuredClone(CURRENT);
		const draft = { backups: { s3: { bucket: 'otro' } } };
		const draftBefore = structuredClone(draft);
		buildServerSettingsPatch(CURRENT, draft);
		expect([CURRENT, draft]).toEqual([before, draftBefore]);
	});
});
