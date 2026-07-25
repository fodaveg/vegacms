/**
 * Tests unitarios de `slugify` (capacidad `slugField`, mockup `aquelarre-detalle-post.html`
 * `.slug-row` — el botón "Regenerar" del editor). Módulo puro: se prueba entrada→salida, sin
 * montar nada.
 */

import { describe, expect, test } from 'vitest';
import { slugify } from '$lib/model/slugify';

describe('slugify', () => {
	test.each([
		// Caso real del mockup: título largo con dos puntos y acentos.
		[
			'Temas claro/oscuro con un solo vocabulario de tokens',
			'temas-claro-oscuro-con-un-solo-vocabulario-de-tokens'
		],
		['Notas del huerto: julio', 'notas-del-huerto-julio'],
		// Diacríticos latinos (NFD + quitar combinantes), incluida la ñ.
		['Año de la Peña Ártica', 'ano-de-la-pena-artica'],
		['Crème brûlée', 'creme-brulee'],
		// Puntuación, símbolos y espacios repetidos colapsan a un solo guion; sin guiones sueltos
		// en los extremos.
		['  ¡Hola,   mundo!  ', 'hola-mundo'],
		['a---b', 'a-b'],
		['--- borde ---', 'borde'],
		// Los dígitos sobreviven (un slug con año/versión es legítimo).
		['Backups 3-2-1 para 2026', 'backups-3-2-1-para-2026'],
		// Sin nada utilizable: cadena vacía (el llamador NO debe escribirla encima del slug bueno).
		['', ''],
		['!!! ??? ...', ''],
		// Alfabeto no latino: no se translitera (ver cabecera del módulo), así que no queda nada.
		['Кириллица', '']
	])('%j -> %j', (raw, expected) => {
		expect(slugify(raw)).toBe(expected);
	});

	test('un título kilométrico se trunca a 80 caracteres CORTANDO en frontera de palabra', () => {
		const long = slugify(
			'Temas claro oscuro con un solo vocabulario de tokens lo que aprendi construyendo el motor de paletas'
		);
		expect(long.length).toBeLessThanOrEqual(80);
		// Ni empieza ni acaba en guion, y ninguna palabra queda partida por la mitad: el último
		// tramo del slug es una palabra COMPLETA del título original.
		expect(long).not.toMatch(/^-|-$/);
		expect(long.split('-').at(-1)).toBe('aprendi');
	});

	test('una sola palabra más larga que el límite se corta en duro (no hay frontera mejor)', () => {
		const single = slugify('x'.repeat(120));
		expect(single).toBe('x'.repeat(80));
	});
});
