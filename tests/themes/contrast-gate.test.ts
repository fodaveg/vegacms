/**
 * Gate de contraste AA MEDIDO (§5.3/§9.1 del contrato P7, L2 "sin excepciones"):
 * 1. Los 21 temas (catálogo Lumbre + ids propios conservados) pasan los gates en
 *    claro Y oscuro — incluidos `accentText` sobre paper/surface/surface-2 y los 4 semánticos
 *    (`danger` incluido) sobre su `-soft` y sobre paper/surface.
 * 2. El gate MUERDE: un fixture con `accentInk` sub-AA sobre `accent` falla; uno con
 *    `accentText` explícito sub-AA también falla — ambos con mensaje accionable.
 * 3. El DOBLE TRAZO del editor visual (`validateOverlayBracketContrast`) se lee sobre un fondo
 *    arbitrario en los 21 temas × 2 modos, y su gate también muerde.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
	bracketWorstCaseContrast,
	COMPONENT_CONTRAST_PAIRS,
	contrastRatio,
	validateComponentContrast,
	validateContrast,
	validateOverlayBracketContrast
} from '../../scripts/build-themes.mjs';
import { makeTheme } from './fixture';

const THEMES_DIR = join(__dirname, '../../src/lib/themes');

function loadRealThemes() {
	const index: string[] = JSON.parse(readFileSync(join(THEMES_DIR, 'index.json'), 'utf8'));
	const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.theme.json'));
	const byId = new Map(
		files.map((file) => {
			const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), 'utf8'));
			return [theme.id, theme];
		})
	);
	return index.map((id) => byId.get(id));
}

describe('1. El catálogo completo pasa el gate AA en claro y oscuro', () => {
	const themes = loadRealThemes();

	test('index.json conserva los 19 temas de Lumbre y los 2 ids propios de Vega', () => {
		expect(themes).toHaveLength(21);
		expect(themes.map((theme) => theme.id)).toEqual(
			expect.arrayContaining(['aquelarre', 'tornasol', 'pizarra', 'terracota'])
		);
	});

	test.each(themes.map((t) => [t.id, t] as const))('%s: accentInk/accent ≥4.5:1', (_id, theme) => {
		const errors: string[] = [];
		validateContrast(theme, errors);
		expect(errors).toEqual([]);
	});

	test.each(themes.map((t) => [t.id, t] as const))(
		'%s: TODOS los COMPONENT_CONTRAST_PAIRS ≥4.5:1 en claro y oscuro',
		(_id, theme) => {
			const errors: string[] = [];
			validateComponentContrast(theme, errors);
			expect(errors).toEqual([]);
		}
	);

	test('COMPONENT_CONTRAST_PAIRS incluye accentText sobre paper/surface/surface-2', () => {
		expect(COMPONENT_CONTRAST_PAIRS).toContainEqual(['accentText', 'paper']);
		expect(COMPONENT_CONTRAST_PAIRS).toContainEqual(['accentText', 'surface']);
		expect(COMPONENT_CONTRAST_PAIRS).toContainEqual(['accentText', 'surface-2']);
	});

	test('COMPONENT_CONTRAST_PAIRS incluye danger sobre danger-soft, paper y surface (sin excepción)', () => {
		expect(COMPONENT_CONTRAST_PAIRS).toContainEqual(['danger', 'danger-soft']);
		expect(COMPONENT_CONTRAST_PAIRS).toContainEqual(['danger', 'paper']);
		expect(COMPONENT_CONTRAST_PAIRS).toContainEqual(['danger', 'surface']);
	});

	test('COMPONENT_CONTRAST_PAIRS cubre success/warning/info igual que danger', () => {
		for (const key of ['success', 'warning', 'info']) {
			expect(COMPONENT_CONTRAST_PAIRS).toContainEqual([key, `${key}-soft`]);
			expect(COMPONENT_CONTRAST_PAIRS).toContainEqual([key, 'paper']);
			expect(COMPONENT_CONTRAST_PAIRS).toContainEqual([key, 'surface']);
		}
	});

	test('ink-3 NO aparece en ningún par (exento a propósito, §5.3)', () => {
		const involvesInk3 = COMPONENT_CONTRAST_PAIRS.some(([a, b]) => a === 'ink-3' || b === 'ink-3');
		expect(involvesInk3).toBe(false);
	});
});

describe('2. El gate MUERDE (fixtures sub-AA)', () => {
	test('accentInk sub-AA sobre accent → validateContrast falla con mensaje accionable', () => {
		const theme = makeTheme({
			id: 'sub-aa-ink',
			roles: { tint: '#5d6d83', accent: '#5d6d83', accentInk: '#5a6472' } // gris sobre gris: sub-AA
		});
		const errors: string[] = [];
		validateContrast(theme, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('accentInk');
		expect(errors[0]).toMatch(/necesita ≥4\.5:1/);
	});

	test('accentInk AA en las paradas pero sub-AA entre ellas → falla por el interior del gradiente', () => {
		const theme = makeTheme({
			id: 'sub-aa-gradient-interior',
			roles: { tint: '#ff0000', accent: '#ff0000', accentInk: '#000000' },
			effects: {
				fillGrad: {
					angle: 90,
					stops: [
						{ color: '#ff0000', at: '0%' },
						{ color: '#00aa00', at: '100%' }
					]
				},
				slots: { fill: 'fillGrad' }
			}
		});
		const errors: string[] = [];
		validateContrast(theme, errors);
		expect(errors.some((error) => error.includes('segmento 1'))).toBe(true);
	});

	test('detecta un mínimo sub-AA entre las muestras enteras (regresión 89,5%)', () => {
		const theme = makeTheme({
			id: 'sub-aa-between-integer-samples',
			roles: { tint: '#10fe4f', accent: '#10fe4f', accentInk: '#000000' },
			effects: {
				fillGrad: {
					angle: 90,
					stops: [
						{ color: '#10fe4f', at: '0%' },
						{ color: '#db3832', at: '100%' }
					]
				},
				slots: { fill: 'fillGrad' }
			}
		});
		const errors: string[] = [];
		validateContrast(theme, errors);
		expect(errors.some((error) => error.includes('segmento 1'))).toBe(true);
	});

	test('detecta un RGB sub-AA producido por cuantización/dithering del rasterizador', () => {
		const theme = makeTheme({
			id: 'sub-aa-rasterized-gradient',
			roles: { tint: '#786db5', accent: '#786db5', accentInk: '#000000' },
			effects: {
				fillGrad: {
					angle: 90,
					stops: [
						{ color: '#786db5', at: '0%' },
						{ color: '#fa3b4e', at: '100%' }
					]
				},
				slots: { fill: 'fillGrad' }
			}
		});
		const errors: string[] = [];
		validateContrast(theme, errors);
		expect(errors.some((error) => error.includes('segmento 1'))).toBe(true);
		expect(errors.some((error) => error.includes('necesita ≥4.5:1'))).toBe(true);
	});

	test('accentText explícito sub-AA sobre paper → validateComponentContrast falla', () => {
		const theme = makeTheme({
			id: 'sub-aa-text',
			roles: {
				tint: '#5d6d83',
				accent: '#5d6d83',
				accentInk: '#ffffff',
				// Casi blanco: contraste ínfimo contra un paper también casi blanco en claro.
				accentText: '#f0f0ee'
			}
		});
		const errors: string[] = [];
		validateComponentContrast(theme, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.some((e) => e.includes('accentText'))).toBe(true);
	});

	test('un tema que SÍ pasa (fixture base) no produce ningún error', () => {
		const theme = makeTheme();
		const errors: string[] = [];
		validateContrast(theme, errors);
		validateComponentContrast(theme, errors);
		expect(errors).toEqual([]);
	});
});

/**
 * El contorno del editor visual (`src/lib/visual/VisualOverlay.svelte`) se pinta ENCIMA del sitio
 * del cliente, cuyo fondo Vega no controla. Lleva dos anillos, uno claro y uno oscuro, con la
 * promesa de que al menos uno se lee pase lo que pase detrás. Aquí esa promesa deja de ser una
 * frase de cabecera y pasa a ser un número: ver `bracketWorstCaseContrast` en
 * `scripts/build-themes.mjs` para la forma cerrada (peor caso = √(contraste del par)).
 */
