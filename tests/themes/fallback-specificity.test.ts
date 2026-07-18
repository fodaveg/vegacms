/**
 * Empate de especificidad del fallback (fix de code-review sobre `themeToCss`, bug latente
 * real): el bloque de `FALLBACK_THEME_ID` (`niebla`) se emite TAMBIÉN sobre `:root` desnudo,
 * como defensa pre-JS. En un selector agrupado por comas cada rama pesa su PROPIA especificidad
 * — `:root` a secas es (0,1,0), IGUAL que `[data-theme='miel']`; con un empate gana quien va
 * MÁS TARDE en el CSS, así que el fallback dependía en silencio de que `index.json` pusiera
 * niebla primero. El fix usa `:where(:root)` (especificidad SIEMPRE 0) en vez de `:root` a
 * secas.
 *
 * Este test NO depende del orden de `index.json` (a propósito, por eso no se limita a comprobar
 * el texto del selector): calcula la especificidad real de las ramas que produce `themeToCss` y
 * verifica que la rama del fallback SIEMPRE pesa menos que la de cualquier tema real — así que,
 * pase lo que pase con el orden de origen en el CSS, un tema real nunca puede perder contra el
 * fallback.
 */

import { describe, expect, test } from 'vitest';
import { FALLBACK_THEME_ID, themeToCss } from '../../scripts/build-themes.mjs';
import { makeTheme } from './fixture';

/**
 * Especificidad simplificada (solo el nivel "clase": atributos `[…]` y pseudo-clases `:x` que
 * NO sean `:where(...)`) de cada rama de un selector agrupado por comas. `:where(...)` SIEMPRE
 * contribuye 0 a la especificidad (por definición de CSS Selectors 4) — se elimina su contenido
 * ANTES de contar, así que nada dentro de un `:where()` cuenta, tenga lo que tenga dentro.
 */
function branchSpecificities(selectorGroup: string): number[] {
	return selectorGroup.split(',').map((branch) => {
		const withoutWhere = branch.replace(/:where\([^)]*\)/g, '');
		const classLevelMatches = withoutWhere.match(/\[[^\]]*\]|:[a-zA-Z-]+/g) ?? [];
		return classLevelMatches.length;
	});
}

function firstRuleSelector(css: string): string {
	const brace = css.indexOf('{');
	return css.slice(0, brace).trim();
}

describe('themeToCss — el fallback nunca puede empatar/ganar contra un tema real', () => {
	test('la rama :where(:root) del fallback tiene especificidad 0', () => {
		const fallback = makeTheme({ id: FALLBACK_THEME_ID });
		const css = themeToCss(fallback);
		const selector = firstRuleSelector(css);
		expect(selector).toContain(':where(:root)');

		const specs = branchSpecificities(selector);
		// Dos ramas: ":where(:root)" (0) y "[data-theme='niebla']" (1).
		expect(Math.min(...specs)).toBe(0);
	});

	test('la especificidad MÁXIMA de la rama :where(:root) del fallback es SIEMPRE menor que la de cualquier tema real — garantía estructural, no depende de index.json', () => {
		const fallback = makeTheme({ id: FALLBACK_THEME_ID });
		const otherIds = ['miel', 'pizarra', 'salvia', 'terracota', 'cualquier-id-futuro'];

		const fallbackCss = themeToCss(fallback);
		const fallbackWhereSpecificity = Math.min(
			...branchSpecificities(firstRuleSelector(fallbackCss))
		);

		for (const id of otherIds) {
			const other = makeTheme({ id });
			const otherCss = themeToCss(other);
			const otherSpecificity = Math.max(...branchSpecificities(firstRuleSelector(otherCss)));

			// Estrictamente menor (no "menor o igual"): un empate es EXACTAMENTE el bug que se
			// arregla — con empate, gana quien vaya después en el CSS (orden de index.json).
			expect(fallbackWhereSpecificity).toBeLessThan(otherSpecificity);
		}
	});

	test('lo mismo para los bloques por-modo ([data-mode=…])', () => {
		const fallback = makeTheme({ id: FALLBACK_THEME_ID });
		const fallbackCss = themeToCss(fallback);
		// El 2º bloque (índice 1, tras el bloque base mode-independiente) es el de data-mode='light'.
		const modeBlockSelector = fallbackCss.split('}')[1].split('{')[0].trim();
		expect(modeBlockSelector).toContain(":where(:root)[data-mode='light']");

		const other = makeTheme({ id: 'miel' });
		const otherModeSelector = themeToCss(other).split('}')[1].split('{')[0].trim();

		const fallbackSpec = Math.min(...branchSpecificities(modeBlockSelector));
		const otherSpec = Math.max(...branchSpecificities(otherModeSelector));
		expect(fallbackSpec).toBeLessThan(otherSpec);
	});

	test('un tema NO-fallback nunca emite ":root" en ninguna forma (ni desnudo ni :where)', () => {
		const other = makeTheme({ id: 'miel' });
		const css = themeToCss(other);
		expect(css).not.toContain(':root');
	});
});
