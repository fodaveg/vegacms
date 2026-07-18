/**
 * `resolveDefaultTheme` (§6.4/§9.7 del contrato P7): las 4 ramas de la cascada + resolución de
 * alias sin aviso. Fixtures 100% sintéticos (no depende de los 5 temas reales).
 */

import { describe, expect, test } from 'vitest';
import { resolveDefaultTheme } from '$lib/themes/resolve-default';

const KNOWN_IDS = ['niebla', 'miel', 'grafito']; // 'grafito' = alias de 'niebla' en este fixture
const ALIASES = { grafito: 'niebla' };
const FALLBACK = 'niebla';

describe('resolveDefaultTheme — las 4 ramas de la cascada (§6.4)', () => {
	test('1. stored válido → gana, sin aviso', () => {
		const result = resolveDefaultTheme({
			stored: 'miel',
			manifestDefault: 'niebla',
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: 'miel', notice: null });
	});

	test('2. sin stored, manifestDefault válido → gana, sin aviso', () => {
		const result = resolveDefaultTheme({
			stored: null,
			manifestDefault: 'miel',
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: 'miel', notice: null });
	});

	test('3. manifestDefault presente pero desconocido → fallback + notice default-theme-unknown', () => {
		const result = resolveDefaultTheme({
			stored: null,
			manifestDefault: 'fantasma',
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result.themeId).toBe(FALLBACK);
		expect(result.notice).not.toBeNull();
		expect(result.notice?.code).toBe('default-theme-unknown');
		expect(result.notice?.message).toContain('fantasma');
		expect(result.notice?.message).toContain(FALLBACK);
	});

	test('4. ausente en ambos → fallback, sin aviso (PB virgen, §12.9)', () => {
		const result = resolveDefaultTheme({
			stored: null,
			manifestDefault: null,
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: FALLBACK, notice: null });
	});
});

describe('Alias (§12.2/§6.4)', () => {
	test('stored es un alias → resuelve al id canónico, sin aviso', () => {
		const result = resolveDefaultTheme({
			stored: 'grafito',
			manifestDefault: null,
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: 'niebla', notice: null });
	});

	test('manifestDefault es un alias → resuelve al id canónico, sin aviso', () => {
		const result = resolveDefaultTheme({
			stored: null,
			manifestDefault: 'grafito',
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: 'niebla', notice: null });
	});
});

describe('Casos límite adicionales (§12)', () => {
	test('§12.3: stored de una versión más nueva (tema retirado) → cae a manifestDefault, sin crash', () => {
		const result = resolveDefaultTheme({
			stored: 'tema-retirado-v3',
			manifestDefault: 'miel',
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: 'miel', notice: null });
	});

	test('§12.3: stored y manifestDefault ambos desconocidos → fallback + notice (del manifiesto), sin crash', () => {
		const result = resolveDefaultTheme({
			stored: 'tema-retirado-v3',
			manifestDefault: 'tambien-desconocido',
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result.themeId).toBe(FALLBACK);
		expect(result.notice?.code).toBe('default-theme-unknown');
	});

	test('stored desconocido y SIN manifestDefault → fallback, sin aviso (el aviso es solo de manifestDefault)', () => {
		const result = resolveDefaultTheme({
			stored: 'tema-retirado-v3',
			manifestDefault: null,
			knownIds: KNOWN_IDS,
			aliases: ALIASES,
			fallback: FALLBACK
		});
		expect(result).toEqual({ themeId: FALLBACK, notice: null });
	});
});
