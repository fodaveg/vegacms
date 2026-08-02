/**
 * Tamaño de pantalla + zoom del lienzo (tarea "el acabado: tamaños de pantalla, zoom, atajos y
 * estado de guardado" del lote del editor visual): módulo PURO (constantes + cálculo + saneado),
 * mismo criterio de separación que `column-widths.ts` — `viewport-storage.ts` (hermano IMPURO) es
 * quien toca `localStorage`; `VisualEditorScreen.svelte` es quien toca el DOM (`ResizeObserver`,
 * el propio `transform: scale()`).
 *
 * **Por qué el ancho del IFRAME, nunca el de la ventana** (§encargo): el sitio dispara sus propios
 * puntos de corte contra el viewport que VE, que es el del `<iframe>` — ensanchar o encoger un
 * `<div>` de Vega no movería ni un solo `@media` del sitio. Móvil/tablet son anchos FIJOS (390/834,
 * los mismos números que trae cualquier DevTools de navegador, no un invento de Vega); escritorio
 * no tiene ancho fijo — el encargo pide "llenar el lienzo", así que su ancho es el MEDIDO del
 * propio `.vega-visual-canvas` (`frameWidthFor`, más abajo), nunca un número inventado.
 *
 * **Zoom: por qué el `<iframe>` se escala con `transform`, no con `width`.** `transform: scale()`
 * NO cambia el viewport CSS que ve el documento de dentro (a diferencia de tocar `width`, que sí
 * dispararía los puntos de corte del sitio) — es justo la propiedad que hace falta: el sitio sigue
 * creyendo que mide 390/834/lo medido aunque Vega lo PINTE más pequeño. Este módulo solo calcula EL
 * FACTOR (`resolveZoomFactor`); quién escala qué elemento del DOM (el "escenario" que envuelve
 * iframe + overlay, para que los dos se muevan a la vez — ver la cabecera de
 * `VisualEditorScreen.svelte`) es decisión de quien monta el componente, no de este módulo.
 *
 * **"Ajustar" nunca amplía** (§encargo, "tope en 1"): un lienzo más ancho que el preset elegido no
 * tiene motivo para agrandar el sitio por encima de su tamaño real — eso falsearía el punto de
 * corte que el autor quiso comprobar (un móvil de 390px estirado ya no PARECE un móvil). Por eso
 * `resolveZoomFactor` recorta el resultado de "ajustar" a `[MIN_ZOOM_FACTOR, 1]`, nunca a
 * `[MIN_ZOOM_FACTOR, +∞)`.
 *
 * **Por qué "ajustar" no se guarda como un número fijo.** Depende del ancho MEDIDO del lienzo, que
 * cambia con la ventana y con las manillas de columna (`column-widths.ts`) — guardar el resultado
 * de HOY como si fuera un porcentaje fijo estaría persistiendo un cálculo ya caducado desde el
 * primer redimensionado de mañana. Por eso `ZoomPreference` incluye el modo `'fit'` como valor
 * literal, no un número: se recalcula en cada render contra la medida viva.
 */

export type ScreenPreset = 'mobile' | 'tablet' | 'desktop';

/** Mismos números que cualquier DevTools de navegador (§encargo): no son un invento de Vega. */
export const MOBILE_WIDTH = 390;
export const TABLET_WIDTH = 834;

export const SCREEN_PRESETS: readonly ScreenPreset[] = ['mobile', 'tablet', 'desktop'];

/** Niveles fijos de zoom (§encargo). El modo "ajustar" vive en `ZoomPreference`, no aquí: no es un
 *  nivel, es un CÁLCULO (ver cabecera). */
export type ZoomLevel = 50 | 75 | 100;
export const ZOOM_LEVELS: readonly ZoomLevel[] = [50, 75, 100];
export type ZoomPreference = ZoomLevel | 'fit';

export const DEFAULT_SCREEN_PRESET: ScreenPreset = 'desktop';
/** 100 %, no `'fit'`: quien nunca toca los controles nuevos ve la pantalla de siempre (lienzo a
 *  tamaño real, sin escalar) — mismo criterio de "el default reproduce el comportamiento de antes
 *  de este encargo" que ya usa `DEFAULT_COLUMN_WIDTHS`. */
export const DEFAULT_ZOOM: ZoomPreference = 100;

/** Piso de seguridad del factor de zoom: sin él, un lienzo momentáneamente sin medir (0px, antes
 *  del primer aviso de `ResizeObserver`) dividiría entre cero y `resolveZoomFactor` devolvería
 *  `Infinity`/`NaN` en vez de un factor pintable. No es un tope de producto (nadie elige "10 %" a
 *  mano, no hay control para eso) — es una cota defensiva para que el número que llega a
 *  `transform: scale()` sea SIEMPRE finito y positivo (L11: degradar sin crashear ni pintar un
 *  `NaN%` invisible). */
