/**
 * Ningún token del tema resuelve a un `color-mix()` cuyos DOS operandos sean a su vez
 * `color-mix()`. Esa forma tumba el proceso de WebKit 626 (el de Playwright, 22 oct 2026):
 * `Style::toStyleColor(CSS::ColorMix)` llama a `Style::Color::resolvedColor()` sobre un operando
 * aún sin resolver y aborta (`std::terminate`) al calcular el estilo, en el primer pintado o en un
 * `getComputedStyle`. El caso mínimo es literal, sin `var()`:
 * `background: color-mix(in oklab, color-mix(in oklab, red 5%, blue) 6%, color-mix(in oklab, red 13%, green))`.
 * Con UN solo operando anidado no pasa, y Safari 27.0.1 (WebKit 625) tampoco se cae.
 *
 * Así se cerraba el editor visual con cualquier tema tintado (`site.defaultTheme`, o el que elija
 * el autor): `--v-stage` mezclaba `--ink` y `--bg`, que en esos temas son ya mezclas con
 * `--tint`. El generador emite `--v-stage` resuelto (el mismo hex que mide el gate de contraste).
 *
 * El test sustituye los `var()` con las declaraciones del propio tema (global + bloque del tema +
 * bloque del modo) y busca esa forma en el valor final de cada token.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { globalCss, themeToCss } from '../../scripts/build-themes.mjs';
import { makeTheme } from './fixture';

const THEMES_DIR = join(__dirname, '../../src/lib/themes');
const MODES = ['light', 'dark'] as const;

/** Declaraciones `--x: valor` que ve un elemento con `data-mode=<mode>`, en orden de cascada. */
function tokensFor(css: string, mode: (typeof MODES)[number]): Map<string, string> {
	const other = mode === 'light' ? 'dark' : 'light';
	const tokens = new Map<string, string>();
	for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (block[1].includes(`data-mode='${other}'`)) continue;
		for (const decl of block[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
			tokens.set(decl[1], decl[2].trim());
		}
	}
	return tokens;
}

function substitute(value: string, tokens: Map<string, string>, depth = 0): string {
	if (depth > 12) throw new Error(`var() circular o demasiado profundo: ${value}`);
	return value.replace(/var\((--[a-z0-9-]+)\)/g, (whole, name: string) => {
		const inner = tokens.get(name);
		return inner === undefined ? whole : substitute(inner, tokens, depth + 1);
	});
}

/** Operandos de primer nivel de la función que abre en `value[open]` (`(`). */
function topLevelArgs(value: string, open: number): string[] {
	const args: string[] = [];
	let depth = 0;
	let current = '';
	for (let i = open; i < value.length; i++) {
		const c = value[i];
		if (c === '(' && ++depth === 1) continue;
		if (c === ')' && --depth === 0) {
			args.push(current.trim());
			return args;
		}
		if (c === ',' && depth === 1) {
			args.push(current.trim());
			current = '';
			continue;
		}
		current += c;
	}
	return args;
}

function hasMixOfTwoMixes(value: string): boolean {
	for (let at = value.indexOf('color-mix('); at !== -1; at = value.indexOf('color-mix(', at + 1)) {
		const operands = topLevelArgs(value, at + 'color-mix'.length).slice(1);
		if (operands.length === 2 && operands.every((op) => op.startsWith('color-mix('))) return true;
	}
	return false;
}

function offenders(theme: Record<string, unknown>): string[] {
	const css = globalCss() + themeToCss(theme);
	const found: string[] = [];
	for (const mode of MODES) {
		const tokens = tokensFor(css, mode);
		for (const [name, value] of tokens) {
			if (hasMixOfTwoMixes(substitute(value, tokens))) found.push(`${mode} ${name}`);
		}
	}
	return found;
}

describe('color-mix anidado por los dos lados (cierre de WebKit 626)', () => {
	test('el detector ve la forma que tumba WebKit y deja pasar un solo lado anidado', () => {
		const tokens = new Map([
			['--tint', '#6e3fb5'],
			['--ink', 'color-mix(in oklab, var(--tint) 5%, #2c2a24)'],
			['--bg', 'color-mix(in oklab, var(--tint) 13%, #ece9e5)'],
			['--two', 'color-mix(in oklab, var(--ink) 6%, var(--bg))'],
			['--one', 'color-mix(in oklab, var(--ink) 6%, #ece9e5)']
		]);
		expect(hasMixOfTwoMixes(substitute('var(--two)', tokens))).toBe(true);
		expect(hasMixOfTwoMixes(substitute('var(--one)', tokens))).toBe(false);
	});

	test('un tema tintado sin overrides (forma de `site.defaultTheme: aquelarre`) no la emite', () => {
		expect(offenders(makeTheme())).toEqual([]);
	});

	test('ninguno de los temas del catálogo la emite, en claro ni en oscuro', () => {
		const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.theme.json'));
		expect(files.length).toBeGreaterThan(0);
		const found = files.flatMap((file) => {
			const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), 'utf8'));
			return offenders(theme).map((o) => `${theme.id} ${o}`);
		});
		expect(found).toEqual([]);
	});
});
