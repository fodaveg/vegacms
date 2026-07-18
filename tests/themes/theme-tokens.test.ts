/**
 * Vocabulario cerrado (§3/§9.9 del contrato P7, L1): `THEME_TOKENS` (la lista declarada en
 * `theme-tokens.ts`) debe ser EXACTAMENTE el conjunto de custom properties que el generador
 * declara (`emittedTokenNames()` de `build-themes.mjs`) — ningún token emitido queda fuera del
 * vocabulario, y ningún token del vocabulario se queda sin emitir.
 */

import { describe, expect, test } from 'vitest';
import { emittedTokenNames } from '../../scripts/build-themes.mjs';
import { isThemeToken, THEME_TOKEN_NAMES, THEME_TOKENS } from '$lib/themes/theme-tokens';

describe('Vocabulario cerrado (L1)', () => {
	test('THEME_TOKEN_NAMES == emittedTokenNames() (mismo set, sin huecos en ningún sentido)', () => {
		const declared = new Set(THEME_TOKEN_NAMES);
		const emitted = emittedTokenNames();

		const declaredNotEmitted = [...declared].filter((t) => !emitted.has(t));
		const emittedNotDeclared = [...emitted].filter((t) => !declared.has(t));

		expect(declaredNotEmitted).toEqual([]);
		expect(emittedNotDeclared).toEqual([]);
	});

	test('sin nombres duplicados en THEME_TOKENS', () => {
		expect(THEME_TOKEN_NAMES.length).toBe(new Set(THEME_TOKEN_NAMES).size);
	});

	test('isThemeToken reconoce los del vocabulario y rechaza uno inventado', () => {
		expect(isThemeToken('ink')).toBe(true);
		expect(isThemeToken('accent-text')).toBe(true);
		expect(isThemeToken('vega-color-bg')).toBe(false); // vocabulario de P3, NO el de P7
	});

	test('cada token declara familia y descripción no vacías', () => {
		for (const t of THEME_TOKENS) {
			expect(t.name.length).toBeGreaterThan(0);
			expect(t.description.length).toBeGreaterThan(0);
			expect(typeof t.themeWritable).toBe('boolean');
		}
	});
});
