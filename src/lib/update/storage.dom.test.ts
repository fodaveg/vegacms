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

describe('localStorage que LANZA (modo privado agresivo / cuota llena)', () => {
	/** `getItem`/`setItem` reales de `Storage.prototype` lanzando, mismo escenario que Safari en
	 *  modo privado agresivo o una cuota llena (D-P8, ver cabecera del módulo): cada lectura y
	 *  escritura de `storage.ts` tiene su propio `try/catch`, así que un fallo aquí NUNCA debe
	 *  tumbar la app — solo perder esa persistencia concreta para esta sesión de navegador. */
	function stubThrowing(method: 'getItem' | 'setItem'): () => void {
		const proto = Storage.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
		const original = proto[method];
		proto[method] = () => {
			throw new DOMException('denegado', 'QuotaExceededError');
		};
		return () => {
			proto[method] = original;
		};
	}

	test('readCachedUpdateCheck: getItem que lanza → null, no lanza', () => {
		const restore = stubThrowing('getItem');
		try {
			expect(readCachedUpdateCheck()).toBeNull();
		} finally {
			restore();
		}
	});

	test('writeCachedUpdateCheck: setItem que lanza → no-op silencioso, no lanza', () => {
		const restore = stubThrowing('setItem');
		try {
			expect(() =>
				writeCachedUpdateCheck({ kind: 'up-to-date', current: '1.0.0', latest: '1.0.0' })
			).not.toThrow();
		} finally {
			restore();
		}
		// El fallo de escritura no deja basura a medio escribir: sigue sin haber caché.
		expect(readCachedUpdateCheck()).toBeNull();
	});

	test('readAutoCheckPreference: getItem que lanza → false (default), no lanza', () => {
		const restore = stubThrowing('getItem');
		try {
			expect(readAutoCheckPreference()).toBe(false);
		} finally {
			restore();
		}
	});

	test('writeAutoCheckPreference: setItem que lanza → no-op silencioso, no lanza', () => {
		const restore = stubThrowing('setItem');
		try {
			expect(() => writeAutoCheckPreference(true)).not.toThrow();
		} finally {
			restore();
		}
	});
});
