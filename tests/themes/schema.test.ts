/**
 * Validador estructural propio (§5.2/§9 del contrato P7, D-P7.7): `validateSchema` (sin ajv en
 * el pipeline, ley de ligereza) validado contra `theme.schema.json` compilado con `ajv` (SOLO
 * devDependency de test — oráculo, mismo criterio que P2 §9.12). Incluye §9.10: el schema
 * RECHAZA un bloque `effects` (namespace reservado v2, D4/L7).
 */

import { describe, expect, test } from 'vitest';
// El schema declara "$schema": draft 2020-12 (igual que manifest-schema.json de P2); el `Ajv`
// por defecto solo trae el meta-schema de draft-07.
import Ajv2020 from 'ajv/dist/2020';
import { validateSchema } from '../../scripts/build-themes.mjs';
import themeSchema from '$lib/themes/theme.schema.json';
import { makeTheme } from './fixture';

/** `makeTheme()` añade `__file` (bookkeeping interno del pipeline, ver `build-themes.mjs`
 * `loadThemes`) que `validateSchema` tolera a propósito pero que NO forma parte de
 * `theme.schema.json` (el schema público, sin ese campo) — se quita antes de pasar el fixture a
 * CUALQUIERA de los dos validadores, para que el oráculo compare exactamente lo mismo. */
function strip(theme: unknown): unknown {
	if (theme === null || typeof theme !== 'object' || Array.isArray(theme)) return theme;
	const { __file, ...rest } = theme as Record<string, unknown>;
	void __file;
	return rest;
}

function isValid(theme: unknown): boolean {
	const errors: string[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- theme es JSON crudo de fixture
	validateSchema(strip(theme) as any, errors);
	return errors.length === 0;
}

describe('1. Casos puntuales de validateSchema', () => {
	test('el fixture base (mínimo válido) pasa', () => {
		expect(isValid(makeTheme())).toBe(true);
	});

	test('themeSchemaVersion distinto de 1 → inválido', () => {
		expect(isValid(makeTheme({ themeSchemaVersion: 2 }))).toBe(false);
	});

	test('group fuera del enum de Vega (frios/calidos/neutros/verdes) → inválido', () => {
		expect(isValid(makeTheme({ group: 'pastel-firma-mono' }))).toBe(false); // enum de LUMBRE, no de Vega
	});

	test('roles.accentInk no hex → inválido', () => {
		expect(
			isValid(makeTheme({ roles: { tint: '#000', accent: '#000', accentInk: 'blanco' } }))
		).toBe(false);
	});

	test('roles con "date"/"deadline"/"done" (vocabulario de Lumbre) → inválido (clave no permitida)', () => {
		const theme = makeTheme({
			roles: { tint: '#5d6d83', accent: '#5d6d83', accentInk: '#ffffff', date: '#ff0000' }
		});
		expect(isValid(theme)).toBe(false);
	});

	test('roles.accentText opcional hex válido → pasa', () => {
		expect(
			isValid(
				makeTheme({
					roles: { tint: '#5d6d83', accent: '#5d6d83', accentInk: '#ffffff', accentText: '#33488f' }
				})
			)
		).toBe(true);
	});

	test('clave raíz desconocida → inválido', () => {
		expect(isValid(makeTheme({ unknownKey: true }))).toBe(false);
	});

	test('clave de modo desconocida ("auto") → inválido (fix de code-review: antes pasaba en silencio)', () => {
		expect(isValid(makeTheme({ modes: { auto: {} } }))).toBe(false);
	});

	test('typo en el nombre del modo ("ligth") → inválido', () => {
		expect(isValid(makeTheme({ modes: { ligth: { tintBg: '6%' } } }))).toBe(false);
	});
});

describe('2. §9.10 — namespace effects RECHAZADO (D4/L7, sin efectos en v1)', () => {
	test('un tema con bloque "effects" → validateSchema lo rechaza', () => {
		const theme = makeTheme({ effects: { fillGrad: { angle: 90, stops: [] } } });
		expect(isValid(theme)).toBe(false);
	});

	test('el JSON Schema (ajv) también lo rechaza (additionalProperties:false)', () => {
		const ajv = new Ajv2020({ strict: true, allErrors: true });
		const validate = ajv.compile(themeSchema);
		const theme = makeTheme({ effects: { fillGrad: {} } });
		expect(validate(strip(theme))).toBe(false);
	});
});

describe('3. Oráculo: ajv(theme.schema.json) vs validateSchema', () => {
	const ajv = new Ajv2020({ strict: true, allErrors: true });
	const validateWithAjv = ajv.compile(themeSchema);

	const VALID: unknown[] = [
		makeTheme(),
		makeTheme({ aliases: ['alias-1'] }),
		makeTheme({
			roles: { tint: '#5d6d83', accent: '#5d6d83', accentInk: '#ffffff', accentText: '#33488f' }
		}),
		makeTheme({ modes: { light: { tintBg: '6%' }, dark: { tintBg: '14%' } } }),
		makeTheme({ modes: { dark: { neutrals: { paper: '#141416', ink: '#eaeaef' } } } })
	];

	const INVALID: unknown[] = [
		null,
		42,
		'no es un objeto',
		{},
		makeTheme({ themeSchemaVersion: 2 }),
		makeTheme({ group: 'inventado' }),
		makeTheme({ roles: { tint: 'no-hex', accent: '#000', accentInk: '#fff' } }),
		makeTheme({ effects: {} }),
		makeTheme({ modes: { light: { neutrals: { colorInventado: '#fff' } } } }),
		makeTheme({ modes: { light: { tintBg: 'no-porcentaje' } } }),
		// Cierra la divergencia validador-propio vs oráculo que encontró el code-review: una
		// clave de modo desconocida ("auto"/typo) ya la rechazaba ajv (additionalProperties:false
		// en "modes") pero antes NO la rechazaba validateSchema (el bucle solo LEÍA
		// modes.light/modes.dark por nombre fijo, sin enumerar qué claves había de verdad).
		makeTheme({ modes: { auto: {} } }),
		makeTheme({ modes: { ligth: { tintBg: '6%' } } })
	];

	// El fixture base no trae "$schema" (no forma parte de la identidad del tema); ajv exige
	// additionalProperties:false coherente con eso — se prueba explícitamente aparte porque los
	// *.theme.json REALES sí lo llevan (§4, es opcional y ambos validadores deben aceptarlo).
	const battery = [...VALID, ...INVALID, makeTheme({ $schema: './theme.schema.json' })];

	test.each(battery.map((t, i) => [i, t] as const))(
		'fixture #%i: mismo veredicto ok/ko',
		(_i, t) => {
			expect(isValid(t)).toBe(validateWithAjv(strip(t)));
		}
	);
});
