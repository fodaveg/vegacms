/**
 * `slugify` (capacidad `slugField`, mockup `aquelarre-detalle-post.html` `.slug-row`): deriva un
 * slug URL-safe a partir de un texto libre (el valor del `titleField`). Módulo PURO (ley L1 de
 * P2): sin Svelte, sin el puerto, sin reloj ni azar — misma entrada, misma salida siempre.
 *
 * Algoritmo, paso a paso (deliberadamente conservador: un slug es una URL pública, más vale
 * quedarse corto que colar un carácter que haya que escapar después):
 * 1. Normaliza a NFD y quita los diacríticos combinantes (`á`→`a`, `ñ`→`n`, `ü`→`u`): es la vía
 *    estándar sin tabla de transliteración propia, y cubre de sobra las lenguas latinas.
 * 2. A minúsculas.
 * 3. Cualquier carácter que no sea `[a-z0-9]` pasa a guion (incluye espacios, puntuación, emoji
 *    y CUALQUIER alfabeto no latino — ver la nota de abajo).
 * 4. Colapsa guiones repetidos y recorta los de los extremos.
 *
 * **Devuelve `''` cuando no queda nada** (título vacío, o escrito íntegramente en un alfabeto que
 * el paso 1 no sabe romanizar: cirílico, griego, CJK…). Es DELIBERADO y el llamador debe
 * respetarlo: preferimos dejar el campo como estaba (`RecordForm.svelte` no propaga un slug
 * vacío) a inventar un identificador que no se parece en nada al título. Romanizar de verdad esos
 * alfabetos pide una tabla de transliteración por idioma, que no es cosa de este módulo.
 */

/** Longitud máxima del slug generado. Cota defensiva (un título kilométrico no debe producir una
 *  URL kilométrica); corta SIEMPRE en frontera de palabra, nunca a mitad de una. */
const MAX_SLUG_LENGTH = 80;

/**
 * Deriva el slug de `text` (ver cabecera). `''` si no queda ningún carácter utilizable — el
 * llamador decide qué hacer con eso (nunca escribe un slug vacío encima de uno bueno).
 */
export function slugify(text: string): string {
	const ascii = text
		.normalize('NFD')
		// Bloque Unicode "Combining Diacritical Marks" (U+0300–U+036F): lo que NFD acaba de separar
		// de su letra. Escrito con escapes `\u` a propósito — pegar los combinantes literales en el
		// fuente los deja invisibles (y a merced de cualquier normalización del editor).
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();

	const hyphenated = ascii
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	if (hyphenated.length <= MAX_SLUG_LENGTH) return hyphenated;
	// Corte en frontera de palabra: se trunca al límite y se descarta el trozo posterior al último
	// guion (que sería media palabra). Si no hubiera ningún guion dentro del límite, se acepta el
	// corte duro — es una sola palabra de >80 caracteres, no hay frontera mejor.
	const cut = hyphenated.slice(0, MAX_SLUG_LENGTH);
	const lastHyphen = cut.lastIndexOf('-');
	return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
}
