/**
 * Resolución DOM del foco de a11y de cierre (Fase F5-g, L-P5.2): "qué elemento enfocar para el
 * campo `name`", dado el árbol ya pintado con sus errores. Vive separado de `RecordForm.svelte`
 * (que solo orquesta: `tick()` de Svelte, `firstErrorFieldName` para el NOMBRE del campo,
 * `scrollIntoView`) para que esta parte — incluida la landmine de campos deshabilitados por
 * `maxSelect`, ver `resolveFocusTarget` — tenga test real (jsdom), no solo e2e (donde ya se
 * cazó el bug del `🟡 1` de code-review: el fallback podía devolver un elemento `disabled`).
 *
 * `fieldIds(name).inputId` es el id que ya pintan `FieldRow`/los widgets (`field-ids.ts`): para
 * los widgets input/select/textarea/`file` ES el control real, nativamente focusable. Para los
 * de tipo GRUPO (`chips`/`relation`, `role="group"` sobre un `<div>`) NO lo es — hace falta el
 * fallback al primer elemento focusable dentro de la fila del campo (`FieldRow.svelte` marca
 * `data-field={name}`).
 *
 * `isDisabled`/`isFocusable` se EXPORTAN (encargo de accesibilidad del editor visual,
 * `src/lib/visual/a11y-audit.ts`) para que ese módulo no duplique el criterio de "qué es
 * enfocable de verdad" — un segundo criterio ligeramente distinto en dos ficheros es la forma
 * silenciosa de que un día dejen de estar de acuerdo. `a11y-audit.ts` los reusa TAL CUAL, sin
 * envolverlos en nada propio.
 */

import { fieldIds } from './field-ids';

/** Etiquetas nativamente focusables (sin contar `disabled`, que se comprueba aparte). */
const FOCUSABLE_TAGS: ReadonlySet<string> = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A']);

/**
 * Fix de code-review (`🟡 1`, F5-g): `true` si `el` está deshabilitado. Un campo `chips`/
 * `relation`/`file` con `maxSelect` alcanzado deshabilita las opciones NO seleccionadas en el
 * orden de `options`/candidatos, no en el de selección — el PRIMER elemento en el DOM de la fila
 * bien puede ser una opción deshabilitada aunque exista otra habilitada más adelante. Sin este
 * filtro, `resolveFocusTarget` la elegía igual (`target.focus()` es un no-op sobre un elemento
 * `disabled`: el foco simplemente no se movía, rompiendo la garantía "el foco SIEMPRE aterriza en
 * el primer campo con error"). `'disabled' in el` cubre solo los elementos con esa propiedad IDL
 * (`input`/`select`/`textarea`/`button`); un `<a>`/`[tabindex]` sin ella nunca cuenta como
 * deshabilitado por esta vía (HTML no los deshabilita así).
 */
function isDisabled(el: Element): boolean {
	return 'disabled' in el && (el as unknown as { disabled: boolean }).disabled === true;
}

/** `true` si `el` es nativamente focusable (o lleva `tabindex` explícito, o es editable como el
 *  cuerpo de TipTap en `Richtext.svelte`) Y no está deshabilitado. */
export function isFocusable(el: Element): boolean {
	if (isDisabled(el)) return false;
	return (
		FOCUSABLE_TAGS.has(el.tagName) ||
		el.hasAttribute('tabindex') ||
		el.getAttribute('contenteditable') === 'true'
	);
}

/**
 * Escapa `value` para usarlo en un selector CSS (id sin comillas, o valor de atributo entre
 * comillas dobles): usa el `CSS.escape` NATIVO cuando existe (cualquier navegador real, incluida
 * la suite e2e); jsdom (entorno de `focus-target.dom.test.ts`) no lo implementa — el fallback de
 * abajo no pretende ser un polyfill completo de la spec CSSOM, solo cubre los nombres de campo de
 * Vega (identificadores de manifiesto, sin espacios/comillas) para que el mismo código sea
 * testeable sin navegador real.
 */
function escapeForSelector(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
	return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Elemento a enfocar para el campo `name`, buscando dentro de `root` (el `document`, o un
 * contenedor equivalente en test) ya pintado por `RecordForm`/`FieldRow`: intenta el `inputId`
 * derivado de `field-ids.ts` directamente si es focusable y está HABILITADO; si no, cae al
 * primer elemento focusable Y habilitado dentro de la fila del campo, en el ORDEN del DOM.
 * `null` si no hay fila para `name`, o si ninguno de sus candidatos es focusable+habilitado (no
 * debería darse en la práctica: D-P5.1 no permite que un campo con error esté enteramente inerte,
 * ver cabecera).
 *
 * `scope` (lote 13, «ir al campo» de un aviso de la revisión): el ámbito de ids de un bloque
 * (`field-scope.ts`, el id del registro del bloque). Con él, los ids son los de ESA fila de
 * `BlockEditor` y la fila del campo se localiza por su etiqueta (`labelId`, única en el documento)
 * en vez de por `data-field`, que varias filas de bloque del mismo tipo comparten. Sin `scope`,
 * el comportamiento histórico, byte a byte.
 */
export function resolveFocusTarget(
	root: ParentNode,
	name: string,
	scope: string | null = null
): HTMLElement | null {
	const ids = fieldIds(name, scope);
	const direct = root.querySelector<HTMLElement>(`#${escapeForSelector(ids.inputId)}`);
	if (direct) {
		if (isFocusable(direct)) return direct;
		// El `inputId` es un contenedor (el `role="group"` de `chips`/`relation`, o la caja donde
		// TipTap monta su `contenteditable` en `Richtext.svelte`): primero lo que hay DENTRO de él.
		// La fila entera va después, a propósito: la barra de herramientas del texto enriquecido va
		// ANTES del editor en el DOM y, mirando la fila de entrada, el foco caía en «Negrita».
		const inner = firstFocusableIn(direct);
		if (inner) return inner;
	}

	const row = scope
		? root.querySelector(`#${escapeForSelector(ids.labelId)}`)?.closest('.vega-field-row')
		: root.querySelector(`.vega-field-row[data-field="${escapeForSelector(name)}"]`);
	return row ? firstFocusableIn(row) : null;
}

/** Primer elemento focusable Y habilitado dentro de `root`, en el ORDEN del DOM. */
function firstFocusableIn(root: ParentNode): HTMLElement | null {
	const candidates = root.querySelectorAll<HTMLElement>(
		'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
	);
	for (const candidate of candidates) {
		if (isFocusable(candidate)) return candidate;
	}
	return null;
}
