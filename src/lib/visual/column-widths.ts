/**
 * Anchos de las columnas LATERALES del editor visual (árbol · inspector), persistidos entre
 * sesiones (petición de David tras usar el editor visual en prod, "ajustar el ancho de las tres
 * columnas arrastrando sus bordes"): módulo PURO (constantes + `clamp` + saneado de lo leído de
 * `localStorage`), sin tocar `window`/`localStorage` — eso lo hace `column-widths-storage.ts`
 * (hermano IMPURO, mismo criterio de separación que `theme/preferences.ts` vs `theme/apply.ts`, o
 * `update/preferences.ts` vs `update/storage.ts`).
 *
 * El lienzo (columna central de `VisualEditorScreen.svelte`) NO tiene ancho propio — siempre
 * `minmax(0, 1fr)` en el grid — así que solo el árbol y el inspector necesitan un tope: eso
 * evita "comerse el lienzo" sin tener que medir el viewport aquí.
 */

/** Ancho, en píxeles, de cada columna lateral. */
export interface VisualColumnWidths {
	readonly tree: number;
	readonly inspector: number;
}

/** Topes del árbol (columna izquierda, §encargo "topes mínimo y máximo por columna"): por debajo
 *  de `TREE_MIN_WIDTH` el título de un bloque ya no tiene sitio sin recortarse a nada; por
 *  encima de `TREE_MAX_WIDTH` la lista deja de aportar más que el lienzo que le quita. */
export const TREE_MIN_WIDTH = 220;
export const TREE_MAX_WIDTH = 480;
/** El ancho fijo de antes de este encargo (`VisualEditorScreen.svelte`, `280px`). */
export const TREE_DEFAULT_WIDTH = 280;

/** Mismo criterio para el inspector (columna derecha): por debajo de `INSPECTOR_MIN_WIDTH` un
 *  campo de texto normal ya no tiene sitio para escribir; por encima de `INSPECTOR_MAX_WIDTH`
 *  empieza a comerse el lienzo. */
export const INSPECTOR_MIN_WIDTH = 260;
export const INSPECTOR_MAX_WIDTH = 520;
/** El ancho fijo de antes de este encargo (`VisualEditorScreen.svelte`, `320px`). */
export const INSPECTOR_DEFAULT_WIDTH = 320;

/** Anchos de partida: los mismos valores fijos que tenía el grid antes de este encargo, así que
 *  quien no toca nunca las manillas ve exactamente la pantalla de siempre. */
export const DEFAULT_COLUMN_WIDTHS: VisualColumnWidths = {
	tree: TREE_DEFAULT_WIDTH,
	inspector: INSPECTOR_DEFAULT_WIDTH
};

/** Recorta `value` a `[min, max]`: la ÚNICA puerta que decide "hasta dónde llega" un ancho —
 *  `VisualColumnResizer.svelte` la usa tanto para el arrastre como para el teclado, así que
 *  romper el tope aquí lo rompe para los dos gestos a la vez, nunca uno sin el otro. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Sanea lo leído de `localStorage` (JSON arbitrario: esquema de una versión anterior, editado a
 * mano, o corrupto) — mismo criterio defensivo que `isCachedUpdateCheck` de `update/storage.ts`.
 * Un campo ausente, del tipo equivocado o fuera de rango cae al default de SU columna; nunca
 * revienta ni arrastra al resto — el árbol puede volver a su ancho de siempre mientras el
 * inspector conserva el que el autor fijó.
 */
export function sanitizeColumnWidths(value: unknown): VisualColumnWidths {
	const record =
		typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
	const tree =
		typeof record.tree === 'number' && Number.isFinite(record.tree)
			? clamp(record.tree, TREE_MIN_WIDTH, TREE_MAX_WIDTH)
			: TREE_DEFAULT_WIDTH;
	const inspector =
		typeof record.inspector === 'number' && Number.isFinite(record.inspector)
			? clamp(record.inspector, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH)
			: INSPECTOR_DEFAULT_WIDTH;
	return { tree, inspector };
}
