/**
 * `update/storage.ts`: toca `localStorage` de verdad, así que va en el proyecto `dom` (jsdom) —
 * mismo criterio que `session/backend-override.dom.test.ts`/`theme/apply.dom.test.ts`.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
	readAutoCheckPreference,
	readCachedUpdateCheck,
	readDismissedVersion,
	writeAutoCheckPreference,
	writeCachedUpdateCheck,
	writeDismissedVersion
} from './storage';

beforeEach(() => {
	localStorage.clear();
});

describe('caché de la comprobación (vega.updateCheck.v1)', () => {
	test('sin nada guardado → null', () => {
		expect(readCachedUpdateCheck()).toBeNull();
	});

	test('round-trip con timestamp', () => {
		const status = {
			kind: 'update-available' as const,
			current: '1.0.0',
			latest: '1.1.0',
			releaseUrl: 'https://example.com'
		};
		writeCachedUpdateCheck(status);
		const cached = readCachedUpdateCheck();
		expect(cached?.status).toEqual(status);
		expect(typeof cached?.checkedAt).toBe('number');
	});

	test('contenido corrupto/con forma inesperada → null, no lanza', () => {
		localStorage.setItem('vega.updateCheck.v1', '{ esto no es JSON');
		expect(readCachedUpdateCheck()).toBeNull();
		localStorage.setItem('vega.updateCheck.v1', JSON.stringify({ foo: 'bar' }));
		expect(readCachedUpdateCheck()).toBeNull();
	});
});

describe('preferencia de auto-check (vega.updateAutoCheck.v1)', () => {
	test('sin preferencia guardada → false (default OFF)', () => {
		expect(readAutoCheckPreference()).toBe(false);
	});

	test('round-trip true/false', () => {
		writeAutoCheckPreference(true);
		expect(readAutoCheckPreference()).toBe(true);
		writeAutoCheckPreference(false);
		expect(readAutoCheckPreference()).toBe(false);
	});
});

describe('versión descartada (vega.updateDismissedVersion.v1)', () => {
	test('sin nada guardado → null', () => {
		expect(readDismissedVersion()).toBeNull();
	});

	test('round-trip', () => {
		writeDismissedVersion('1.1.0');
		expect(readDismissedVersion()).toBe('1.1.0');
	});
});
