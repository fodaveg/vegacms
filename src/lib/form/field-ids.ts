/**
 * Ids DOM deterministas de un campo del formulario (Fase F5-a): un módulo puro y COMPARTIDO
 * entre `FieldRow.svelte` (que pinta la etiqueta, la ayuda y el error) y cada widget del
 * registry (`widgets/*.svelte`, que pinta el control real). D-P5.1 fija la interfaz de widget a
 * `{field, value, error, disabled, readonly, onChange}` — sin ids ni "slots" extra — así que
 * ambos lados derivan el MISMO id a partir de `field.name`, la única pieza que ya comparten, en
 * vez de pasarlo como prop fuera de esa interfaz.
 *
 * `scope` (hallazgo p1, lote "formularios y medios"): namespace OPCIONAL que antepone
 * `BlockEditor.svelte` (vía `field-scope.ts`, léase su cabecera) cuando el campo vive dentro de
 * una fila de bloque — varias filas del MISMO tipo comparten `field.name`, y sin `scope` producían
 * ids duplicados (HTML inválido, rompía la asociación `label[for]`). `undefined`/`null`
 * (comportamiento histórico, cualquier campo fuera de un bloque) deriva el id SOLO de `name`,
 * exactamente como antes.
 */

export interface FieldIds {
	/** Id del control interactivo real (el `<input>`/`<select>`/… que pinta el widget). */
	inputId: string;
	/** Id de la etiqueta (`FieldRow`), para `aria-labelledby` en widgets cuyo control NO es un
	 *  elemento "labelable" por HTML (p.ej. el `role="group"` de `chips`), donde `<label for>` no
	 *  asocia nativamente. */
	labelId: string;
	/** Id del párrafo de ayuda (`field.help`), para `aria-describedby`. */
	helpId: string;
	/** Id del párrafo de error, para `aria-describedby`. */
	errorId: string;
}

/** Ids para el campo `name` (`ResolvedField.name`, único dentro de un `ContentType`), namespaced
 *  por `scope` cuando lo hay (ver cabecera). */
export function fieldIds(name: string, scope?: string | null): FieldIds {
	const base = scope ? `vega-field-${scope}-${name}` : `vega-field-${name}`;
	return {
		inputId: base,
		labelId: `${base}-label`,
		helpId: `${base}-help`,
		errorId: `${base}-error`
	};
}
