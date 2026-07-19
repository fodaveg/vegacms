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

/** `true` si `el` es nativamente focusable (o lleva `tabindex` explícito) Y no está deshabilitado. */
function isFocusable(el: Element): boolean {
	if (isDisabled(el)) return false;
	return FOCUSABLE_TAGS.has(el.tagName) || el.hasAttribute('tabindex');
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
 */
export function resolveFocusTarget(root: ParentNode, name: string): HTMLElement | null {
	const direct = root.querySelector<HTMLElement>(`#${escapeForSelector(fieldIds(name).inputId)}`);
	if (direct && isFocusable(direct)) return direct;

	const row = root.querySelector(`.vega-field-row[data-field="${escapeForSelector(name)}"]`);
	if (!row) return null;

	const candidates = row.querySelectorAll<HTMLElement>(
		'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
	);
	for (const candidate of candidates) {
		if (isFocusable(candidate)) return candidate;
	}
	return null;
}
