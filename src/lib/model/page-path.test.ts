/**
 * Tests de `suggestPagePath`/`isValidPagePath` (modelo de páginas, tarea p1 `1dc63001`): la
 * propuesta de ruta al crear y la validación de FORMATO en cliente, ver la cabecera del módulo.
 */

import { describe, expect, test } from 'vitest';
import { isValidPagePath, suggestPagePath } from './page-path';

describe('suggestPagePath', () => {
	test('deriva la ruta con "/" + slugify del texto', () => {
		expect(suggestPagePath('Sobre mí')).toBe('/sobre-mi');
	});

	test('texto vacío → "" (nada que proponer)', () => {
		expect(suggestPagePath('')).toBe('');
	});

	test('texto sin nada romanizable (p. ej. solo emoji) → "" (nunca "/")', () => {
		expect(suggestPagePath('🎉🎉🎉')).toBe('');
	});
});

describe('isValidPagePath', () => {
	test('vacía → válida de FORMA (required es responsabilidad de otro sitio)', () => {
		expect(isValidPagePath('')).toBe(true);
	});

	test('la raíz "/" → válida (única barra final permitida)', () => {
		expect(isValidPagePath('/')).toBe(true);
	});

	test('ruta normal sin barra final → válida', () => {
		expect(isValidPagePath('/sobre-mi')).toBe(true);
	});

	test('ruta anidada → válida', () => {
		expect(isValidPagePath('/blog/2024/hola')).toBe(true);
	});

	test('sin "/" inicial → inválida', () => {
		expect(isValidPagePath('sobre-mi')).toBe(false);
	});

	test('con espacio → inválida', () => {
		expect(isValidPagePath('/sobre mi')).toBe(false);
	});

	test('con barra final (y no es la raíz) → inválida', () => {
		expect(isValidPagePath('/sobre-mi/')).toBe(false);
	});
});
