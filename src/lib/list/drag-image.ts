/**
 * `drag-image.ts`: imagen de arrastre propia para los tres orígenes de arrastre del editor (las
 * baldosas de «Añadir sección», las filas de las secciones de `RecordBlocks.svelte` y el asa del
 * lienzo en `VisualOverlay.svelte`).
 *
 * **Se carga a demanda.** El editor visual y el de registro están al borde de su presupuesto de
 * peso (`scripts/check-bundle-budget.mjs`), así que cada componente lo pide con `import()` al
 * montarse y llega mucho antes de que nadie arrastre. `dragstart` exige `setDragImage` en el acto
 * (no admite esperar a un `import()`): si el módulo aún no ha llegado o no pudo cargarse, el
 * arrastre sigue con la imagen por defecto del navegador, sin romperse.
 *
 * **Por qué hace falta** (fallo de 0.14.1 visto por David en admin.fodaveg.net, Vivaldi, spec del
 * 22 oct 2026, parte E): ninguno de los tres llamaba a `DataTransfer.setDragImage`, así que la
 * imagen era la que el navegador saca por defecto del elemento arrastrado. Esa instantánea pinta la
 * caja del elemento TAL COMO SE VE en la página, y las baldosas son transparentes (`background:
 * transparent`, o el `--accent-soft` translúcido al pasar): lo que hay detrás —la fila «Texto» de
 * «Secciones de página» con sus flechas— se colaba en la imagen.
 *
 * **Qué hace**: clona el elemento, le da un fondo OPACO (sus capas translúcidas y las de sus
 * antepasados compuestas sobre el primer fondo opaco: el color que se ve en pantalla, sin
 * transparencia), lo fija con `position: fixed` en la misma caja que el original, colgado de
 * `<body>` (fuera de cualquier `overflow` que lo recorte y de cualquier lista que gestione Svelte), y
 * se lo pasa a `setDragImage` con el desplazamiento del punto donde se agarró, para que la copia
 * quede bajo el cursor en ese mismo punto. Los navegadores pintan la imagen DESPUÉS de que vuelva el
 * manejador de `dragstart`, así que la copia se retira en la tarea siguiente, no en el acto. Va con
 * `z-index: -1` y sin eventos de puntero: el instante que vive no tapa nada.
 *
 * Fuera de su sitio la copia perdería lo que heredaba (tipografía) y lo que dependía del puntero
 * (`:hover`: borde, texto y fondo), así que lleva esos valores ya resueltos del original.
 */

/** Alfa de un color resuelto por `getComputedStyle` (`rgb()`, `rgba()` o sintaxis con `/`). */
function alphaOf(color: string): number {
	if (color === '' || color === 'transparent') return 0;
	const match =
		/\/\s*([\d.]+)(%?)\s*\)$/.exec(color) ?? /^rgba\([^)]*,\s*([\d.]+)(%?)\s*\)$/.exec(color);
	if (!match) return 1;
	return match[2] ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
}

/**
 * Fondo opaco equivalente al que se ve bajo `source`: sus capas translúcidas (la suya y las de los
 * antepasados hasta el primero opaco) apiladas como degradados de un solo color sobre ese color
 * opaco. Sin ningún antepasado opaco, el color `Canvas` del sistema.
 */
export function opaqueBackground(source: Element): string {
	const layers: string[] = [];
	for (let node: Element | null = source; node; node = node.parentElement) {
		const color = getComputedStyle(node).backgroundColor;
		const alpha = alphaOf(color);
		if (alpha >= 1) return [...layers, color].join(', ');
		if (alpha > 0) layers.push(`linear-gradient(${color}, ${color})`);
	}
	return [...layers, 'Canvas'].join(', ');
}

/**
 * Fija como imagen de arrastre de `event` una copia opaca de `source`, de su mismo tamaño y con el
 * cursor en el punto donde se agarró. No hace nada si el navegador no ofrece `setDragImage`, si no
 * hay `dataTransfer` o si `source` no tiene caja (oculto): el arrastre sigue con la imagen por
 * defecto, nunca se rompe.
 */
export function setCopyDragImage(event: DragEvent, source: Element | null): void {
	const dataTransfer = event.dataTransfer;
	if (!source || !dataTransfer || typeof dataTransfer.setDragImage !== 'function') return;
	const rect = source.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return;
	const computed = getComputedStyle(source);
	const copy = source.cloneNode(true) as HTMLElement;
	for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
	copy.setAttribute('aria-hidden', 'true');
	copy.setAttribute('inert', '');
	copy.setAttribute('data-vega-drag-image', '');
	Object.assign(copy.style, {
		position: 'fixed',
		top: `${rect.top}px`,
		left: `${rect.left}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		margin: '0',
		boxSizing: 'border-box',
		zIndex: '-1',
		pointerEvents: 'none',
		opacity: '1',
		transform: 'none',
		color: computed.color,
		borderColor: computed.borderColor,
		borderStyle: computed.borderStyle,
		fontFamily: computed.fontFamily,
		fontSize: computed.fontSize,
		fontWeight: computed.fontWeight,
		lineHeight: computed.lineHeight,
		background: opaqueBackground(source)
	});
	document.body.appendChild(copy);
	const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
	const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
	dataTransfer.setDragImage(copy, x, y);
	setTimeout(() => copy.remove(), 0);
}
