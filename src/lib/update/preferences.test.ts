/**
 * `shouldShowUpdateBanner` (P8): función PURA que decide si `UpdateBanner` debe pintarse. Ver la
 * cabecera de `preferences.ts`.
 */

import { describe, expect, test } from 'vitest';
import { shouldShowUpdateBanner } from './preferences';
import type { CachedUpdateCheck } from './storage';

function cachedOf(status: CachedUpdateCheck['status']): CachedUpdateCheck {
	return { checkedAt: Date.now(), status };
}

describe('shouldShowUpdateBanner', () => {
	test('sin caché (nunca se ha comprobado nada) → no se muestra', () => {
		expect(shouldShowUpdateBanner(null, null)).toBe(false);
	});

	test('caché "up-to-date" → no se muestra', () => {
		const cached = cachedOf({ kind: 'up-to-date', current: '1.0.0', latest: '1.0.0' });
		expect(shouldShowUpdateBanner(cached, null)).toBe(false);
	});

	test('caché "error" → no se muestra', () => {
		const cached = cachedOf({ kind: 'error', reason: 'boom' });
		expect(shouldShowUpdateBanner(cached, null)).toBe(false);
	});

	test('"update-available" sin versión descartada → se muestra', () => {
		const cached = cachedOf({
			kind: 'update-available',
			current: '1.0.0',
			latest: '1.1.0',
			releaseUrl: 'https://example.com'
		});
		expect(shouldShowUpdateBanner(cached, null)).toBe(true);
	});

	test('"update-available" con la MISMA versión ya descartada → no se muestra', () => {
		const cached = cachedOf({
			kind: 'update-available',
			current: '1.0.0',
			latest: '1.1.0',
			releaseUrl: 'https://example.com'
		});
		expect(shouldShowUpdateBanner(cached, '1.1.0')).toBe(false);
	});

	test('"update-available" con una versión descartada DISTINTA (ya superada) → se muestra', () => {
		const cached = cachedOf({
			kind: 'update-available',
			current: '1.0.0',
			latest: '1.2.0',
			releaseUrl: 'https://example.com'
		});
		// El usuario descartó 1.1.0 en su día; ahora hay una 1.2.0 más nueva todavía → reaparece.
		expect(shouldShowUpdateBanner(cached, '1.1.0')).toBe(true);
	});
});
