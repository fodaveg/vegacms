/**
 * `markdown-split.ts`: cuándo el modo «Dividido» del campo Markdown cabe (spec del 22 oct 2026,
 * parte C). En la ficha del editor visual las dos columnas quedaban de una o dos palabras por línea;
 * desde aquí «Dividido» solo se ofrece si CADA columna deja al menos `SPLIT_MIN_CHARS` caracteres
 * de texto con la fuente del editor. Si no cabe, el widget ofrece «Escribir» y «Vista», y quien
 * tenía elegido «Dividido» lo ve como «Escribir» (sin perder el texto ni la preferencia guardada:
 * al volver a ensanchar vuelve a dividirse).
 *
 * `Markdown.svelte` llama a `observeSplit` al montarse, antes del primer pintado, así que un
 * «Dividido» que no cabe nunca llega a verse en dos columnas.
 */

/** Mínimo legible por columna, en caracteres de la fuente del editor. */
export const SPLIT_MIN_CHARS = 32;

export interface SplitMeasure {
	/** Ancho del cuerpo que se reparte entre las dos columnas, en px. */
	readonly bodyWidth: number;
	/** Ancho de `SPLIT_MIN_CHARS` caracteres en la fuente del editor, en px (medido). */
	readonly minTextWidth: number;
	/** Rellenos y bordes horizontales que la columna de escritura no deja al texto, en px. */
	readonly writeInset: number;
	/** Ídem para la columna de vista. */
	readonly previewInset: number;
}

/**
 * `true` si las dos columnas de «Dividido» dejan cada una al menos `minTextWidth` de texto. Sin
 * medida honesta (cuerpo o sonda a 0, o `NaN`: aún sin pintar, o un entorno sin maquetación) no hay
 * nada que decidir y se ofrece, como hasta ahora.
 */
export function splitFits(measure: SplitMeasure): boolean {
	const { bodyWidth, minTextWidth } = measure;
	if (!(bodyWidth > 0) || !(minTextWidth > 0)) return true;
	const column = bodyWidth / 2;
	const inset = Math.max(measure.writeInset || 0, measure.previewInset || 0);
	return column - inset >= minTextWidth;
}

/** Relleno horizontal más borde izquierdo de `element`, en px (0 si no hay nada que medir). */
function insetOf(element: Element | null): number {
	if (!element) return 0;
	const style = getComputedStyle(element);
	return (
		(parseFloat(style.paddingLeft) || 0) +
		(parseFloat(style.paddingRight) || 0) +
		(parseFloat(style.borderLeftWidth) || 0)
	);
}

/**
 * Mide ya y a cada cambio de tamaño del cuerpo (`.vega-markdown-body`, el que se reparten las
 * columnas; `ResizeObserver`), y avisa con `onChange(cabe)`. La medida del mínimo es una sonda sin
 * pintar de `SPLIT_MIN_CHARS`ch con la fuente RESUELTA del `<textarea>` en ese momento, colgada del
 * cuerpo (que se pinta en los tres modos). La vista es `.vega-markdown-preview-content`; su padre,
 * `.vega-markdown-preview`, lleva el borde. Devuelve la función que deja de observar y retira la
 * sonda. Sin `ResizeObserver` mide una vez; sin cuerpo no hace nada.
 *
 * El aviso del `ResizeObserver` NO mide ni avisa en el acto: lo deja para el siguiente
 * `requestAnimationFrame` (uno por fotograma). Cambiar de modo cambia el alto del propio cuerpo
 * observado (la vista aparece o desaparece); hacerlo dentro de su callback es un bucle de
 * `ResizeObserver`, y WebKit lo dice con «ResizeObserver loop completed with undelivered
 * notifications» (QA del 22 oct 2026, al abrir la ficha de un bloque antes oculta).
 */
export function observeSplit(textarea: HTMLElement, onChange: (fits: boolean) => void): () => void {
	const body = textarea.closest('.vega-markdown-body');
	if (!body) return () => {};
	const preview = body.querySelector('.vega-markdown-preview-content');
	const probe = document.createElement('span');
	probe.setAttribute('aria-hidden', 'true');
	probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${SPLIT_MIN_CHARS}ch`;
	body.append(probe);
	const measure = (): void => {
		const font = getComputedStyle(textarea);
		Object.assign(probe.style, {
			fontFamily: font.fontFamily,
			fontSize: font.fontSize,
			fontWeight: font.fontWeight,
			letterSpacing: font.letterSpacing
		});
		onChange(
			splitFits({
				bodyWidth: body.getBoundingClientRect().width,
				minTextWidth: probe.getBoundingClientRect().width,
				writeInset: insetOf(textarea),
				previewInset: insetOf(preview) + insetOf(preview?.parentElement ?? null)
			})
		);
	};
	measure();
	let frame: number | null = null;
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					if (frame !== null) return;
					frame = requestAnimationFrame(() => {
						frame = null;
						measure();
					});
				});
	observer?.observe(body);
	return () => {
		observer?.disconnect();
		if (frame !== null) cancelAnimationFrame(frame);
		probe.remove();
	};
}
