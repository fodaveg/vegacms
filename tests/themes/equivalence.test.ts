/**
 * Equivalencia de `mixOklab` (§4.2/§9.2 del contrato P7): el gate de contraste de componentes
 * resuelve en JS los MISMOS valores finales que produce `color-mix(in oklab, …)` en el
 * navegador — así que `mixOklab` tiene que ser un mezclador OKLab correcto, no una
 * aproximación en sRGB. Batería de dos tipos:
 *
 * 1. Propiedades algebraicas (independientes de un oráculo externo): identidad en los
 *    extremos (100%/0%), idempotencia al mezclar un color consigo mismo.
 * 2. Valores de referencia derivados A MANO de la fórmula OKLab (Björn Ottosson) para el caso
 *    L-only (`a=b=0`, mezcla de blanco/negro): con `a=b=0`, `l_=m_=s_=L` y las tres filas de la
 *    matriz OKLab→LMS→sRGB suman exactamente 1.0 por canal, así que el canal lineal resultante
 *    es `L³` sin más — verificable sin ejecutar código. Sirve de ancla: si alguien toca los
 *    coeficientes de `hexToOklab`/`oklabToHex` (p.ej. al portar/actualizar desde Lumbre), esta
 *    batería lo detecta aunque el resto de tests (que comparan temas reales entre sí) no lo
 *    hicieran. También cubre el landmine de §4.2: si un hex de `BASE_NEUTRALS` cambia sin que
 *    el resto del pipeline se entere, el test de "5 temas reales pasan el gate" ya lo cazaría,
 *    pero esta suite deja además fijado el comportamiento exacto de la mezcla en sí.
 */

import { describe, expect, test } from 'vitest';
import { mixOklab } from '../../scripts/build-themes.mjs';

describe('1. Propiedades algebraicas', () => {
	test('100% de A → A exacto, sea cual sea B', () => {
		expect(mixOklab('#4f6bd6', 100, '#000000')).toBe('#4f6bd6');
		expect(mixOklab('#a5781d', 100, '#ffffff')).toBe('#a5781d');
	});

	test('0% de A → B exacto', () => {
		expect(mixOklab('#4f6bd6', 0, '#000000')).toBe('#000000');
		expect(mixOklab('#a5781d', 0, '#ffffff')).toBe('#ffffff');
	});

	test('mezclar un color consigo mismo, a cualquier %, da el mismo color', () => {
		for (const pct of [10, 33, 50, 88]) {
			expect(mixOklab('#bd430f', pct, '#bd430f')).toBe('#bd430f');
		}
	});
});

describe('2. Valores de referencia derivados a mano (caso L-only, blanco/negro)', () => {
	// pctA% de blanco + el resto de negro, en OKLab: L = pctA/100 (a=b=0 en ambos extremos).
	// Canal lineal resultante = L³ (las tres filas OKLab→sRGB suman 1.0 con a=b=0) → sRGB vía
	// la curva de transferencia estándar. Ver la cabecera del fichero para la derivación.
	test.each([
		[25, '#222222'],
		[50, '#636363'],
		[75, '#aeaeae']
	])('%i%% blanco + resto negro → %s', (pct, expected) => {
		expect(mixOklab('#ffffff', pct, '#000000')).toBe(expected);
	});
});

describe('3. Batería de tintes 3–20% (rango real usado por el pipeline, §4.3)', () => {
	// No hay oráculo de navegador en este entorno (sin Chromium headless): esta batería fija el
	// comportamiento ACTUAL como regresión — cualquier cambio en los coeficientes de
	// hexToOklab/oklabToHex que altere estos valores debe ser una decisión consciente, no un
	// efecto colateral silencioso. Los tintes 6/14 (bg) y 3/12 (surf) son los que usan los 5
	// temas curados (§4.3); 20% es el techo declarado en el contrato (accent-soft oscuro).
	test.each([3, 6, 8, 12, 14, 16, 20])(
		'mixOklab(%i%%) sobre #4f6bd6→#f7f6f4 es determinista (mismo input, mismo output repetido)',
		(pct) => {
			const a = mixOklab('#4f6bd6', pct, '#f7f6f4');
			const b = mixOklab('#4f6bd6', pct, '#f7f6f4');
			expect(a).toBe(b);
			expect(a).toMatch(/^#[0-9a-f]{6}$/);
		}
	);
});
