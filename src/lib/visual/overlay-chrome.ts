/**
 * Geometría del contorno que el overlay del editor visual dibuja sobre la página.
 *
 * Regla (QA de fodaveg, 21 oct 2026): sobre la página solo va el CONTORNO del bloque (por fuera,
 * ver `.vega-visual-overlay-box::before` en `VisualOverlay.svelte`). La etiqueta del tipo, las
 * acciones y los «+» de inserción viven en el escenario, fuera de la hoja: la franja de encima y
 * el margen de la izquierda. Antes se colocaban junto al bloque (`placeChrome`, retirado) y, en
 * secciones cuyo texto llega al borde, tapaban el subtítulo o la última línea del vecino.
 *
 * Todo en píxeles de la PÁGINA (el sistema del `rect` del puente y del overlay); `scale` es
 * `1 / zoom`, lo que mide en la página un píxel de pantalla.
 */

/** Alto físico por debajo del cual un bloque cuenta como «aún sin contenido». */
export const EMPTY_BLOCK_HEIGHT = 14;

export interface OutlineRect {
	top: number;
	height: number;
	/** `true` = el sitio no pinta nada todavía: contorno discontinuo y la franja lo dice. */
	empty: boolean;
}

/**
 * Caja del contorno de un bloque, en px de la página: la del bloque, tal cual. Un bloque que el
 * sitio reporta casi sin altura (una sección recién insertada con sus campos vacíos: un «Botón»
 * sin texto no pinta nada) se marca `empty` para que el contorno sea discontinuo y la franja diga
 * «aún sin contenido». Su caja NO crece: hasta el 21 oct 2026 se inflaba a 28 px físicos con fondo
 * opaco y el nombre dentro, y en fodaveg tapaba la línea de encima (QA de esa fecha). Sobre la
 * página, la misma regla que cualquier contorno: solo el trazo, por fuera del bloque.
 */
export function outlineRect(rect: { top: number; height: number }, scale: number): OutlineRect {
	return {
		top: rect.top,
		height: rect.height,
		empty: rect.height < EMPTY_BLOCK_HEIGHT * scale
	};
}