describe('3. Doble trazo del editor visual sobre un fondo arbitrario', () => {
	const themes = loadRealThemes();

	test.each(themes.map((t) => [t.id, t] as const))(
		'%s: el doble trazo paper/ink-hi da ≥3:1 en el peor caso, claro y oscuro',
		(_id, theme) => {
			const errors: string[] = [];
			validateOverlayBracketContrast(theme, errors);
			expect(errors).toEqual([]);
		}
	);

	test('la forma cerrada es la raíz del contraste del par (no una aproximación)', () => {
		// Comprobación numérica del razonamiento, no del código: un barrido de fondos adversarios
		// entre los dos trazos nunca puede bajar del valor que anuncia `bracketWorstCaseContrast`,
		// y se le acerca cuando el fondo cae justo en el cruce.
		const a = '#ffffff';
		const b = '#1a1c20';
		const closed = bracketWorstCaseContrast(a, b);
		let observed = Infinity;
		for (let i = 0; i <= 255; i++) {
			const hex = `#${i.toString(16).padStart(2, '0').repeat(3)}`;
			observed = Math.min(observed, Math.max(contrastRatio(a, hex), contrastRatio(b, hex)));
		}
		expect(observed).toBeGreaterThanOrEqual(closed - 0.02);
		expect(observed).toBeLessThan(closed + 0.1);
	});

	test('MUERDE con un par que pasa AA de sobra pero deja el peor caso por debajo de 3:1', () => {
		// `#4d4d4d` sobre blanco vale 8.45:1: pasa `validateComponentContrast` (≥4.5:1) con holgura
		// y aun así el peor caso del contorno es 2.91:1. Es justo el hueco que este gate compra —
		// el gate viejo no ve nada raro en este tema.
		const theme = makeTheme({
			id: 'bracket-flojo',
			modes: { light: { neutrals: { paper: '#ffffff', 'ink-hi': '#4d4d4d' } } }
		});

		const oldGateErrors: string[] = [];
		validateComponentContrast(theme, oldGateErrors);
		expect(oldGateErrors.filter((e) => e.includes('ink-hi'))).toEqual([]);

		const errors: string[] = [];
		validateOverlayBracketContrast(theme, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('doble trazo');
		expect(errors[0]).toContain('bracket-flojo (light)');
		expect(errors[0]).toMatch(/2\.9\d:1 en el peor caso/);
		expect(errors[0]).toMatch(/necesita ≥3:1/);
		expect(errors[0]).toMatch(/≥9:1/);
	});

	test('MUERDE también con un par que cumple AA justo (4.54:1)', () => {
		const theme = makeTheme({
			id: 'bracket-al-limite',
			modes: { dark: { neutrals: { paper: '#ffffff', 'ink-hi': '#767676' } } }
		});
		const errors: string[] = [];
		validateOverlayBracketContrast(theme, errors);
		expect(errors.some((e) => e.includes('bracket-al-limite (dark)'))).toBe(true);
		expect(errors.some((e) => /2\.1\d:1 en el peor caso/.test(e))).toBe(true);
	});

	test('el fixture base pasa (el gate no es un no-op que siempre falla)', () => {
		const errors: string[] = [];
		validateOverlayBracketContrast(makeTheme(), errors);
		expect(errors).toEqual([]);
	});
});
