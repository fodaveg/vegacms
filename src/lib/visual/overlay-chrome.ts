/**
 * Dónde va la fila de controles de un bloque en el lienzo (etiqueta del tipo y, en el seleccionado,
 * la barra flotante). Regla (21 oct 2026, tras «Sobre mí» de fodaveg, cuyo texto llega al borde de
 * su sección): ningún control tapa el contenido del bloque SELECCIONADO. La fila va FUERA, encima
 * del contorno; si arriba no cabe (el bloque toca el borde superior del lienzo), debajo; y solo si
 * tampoco cabe abajo (el bloque ocupa todo el alto visible), dentro, pegada al pie de lo visible,
 * lejos de su primera línea. Fuera puede tapar al vecino, como en Webflow o Framer.
 *
 * Todo en píxeles de la PÁGINA (el sistema del `rect` del puente y del overlay); `scale` es
 * `1 / zoom`, lo que mide en la página un píxel de pantalla, porque los controles conservan su
 * tamaño físico con cualquier zoom.
 */

/** Hueco físico entre el contenido y la fila: los 4 px del contorno más 4 de aire. */
export const CHROME_CLEARANCE = 8;

export type ChromeSide = 'above' | 'below' | 'inside';

export interface ChromePlacement {
	side: ChromeSide;
	/** Centro vertical de la fila, en px de la página, en coordenadas del overlay. */
	center: number;
}

export interface ChromePlacementInput {
	/** `rect.top`/`rect.height` del bloque, como los reporta el puente. */
	top: number;
	height: number;
	/** Alto del overlay en px de la página; `0` = sin medir (se supone sitio abajo). */
	canvasHeight: number;
	/** `1 / zoom`. */
	scale: number;
	/** Alto físico de la fila (la barra mide ~40 px; una etiqueta sola, 22). */
	rowHeight: number;
}

export function placeChrome({
	top,
	height,
	canvasHeight,
	scale,
	rowHeight
}: ChromePlacementInput): ChromePlacement {
	const clearance = CHROME_CLEARANCE * scale;
	const row = rowHeight * scale;
	const bottom = top + height;
	if (top - clearance - row >= 0) return { side: 'above', center: top - clearance - row / 2 };
	if (canvasHeight <= 0 || bottom + clearance + row <= canvasHeight) {
		return { side: 'below', center: bottom + clearance + row / 2 };
	}
	// Ni arriba ni abajo: dentro, al pie de lo que se ve del bloque (nunca sobre su primera línea).
	const visibleBottom = Math.min(bottom, canvasHeight);
	return { side: 'inside', center: Math.max(row / 2, visibleBottom - clearance - row / 2) };
}

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
