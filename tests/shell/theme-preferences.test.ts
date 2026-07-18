/**
 * Suite A (§7 del contrato P3): helpers puros de `theme/preferences.ts` — resolución de modo
 * inicial (pref guardada vs `prefers-color-scheme`), densidad inicial y default de tema.
 */

import { describe, expect, test } from 'vitest';
import {
	DEFAULT_DENSITY,
	DEFAULT_THEME_ID,
	resolveDefaultTheme,
	resolveInitialDensity,
	resolveInitialMode
} from '$lib/theme/preferences';

describe('resolveInitialMode', () => {
	test('preferencia guardada gana sobre prefers-color-scheme', () => {
		expect(resolveInitialMode('light', true)).toBe('light');
		expect(resolveInitialMode('dark', false)).toBe('dark');
	});

	test('sin preferencia guardada → sigue prefers-color-scheme', () => {
		expect(resolveInitialMode(null, true)).toBe('dark');
		expect(resolveInitialMode(null, false)).toBe('light');
	});
});

describe('resolveInitialDensity', () => {
	test('preferencia guardada gana', () => {
		expect(resolveInitialDensity('compact')).toBe('compact');
	});

	test('sin preferencia → default (comfortable)', () => {
		expect(resolveInitialDensity(null)).toBe(DEFAULT_DENSITY);
		expect(resolveInitialDensity(null)).toBe('comfortable');
	});
});

describe('resolveDefaultTheme', () => {
	test('site.defaultTheme gana si está presente', () => {
		expect(resolveDefaultTheme('midnight')).toBe('midnight');
	});

	test('null → tema base neutro de P3', () => {
		expect(resolveDefaultTheme(null)).toBe(DEFAULT_THEME_ID);
		expect(resolveDefaultTheme(null)).toBe('base');
	});
});
