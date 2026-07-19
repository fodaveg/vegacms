/**
 * Tests DOM de `theme/apply.ts` (Fase F7w-a): `apply.ts` toca `document`/`localStorage`
 * directamente (a diferencia de `theme.svelte.ts`, que recibe un `root` como parámetro), así que
 * necesita jsdom real — de ahí la convención `*.dom.test.ts` (ver `focus-target.dom.test.ts`),
 * en vez de vivir junto a `theme-preferences.test.ts` (proyecto `server`, sin DOM).
 *
 * `apply.ts` no tenía test unitario antes de esta fase; se cubre aquí `setTheme` (el setter
 * nuevo) y, de paso, `setMode`/`setDensity` (ya existentes, sin cobertura), con el mismo patrón:
 * llamar al setter y comprobar `data-*` + persistencia en `localStorage`.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { setDensity, setMode, setTheme } from './apply';
import { STORAGE_KEYS } from './preferences';

beforeEach(() => {
	document.documentElement.removeAttribute('data-theme');
	document.documentElement.removeAttribute('data-mode');
	document.documentElement.removeAttribute('data-density');
	localStorage.clear();
});

describe('setTheme', () => {
	test('refleja el id en data-theme', () => {
		setTheme('terracota');
		expect(document.documentElement.dataset.theme).toBe('terracota');
	});

	test('persiste el id en localStorage (vega.theme.v1)', () => {
		setTheme('salvia');
		expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('salvia');
	});

	test('no valida el id: uno desconocido se escribe igual (degrada en el CSS, no aquí)', () => {
		setTheme('esto-no-existe');
		expect(document.documentElement.dataset.theme).toBe('esto-no-existe');
	});
});

describe('setMode', () => {
	test('refleja el modo en data-mode y en color-scheme', () => {
		setMode('dark');
		expect(document.documentElement.dataset.mode).toBe('dark');
		expect(document.documentElement.style.colorScheme).toBe('dark');
	});

	test('persiste el modo en localStorage (vega.mode.v1)', () => {
		setMode('light');
		expect(localStorage.getItem(STORAGE_KEYS.mode)).toBe('light');
	});
});

describe('setDensity', () => {
	test('refleja la densidad en data-density', () => {
		setDensity('compact');
		expect(document.documentElement.dataset.density).toBe('compact');
	});

	test('persiste la densidad en localStorage (vega.density.v1)', () => {
		setDensity('compact');
		expect(localStorage.getItem(STORAGE_KEYS.density)).toBe('compact');
	});
});
