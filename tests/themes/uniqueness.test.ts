/**
 * Unicidad e índice (§4.4/§5.3/§9.4 del contrato P7): id duplicado entre ficheros, alias que
 * colisiona con un id existente o se repite, `index.json` incoherente con los ficheros.
 */

import { describe, expect, test } from 'vitest';
import {
	findDuplicateThemeIds,
	validateIndexCoherence,
	validateUniqueness
} from '../../scripts/build-themes.mjs';
import { makeTheme } from './fixture';

describe('findDuplicateThemeIds', () => {
	test('id duplicado entre dos ficheros → error', () => {
		const themes = [
			makeTheme({ id: 'dup', __file: 'a.theme.json' }),
			makeTheme({ id: 'dup', __file: 'b.theme.json' })
		];
		const errors: string[] = [];
		findDuplicateThemeIds(themes, errors);
		expect(errors.length).toBe(1);
		expect(errors[0]).toContain('dup');
		expect(errors[0]).toContain('a.theme.json');
		expect(errors[0]).toContain('b.theme.json');
	});

	test('sin duplicados → pasa', () => {
		const themes = [
			makeTheme({ id: 'a', __file: 'a.theme.json' }),
			makeTheme({ id: 'b', __file: 'b.theme.json' })
		];
		const errors: string[] = [];
		findDuplicateThemeIds(themes, errors);
		expect(errors).toEqual([]);
	});
});

describe('validateUniqueness (aliases)', () => {
	test('alias que colisiona con un id existente → error', () => {
		const themes = [
			makeTheme({ id: 'niebla', aliases: ['miel'] }), // "miel" es un id de OTRO tema
			makeTheme({ id: 'miel', aliases: [] })
		];
		const errors: string[] = [];
		validateUniqueness(themes, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/colisiona con un id existente/);
	});

	test('alias duplicado entre dos temas → error', () => {
		const themes = [
			makeTheme({ id: 'a', aliases: ['viejo'] }),
			makeTheme({ id: 'b', aliases: ['viejo'] })
		];
		const errors: string[] = [];
		validateUniqueness(themes, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/duplicado/);
	});

	test('aliases sin colisión → pasa', () => {
		const themes = [makeTheme({ id: 'niebla', aliases: ['grafito'] }), makeTheme({ id: 'miel' })];
		const errors: string[] = [];
		validateUniqueness(themes, errors);
		expect(errors).toEqual([]);
	});
});

describe('validateIndexCoherence', () => {
	test('index.json referencia un id que no existe → error', () => {
		const themes = [makeTheme({ id: 'a' })];
		const errors: string[] = [];
		validateIndexCoherence(themes, ['a', 'fantasma'], errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('fantasma');
	});

	test('un tema parseado que no está en index.json → error', () => {
		const themes = [
			makeTheme({ id: 'a', __file: 'a.theme.json' }),
			makeTheme({ id: 'b', __file: 'b.theme.json' })
		];
		const errors: string[] = [];
		validateIndexCoherence(themes, ['a'], errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('b');
	});

	test('index.json y ficheros coherentes → pasa', () => {
		const themes = [makeTheme({ id: 'a' }), makeTheme({ id: 'b' })];
		const errors: string[] = [];
		validateIndexCoherence(themes, ['a', 'b'], errors);
		expect(errors).toEqual([]);
	});
});
