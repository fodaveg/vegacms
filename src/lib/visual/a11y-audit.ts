/**
 * Instrumento de MEDICIÓN de accesibilidad del editor visual (encargo "puerta de accesibilidad del
 * editor visual: MEDIDA, no afirmada"): funciones PURAS sobre un `ParentNode` ya pintado, sin
 * Svelte y sin estado propio — mismo criterio y mismo nivel de comentario que `focus-target.ts`
 * (el precedente exacto de este repo: DOM extraído para poder medirlo con jsdom sin montar ningún
 * componente). El criterio del encargo es literal: "cada afirmación de accesibilidad tiene que
 * quedar respaldada por una medición que falle si alguien rompe la propiedad" — un test que pasa
 * tanto con el código bien como con el código roto no cuenta, así que estas funciones existen para
 * que los tests de `VisualInspector`/`VisualBlockTree`/`VisualOverlay`/la paridad de teclado
 * tengan algo objetivo que comprobar, no una intuición sobre el marcado.
 *
 * Vive en `$lib/visual` porque hoy solo lo usan los tests y componentes de este módulo, pero no
 * depende de nada de aquí dentro: si algún día otra pantalla de Vega necesita el mismo tipo de
 * medición (enumerar focusables, cazar el antipatrón `aria-hidden`/`hidden` con algo tabulable
 * dentro), este fichero se mueve entero sin tocar una línea de su cuerpo.
 *
 * `isFocusable` (de `focus-target.ts`, ver su cabecera para el porqué de exportarlo) es la ÚNICA
 * fuente de verdad de "qué cuenta como enfocable" en todo el repo: `INPUT/SELECT/TEXTAREA/BUTTON/A`
 * o `[tabindex]` explícito, descartando `disabled` y (por construcción del propio criterio de
 * `focus-target.ts`, que exige `tabindex` sin más) cualquier elemento cuyo único candidato a
 * enfocable sea un `tabindex="-1"` — un `[tabindex="-1"]` SÍ tiene el atributo `tabindex`, así que
 * `isFocusable` lo aceptaría; se descarta aquí explícitamente (ver `focusables`, más abajo) porque
 * `tabindex="-1"` es la forma estándar de decir "focusable por script, nunca por Tab" — exactamente
 * lo que NO hay que contar en un audit de tabulación.
 */
import { isFocusable } from '$lib/form/focus-target';

/**
 * Elementos nativamente focusables Y habilitados dentro de `root`, en el ORDEN del DOM
 * (`querySelectorAll` ya los devuelve así, y es el orden en el que Tab los visita salvo que algún
 * `tabindex` positivo lo reordene — este repo no usa `tabindex` positivo en ningún sitio, así que
 * el orden del DOM coincide con el de tabulación real). Excluye `tabindex="-1"` a propósito (ver
 * cabecera): esos elementos son focusables PROGRAMÁTICAMENTE (`.focus()` los alcanza, es el mismo
 * truco que usan las cabeceras ancla de este repo — `RecordBlocks.svelte`, `VisualBlockTree.svelte`)
 * pero Tab nunca los visita, así que no cuentan para un audit de tabulación.
 *
 * Es la base de las dos comprobaciones de abajo: un elemento que no es focusable de verdad no
 * puede estar "atrapado" bajo `aria-hidden`/`hidden` de ninguna forma que le importe a quien tabula
 * o a un lector de pantalla.
 */
export function focusables(root: ParentNode): HTMLElement[] {
	const candidates = root.querySelectorAll<HTMLElement>(
		'input, select, textarea, button, a, [tabindex]'
	);
	return Array.from(candidates).filter(
		(el) => isFocusable(el) && el.getAttribute('tabindex') !== '-1'
	);
}

/**
 * Antipatrón "interactivo pero invisible para quien no ve": los `focusables()` de `root` que
 * además tienen algún ANCESTRO (o son ellos mismos) con `aria-hidden="true"`. La medición sana es
 * que salga VACÍO — un control tabulable que un lector de pantalla nunca anuncia porque su
 * contenedor lo declara decorativo es justo lo que `VisualOverlay.svelte` documenta evitar en su
 * grupo de cajas (ver su cabecera: los controles de VERDAD —barra flotante, puntos de inserción,
 * destinos del arrastre— viven SIEMPRE como capas HERMANAS del grupo `aria-hidden`, nunca dentro).
 * `closest()` cubre el caso "es él mismo" porque un elemento siempre se incluye en su propio
 * `closest`.
 */
export function focusablesUnderAriaHidden(root: ParentNode): HTMLElement[] {
	return focusables(root).filter((el) => el.closest('[aria-hidden="true"]') !== null);
}

/**
 * Antipatrón contrario: los `focusables()` de `root` con algún ancestro (o ellos mismos) con el
 * atributo `hidden` — el que `src/lib/theme/base.css` fuerza a `display: none !important`. Sigue
 * en el árbol de tabulación en teoría (`hidden` no es lo mismo que `aria-hidden`, y tampoco es un
 * `transform`/`visibility`, ver D2 del encargo) pero al foco no puede llegar por Tab — y si YA
 * estaba dentro cuando el ancestro se ocultó, se lleva el foco a `<body>` sin decir nada: la
 * landmine que este repo ya documentó una vez ("ocultar un elemento anula su `.focus()`"). La
 * medición sana es que salga vacío, igual que la de arriba.
 */
export function focusablesUnderHidden(root: ParentNode): HTMLElement[] {
	return focusables(root).filter((el) => el.closest('[hidden]') !== null);
}

/**
 * `true` si el foco se perdió: `active` es `null` (nada tiene el foco), es el propio
 * `document.body` (destino por defecto del navegador cuando nada más reclama el foco tras
 * ocultar/desmontar lo que lo tenía), o ya no está conectado al documento (`isConnected`: el nodo
 * se desmontó con el foco todavía puesto, p. ej. una fila borrada). Las tres son la misma historia
 * — "el foco se cayó a la nada" — contada por tres APIs distintas del DOM; esta función junta el
 * criterio en un solo sitio para que los tests de "el foco no se pierde" de este módulo no lo
 * repitan cada uno a su manera. `root` no participa del cálculo (la comprobación de "conectado" ya
 * es relativa al documento entero, no a un subárbol): se recibe porque quien llama siempre tiene
 * el `root` de su fixture a mano y así la firma no obliga a pasar `document` a pelo en cada test.
 */
export function focusLost(root: ParentNode, active: Element | null): boolean {
	if (active === null) return true;
	if (active === document.body) return true;
	return !active.isConnected;
}
