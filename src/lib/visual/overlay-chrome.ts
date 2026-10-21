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

/** Alto físico mínimo del contorno de un bloque que el sitio pinta sin altura. */
export const EMPTY_BLOCK_MIN_HEIGHT = 28;

export interface OutlineRect {
	top: number;
	height: number;
	/** `true` = el sitio no pinta nada todavía: el contorno es un marcador de altura mínima. */
	empty: boolean;
}

/**
 * Caja del contorno de un bloque, en px de la página. Un bloque que el sitio reporta casi sin
 * altura (una sección recién insertada con sus campos vacíos: un «Botón» sin texto no pinta nada)
 * se marca igual, con {@link EMPTY_BLOCK_MIN_HEIGHT} px físicos centrados en su sitio, para que
 * insertar deje rastro en el lienzo (QA de fodaveg, 21 oct 2026). El resto, tal cual.
 */
export function outlineRect(rect: { top: number; height: number }, scale: number): OutlineRect {
	const min = EMPTY_BLOCK_MIN_HEIGHT * scale;
	if (rect.height >= min / 2) return { top: rect.top, height: rect.height, empty: false };
	return { top: rect.top + rect.height / 2 - min / 2, height: min, empty: true };
}
