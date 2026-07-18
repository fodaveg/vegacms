/**
 * `validateNeutrals` (§4.4/§9.3 del contrato P7): override de neutros por tema, escape hatch
 * Opción A de Lumbre. Ninguno de los 5 temas curados de v1 lo usa (§4.4: "v1 puede no usar
 * ningún override") — validado igualmente con fixtures sintéticos, para el primer tema con
 * carácter fuerte que lo necesite.
 */

import { describe, expect, test } from 'vitest';
import { validateNeutrals } from '../../scripts/build-themes.mjs';
import { makeTheme } from './fixture';

describe('validateNeutrals', () => {
	test('override con escala de luminancia rota → error', () => {
		const theme = makeTheme({
			modes: {
				dark: {
					neutrals: {
						// "active" debe ser MÁS CLARO que "bg" en la escala ascendente; aquí es más oscuro.
						bg: '#202020',
						active: '#101010'
					}
				}
			}
		});
		const errors: string[] = [];
		validateNeutrals(theme, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/ascendente/);
	});

	test('override con "ink" sub-AA sobre "paper" → error', () => {
		const theme = makeTheme({
			modes: {
				light: {
					neutrals: {
						paper: '#f7f6f4',
						ink: '#cccccc' // gris claro sobre papel casi blanco: muy por debajo de 4.5:1
					}
				}
			}
		});
		const errors: string[] = [];
		validateNeutrals(theme, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/necesita ≥4\.5:1/);
	});

	test('override correcto (escala ascendente + ink AA sobre paper) → pasa', () => {
		const theme = makeTheme({
			modes: {
				dark: {
					neutrals: {
						bg: '#0b0b0d',
						sidebar: '#0f0f11',
						paper: '#141416',
						'surface-2': '#1c1c1f',
						surface: '#232327',
						btn: '#242428',
						active: '#302f37',
						ink: '#eaeaef'
					}
				}
			}
		});
		const errors: string[] = [];
		validateNeutrals(theme, errors);
		expect(errors).toEqual([]);
	});

	test('sin modes.*.neutrals → no valida nada, pasa trivialmente', () => {
		const theme = makeTheme();
		const errors: string[] = [];
		validateNeutrals(theme, errors);
		expect(errors).toEqual([]);
	});

	test('"ink" sin "paper" en el mismo override → error explícito (no falso positivo silencioso)', () => {
		const theme = makeTheme({
			modes: { light: { neutrals: { ink: '#2c2a24' } } }
		});
		const errors: string[] = [];
		validateNeutrals(theme, errors);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/sin "paper"/);
	});

	// Fix de code-review (fidelidad a §4.4: "bg < sidebar ≤ paper ≤ surface-2 ≤ surface < btn <
	// active" — mezcla de "<" y "≤", no todo "≤"): un EMPATE en un tramo ESTRICTO debe fallar,
	// aunque antes (comparando todo con "<" a secas) pasaba.
	describe('operador exacto por tramo (estricto vs ≤)', () => {
		test('empate bg == sidebar (tramo ESTRICTO, "<") → error', () => {
			const theme = makeTheme({
				modes: { light: { neutrals: { bg: '#e0e0e0', sidebar: '#e0e0e0' } } }
			});
			const errors: string[] = [];
			validateNeutrals(theme, errors);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]).toMatch(/estrictamente más claro/);
		});

		test('empate surface == btn (tramo ESTRICTO, "<") → error', () => {
			const theme = makeTheme({
				modes: { light: { neutrals: { surface: '#f0f0f0', btn: '#f0f0f0' } } }
			});
			const errors: string[] = [];
			validateNeutrals(theme, errors);
			expect(errors.length).toBeGreaterThan(0);
		});

		test('empate paper == surface-2 (tramo "≤") → PASA (empate permitido ahí)', () => {
			const theme = makeTheme({
				modes: { light: { neutrals: { paper: '#f0f0f0', 'surface-2': '#f0f0f0' } } }
			});
			const errors: string[] = [];
			validateNeutrals(theme, errors);
			expect(errors).toEqual([]);
		});

		test('empate sidebar == paper (tramo "≤") → PASA', () => {
			const theme = makeTheme({
				modes: { light: { neutrals: { sidebar: '#e8e8e8', paper: '#e8e8e8' } } }
			});
			const errors: string[] = [];
			validateNeutrals(theme, errors);
			expect(errors).toEqual([]);
		});

		test('tramo saltado (bg → active, sin claves intermedias) es estricto por transitividad', () => {
			// bg < sidebar ≤ … < btn < active: al menos un eslabón del tramo es estricto, así que
			// la relación COMBINADA bg→active también lo es, aunque se salten los intermedios.
			const theme = makeTheme({
				modes: { light: { neutrals: { bg: '#dddddd', active: '#dddddd' } } }
			});
			const errors: string[] = [];
			validateNeutrals(theme, errors);
			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
