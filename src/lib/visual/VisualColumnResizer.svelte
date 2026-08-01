<script lang="ts">
	/**
	 * `VisualColumnResizer.svelte` (petición de David tras usar el editor visual en prod, "ajustar
	 * el ancho de las tres columnas arrastrando sus bordes"): la manilla ENTRE dos columnas del
	 * grid de `VisualEditorScreen.svelte` — una para árbol|lienzo, otra para lienzo|inspector. Sin
	 * estado propio de "cuánto mide la columna": ese dato vive en la pantalla (`columnWidths`, un
	 * solo dueño — mismo criterio que `selectedBlockId`, ver la cabecera de
	 * `VisualEditorScreen.svelte`); esta manilla solo TRADUCE gestos (arrastre, teclado, doble
	 * clic) en llamadas a `onResize`, y avisa si está en medio de un arrastre (`onDragChange`) para
	 * que la pantalla pueda tapar el lienzo mientras dura (ver más abajo).
	 *
	 * **El truco del `sign`**: la misma manilla sirve para las DOS fronteras aunque el gesto
	 * signifique lo contrario en cada una — arrastrar a la derecha AGRANDA el árbol (está a la
	 * IZQUIERDA de su manilla, `sign={1}`) pero ENCOGE el inspector (está a la DERECHA de la suya,
	 * `sign={-1}`). `Home`/`End` no usan `sign`: van siempre al mínimo/máximo absolutos de la
	 * columna, sea cual sea su lado (mismo criterio que el patrón APG "window splitter").
	 *
	 * **El lienzo es un `<iframe>` de otro origen y se come los eventos del ratón** (trampa
	 * documentada del encargo): en cuanto el puntero entra en él a media arrastrada, este
	 * componente deja de recibir `pointermove` aunque escuche en `window` y pida
	 * `setPointerCapture` (la captura no cruza de forma fiable el límite del `<iframe>` en los
	 * navegadores reales, y ni siquiera existe en jsdom — ver el guard de abajo). La manilla NO se
	 * defiende sola de esto: avisa con `onDragChange(true)` al empezar y `(false)` al soltar, y es
	 * `VisualEditorScreen.svelte` quien tapa el lienzo con una capa transparente mientras tanto
	 * (`.vega-visual-shield`, ver su cabecera) — así el `pointermove` nunca llega a tener que
	 * atravesar el marco.
	 *
	 * **Accesible de verdad** (§encargo, "no solo arrastrable"): `role="separator"` +
	 * `aria-orientation="vertical"` + `aria-valuenow`/`min`/`max` (patrón APG "window splitter"),
	 * foco por teclado (`tabindex="0"`, con anillo visible propio) y flechas Izquierda/Derecha
	 * mueven `STEP` px. Doble clic devuelve `defaultValue` (§encargo).
	 */
	import { clamp } from './column-widths';

	interface Props {
		/** Ancho ACTUAL de la columna que gobierna esta manilla (dueño único: la pantalla). */
		value: number;
		min: number;
		max: number;
		defaultValue: number;
		/** Qué columna ajusta (`aria-label`): p.ej. "Ajustar ancho del árbol de secciones". */
		label: string;
		/** +1: arrastrar/flecha-derecha AGRANDA `value` (columna a la IZQUIERDA de la manilla).
		 *  -1: arrastrar/flecha-derecha la ENCOGE (columna a la DERECHA). Ver cabecera. */
		sign: 1 | -1;
		onResize: (next: number) => void;
		onDragChange: (dragging: boolean) => void;
	}

	let { value, min, max, defaultValue, label, sign, onResize, onDragChange }: Props = $props();

	/** Paso del teclado (§encargo: "las flechas mueven de 16 en 16 px"). */
	const STEP = 16;

	/** Único punto de recorte (ver `column-widths.ts#clamp`): romperlo aquí lo rompe para arrastre
	 *  Y teclado a la vez, nunca uno de los dos por separado. */
	function resizeTo(next: number): void {
		onResize(clamp(next, min, max));
	}

	function handleKeydown(event: KeyboardEvent): void {
		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				resizeTo(value - STEP * sign);
				break;
			case 'ArrowRight':
				event.preventDefault();
				resizeTo(value + STEP * sign);
				break;
			case 'Home':
				event.preventDefault();
				resizeTo(min);
				break;
			case 'End':
				event.preventDefault();
				resizeTo(max);
				break;
		}
	}

	/** Cursor "col-resize" + selección de texto desactivada en TODO el documento mientras dura el
	 *  arrastre (no solo sobre la manilla, de 8px): el puntero recorre el resto de la pantalla
	 *  durante el gesto, y un cursor que parpadea entre estados, o texto que se selecciona sin
	 *  querer al pasar por encima de una etiqueta, son las dos molestias clásicas de un arrastre
	 *  sin esto. */
	function handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		const startX = event.clientX;
		const startValue = value;
		const target = event.currentTarget as HTMLElement;
		// jsdom (banco de pruebas de componente) no implementa `setPointerCapture` — sin este guard
		// el `pointerdown` de los tests reventaría. En un navegador real solo ayuda cuando el
		// puntero sale del propio elemento SIN cruzar el iframe: el escudo de la pantalla (ver
		// cabecera) es quien resuelve el caso que de verdad importa.
		if (typeof target.setPointerCapture === 'function') {
			try {
				target.setPointerCapture(event.pointerId);
			} catch {
				// Entorno sin soporte real de captura de puntero: el arrastre sigue funcionando
				// igual por los escuchadores de `window`, más abajo.
			}
		}
		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		onDragChange(true);

		function handleMove(moveEvent: PointerEvent): void {
			resizeTo(startValue + (moveEvent.clientX - startX) * sign);
		}
		function handleUp(): void {
			window.removeEventListener('pointermove', handleMove);
			window.removeEventListener('pointerup', handleUp);
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			onDragChange(false);
		}
		window.addEventListener('pointermove', handleMove);
		window.addEventListener('pointerup', handleUp);
	}
</script>

<!-- `role="separator"` + `tabindex="0"` es el patrón APG "window splitter" (una excepción
     documentada: un `separator` normalmente NO es interactivo, pero SÍ lo es en cuanto gobierna
     un tamaño con teclado, como aquí) — el validador de a11y del propio compilador no conoce esa
     excepción y lo marca como "elemento no interactivo con tabindex/manejadores", falso positivo
     conocido del patrón. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="vega-col-resizer"
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={Math.round(value)}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex="0"
	onpointerdown={handlePointerDown}
	ondblclick={() => resizeTo(defaultValue)}
	onkeydown={handleKeydown}
></div>

<style>
	.vega-col-resizer {
		align-self: stretch;
		width: 8px;
		flex-shrink: 0;
		position: relative;
		cursor: col-resize;
		/* Sin esto, un arrastre en pantalla táctil también hace scroll/zoom del contenedor a la vez
		   que mueve la manilla. */
		touch-action: none;
	}

	/* El elemento entero (8px) es el carril de acierto de puntero — más generoso que la línea
	   visible, mismo criterio de objetivo cómodo que el resto del chrome — pero solo se PINTA una
	   línea de 1px centrada, para no partir visualmente el lienzo con una franja gruesa. */
	.vega-col-resizer::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		transform: translateX(-50%);
		background: var(--line);
	}

	.vega-col-resizer:hover::before {
		background: var(--line-strong);
	}

	.vega-col-resizer:focus-visible {
		outline: none;
	}

	.vega-col-resizer:focus-visible::before {
		width: 2px;
		background: var(--accent);
	}
</style>
