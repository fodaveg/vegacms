/**
 * `action-menu.ts` (Lote 12, láminas 6 y 7): la parte de `ActionMenu.svelte` que no depende del
 * DOM — el contrato de cada entrada y el cálculo de dónde se pinta un menú anclado a la ventana.
 * Mismo reparto que `reorder-dnd.ts` y `$lib/visual/type-menu.ts`: funciones PURAS, testeables
 * sin montar nada (`action-menu.test.ts`).
 *
 * Por qué un menú «anclado a la ventana» (`position: fixed`): las celdas de `RecordTable` recortan
 * (`overflow: hidden` para los puntos suspensivos) y la tabla tiene su propio desplazamiento
 * lateral, así que un menú posicionado dentro de la celda saldría cortado (nota de la lámina 7).
 * Se pinta fuera del flujo con la posición calculada desde el disparador, y se abre hacia ARRIBA
 * cuando no cabe debajo (últimas filas de la página).
 */

/** Una entrada del menú. `action` sale como `data-action` del `menuitem` (los e2e localizan por
 *  ahí, igual que hacían con el «Borrar» de fila). */
export interface ActionMenuItem {
	/** Clave estable dentro del menú (`{#each}`). */
	id: string;
	/** Texto visible y nombre accesible de la entrada. */
	label: string;
	/** Icono del set (`Icon.svelte`), decorativo: la etiqueta ya lo nombra. */
	icon?: string;
	/** Acción destructiva: la pareja `--danger`/`--danger-soft` del «Borrar» de siempre. */
	tone?: 'danger';
	/** `data-action` del `menuitem`. */
	action?: string;
	onSelect: () => void;
}

/** Caja del disparador, en coordenadas de la ventana (lo que da `getBoundingClientRect`). */
interface AnchorRect {
	top: number;
	right: number;
	bottom: number;
}

interface ViewportSize {
	width: number;
	height: number;
}

/** Colocación resuelta de un menú anclado a la ventana (ver cabecera). `direction` vale para
 *  tests y para quien quiera animar o marcar el menú; `style` es lo que se pinta. */
interface ViewportPlacement {
	direction: 'down' | 'up';
	/** Declaraciones CSS listas para el atributo `style` del menú (`position: fixed` lo pone la
	 *  clase, aquí solo van las coordenadas). */
	style: string;
}

/** Separación entre el disparador y el menú, en px: la misma distancia (0.4rem a 16 px de raíz)
 *  que `.vega-list-filter-menu` deja bajo su botón. */
export const MENU_GAP_PX = 6;

/**
 * Dónde pintar un menú de `menuHeight` px anclado a `anchor`, alineado al borde derecho del
 * disparador: debajo si cabe hasta el borde inferior de la ventana; si no cabe debajo pero sí
 * arriba, hacia arriba. Si no cabe en ningún lado, debajo (el navegador deja desplazar la ventana;
 * un menú cortado por arriba no se podría alcanzar).
 *
 * El borde derecho nunca se sale de la ventana (`right` mínimo `MENU_GAP_PX`): el disparador va
 * pegado al borde derecho de la tabla y la celda es más estrecha que el menú.
 */
export function placeViewportMenu(
	anchor: AnchorRect,
	menuHeight: number,
	viewport: ViewportSize
): ViewportPlacement {
	const right = Math.max(MENU_GAP_PX, Math.round(viewport.width - anchor.right));
	const below = anchor.bottom + MENU_GAP_PX;
	const fitsBelow = below + menuHeight <= viewport.height;
	const fitsAbove = anchor.top - MENU_GAP_PX - menuHeight >= 0;
	if (!fitsBelow && fitsAbove) {
		const bottom = Math.round(viewport.height - anchor.top + MENU_GAP_PX);
		return { direction: 'up', style: `right: ${right}px; bottom: ${bottom}px;` };
	}
	return { direction: 'down', style: `right: ${right}px; top: ${Math.round(below)}px;` };
}