const MIN_ZOOM_FACTOR = 0.1;

/**
 * Ancho de LAYOUT del `<iframe>` (el que el sitio de dentro cree que mide), en px. Fijo para
 * móvil/tablet; en escritorio es el ancho MEDIDO de `.vega-visual-canvas` — que no cambia con el
 * zoom elegido (mide el CONTENEDOR, no la caja ya escalada de dentro, ver la cabecera de
 * `VisualEditorScreen.svelte`), así que este número es estable sea cual sea el nivel de zoom: un
 * escritorio al 50 % sigue midiendo lo mismo que al 100 %, solo se pinta más pequeño.
 * `measuredCanvasWidth` no finito o negativo (todavía sin medir, o un valor corrupto) cae a `0`:
 * sin ancho honesto que enseñar hasta el primer aviso de `ResizeObserver`.
 */
export function frameWidthFor(preset: ScreenPreset, measuredCanvasWidth: number): number {
	switch (preset) {
		case 'mobile':
			return MOBILE_WIDTH;
		case 'tablet':
			return TABLET_WIDTH;
		case 'desktop': {
			const safe = Number.isFinite(measuredCanvasWidth) ? measuredCanvasWidth : 0;
			return Math.max(0, Math.round(safe));
		}
	}
}

/**
 * Factor de escala (`1` = 100 %, el que consume `transform: scale()`). Un nivel FIJO se traduce
 * sin más (`50`/`75`/`100` → `0.5`/`0.75`/`1`); `'fit'` divide el ancho MEDIDO del lienzo entre el
 * ancho de layout del iframe, recortado a `[MIN_ZOOM_FACTOR, 1]` (nunca amplía, ver cabecera del
 * módulo). `frameWidth <= 0` (todavía sin resolver, o un lienzo aún sin medir) no tiene proporción
 * honesta que calcular: cae a `1` en vez de `Infinity`/`NaN`.
 */
export function resolveZoomFactor(
	zoom: ZoomPreference,
	measuredCanvasWidth: number,
	frameWidth: number
): number {
	if (zoom !== 'fit') return zoom / 100;
	if (frameWidth <= 0 || !Number.isFinite(measuredCanvasWidth)) return 1;
	const ratio = measuredCanvasWidth / frameWidth;
	return Math.min(1, Math.max(MIN_ZOOM_FACTOR, ratio));
}

/**
 * Alto propio del "escenario" (el elemento que envuelve iframe + overlay y que
 * `VisualEditorScreen.svelte` escala con `transform: scale(factor)`): `alto_del_lienzo / factor`,
 * para que al escalarlo la caja visual resultante llene EXACTAMENTE el alto del lienzo (§encargo:
 * "el escenario necesita alto propio"). `factor <= 0` no debería llegar aquí en la práctica
 * (`resolveZoomFactor` ya lo impide con su piso), pero L11 manda degradar sin dividir por cero: cae
 * al alto del lienzo tal cual, sin escalar.
 */
export function stageHeightFor(measuredCanvasHeight: number, factor: number): number {
	const safeHeight = Number.isFinite(measuredCanvasHeight) ? Math.max(0, measuredCanvasHeight) : 0;
	if (factor <= 0) return safeHeight;
	return safeHeight / factor;
}

/** Preferencia persistida entre sesiones (`viewport-storage.ts`): las DOS piezas que el encargo
 *  pide guardar, un solo objeto — mismo criterio que `VisualColumnWidths`. */
export interface VisualViewportPreference {
	readonly preset: ScreenPreset;
	readonly zoom: ZoomPreference;
}

export const DEFAULT_VIEWPORT_PREFERENCE: VisualViewportPreference = {
	preset: DEFAULT_SCREEN_PRESET,
	zoom: DEFAULT_ZOOM
};

function isScreenPreset(value: unknown): value is ScreenPreset {
	return typeof value === 'string' && (SCREEN_PRESETS as readonly string[]).includes(value);
}

function isZoomPreference(value: unknown): value is ZoomPreference {
	if (value === 'fit') return true;
	return typeof value === 'number' && (ZOOM_LEVELS as readonly number[]).includes(value);
}

/**
 * Sanea lo leído de `localStorage` (JSON arbitrario: esquema de una versión anterior, editado a
 * mano, o corrupto) — mismo criterio defensivo que `sanitizeColumnWidths`. Un campo ausente, del
 * tipo equivocado o fuera del vocabulario cierra al default de SU propio campo, nunca arrastra al
 * otro: una preferencia de zoom corrupta no debería tirar también el preset de pantalla guardado.
 */
export function sanitizeViewportPreference(value: unknown): VisualViewportPreference {
	const record =
		typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
	return {
		preset: isScreenPreset(record.preset) ? record.preset : DEFAULT_SCREEN_PRESET,
		zoom: isZoomPreference(record.zoom) ? record.zoom : DEFAULT_ZOOM
	};
}
