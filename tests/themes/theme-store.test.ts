/**
 * `theme.svelte.ts` (§6.1/§9.8 del contrato P7, L5 "tres ejes ortogonales"): cambiar un eje
 * (tema/modo/densidad) NUNCA muta los otros dos; `applyTheme` escribe EXACTAMENTE
 * `data-theme`/`data-mode`/`data-density` y nada más; `computeResolvedMode` resuelve `'system'`
 * con el booleano de sistema ya leído (§12.4, "resolvedMode sigue").
 */

import { describe, expect, test } from 'vitest';
import { applyTheme, computeResolvedMode, theme } from '$lib/themes/theme.svelte';

/** El entorno de test corre en Node puro (§ vite.config.ts, sin jsdom/happy-dom): `applyTheme`
 * solo toca `root.dataset`, así que un objeto plano con esa forma basta — evita depender de un
 * `document` real que este proyecto no configura para la suite unitaria. */
function fakeRoot(): HTMLElement {
	return { dataset: {} } as unknown as HTMLElement;
}

describe('Ortogonalidad de los 3 ejes (L5)', () => {
	test('cambiar el tema NO muta mode ni density', () => {
		theme.setMode('dark');
		theme.setDensity('compact');
		const modeBefore = theme.mode;
		const densityBefore = theme.density;

		theme.setTheme('miel');

		expect(theme.themeId).toBe('miel');
		expect(theme.mode).toBe(modeBefore);
		expect(theme.density).toBe(densityBefore);
	});

	test('cambiar el modo NO muta themeId ni density', () => {
		theme.setTheme('salvia');
		theme.setDensity('comfortable');
		const themeIdBefore = theme.themeId;
		const densityBefore = theme.density;

		theme.setMode('light');

		expect(theme.mode).toBe('light');
		expect(theme.themeId).toBe(themeIdBefore);
		expect(theme.density).toBe(densityBefore);
	});

	test('cambiar la densidad NO muta themeId ni mode', () => {
		theme.setTheme('terracota');
		theme.setMode('dark');
		const themeIdBefore = theme.themeId;
		const modeBefore = theme.mode;

		theme.setDensity('compact');

		expect(theme.density).toBe('compact');
		expect(theme.themeId).toBe(themeIdBefore);
		expect(theme.mode).toBe(modeBefore);
	});

	test('setTheme con un id desconocido: ignora, no muta themeId', () => {
		theme.setTheme('niebla');
		theme.setTheme('esto-no-existe');
		expect(theme.themeId).toBe('niebla');
	});

	test('setTheme con un alias conocido: resuelve al canónico', () => {
		theme.setTheme('grafito'); // alias de 'niebla', ver niebla.theme.json
		expect(theme.themeId).toBe('niebla');
	});

	test('swatches expone los 5 temas curados, con id/name/group/tint/accent', () => {
		expect(theme.swatches.length).toBeGreaterThanOrEqual(4);
		for (const s of theme.swatches) {
			expect(typeof s.id).toBe('string');
			expect(typeof s.name).toBe('string');
			expect(typeof s.group).toBe('string');
			expect(s.tint).toMatch(/^#[0-9a-f]{6}$/);
			expect(s.accent).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});

describe('applyTheme — escribe EXACTAMENTE data-theme/data-mode/data-density', () => {
	test('sobre un elemento limpio, solo esos 3 atributos quedan puestos', () => {
		const root = fakeRoot();
		applyTheme(root, { themeId: 'miel', mode: 'dark', density: 'compact' });

		expect(root.dataset.theme).toBe('miel');
		expect(root.dataset.mode).toBe('dark');
		expect(root.dataset.density).toBe('compact');
		expect(Object.keys(root.dataset)).toEqual(expect.arrayContaining(['theme', 'mode', 'density']));
		expect(Object.keys(root.dataset)).toHaveLength(3);
	});

	test('llamar dos veces con valores distintos pisa limpiamente (no acumula atributos viejos)', () => {
		const root = fakeRoot();
		applyTheme(root, { themeId: 'niebla', mode: 'light', density: 'comfortable' });
		applyTheme(root, { themeId: 'salvia', mode: 'dark', density: 'compact' });

		expect(root.dataset.theme).toBe('salvia');
		expect(root.dataset.mode).toBe('dark');
		expect(root.dataset.density).toBe('compact');
		expect(Object.keys(root.dataset)).toHaveLength(3);
	});
});

describe('computeResolvedMode (§12.4, "system" sigue al booleano leído)', () => {
	test('"light"/"dark" pasan tal cual, ignorando el booleano de sistema', () => {
		expect(computeResolvedMode('light', true)).toBe('light');
		expect(computeResolvedMode('dark', false)).toBe('dark');
	});

	test('"system" resuelve según el booleano de sistema', () => {
		expect(computeResolvedMode('system', true)).toBe('dark');
		expect(computeResolvedMode('system', false)).toBe('light');
	});
});
