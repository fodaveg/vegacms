/**
 * Ids DOM deterministas de un campo del formulario (Fase F5-a): un módulo puro y COMPARTIDO
 * entre `FieldRow.svelte` (que pinta la etiqueta, la ayuda y el error) y cada widget del
 * registry (`widgets/*.svelte`, que pinta el control real). D-P5.1 fija la interfaz de widget a
 * `{field, value, error, disabled, readonly, onChange}` — sin ids ni "slots" extra — así que
 * ambos lados derivan el MISMO id a partir de `field.name`, la única pieza que ya comparten, en
 * vez de pasarlo como prop fuera de esa interfaz.
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

/** Ids para el campo `name` (`ResolvedField.name`, único dentro de un `ContentType`). */
export function fieldIds(name: string): FieldIds {
	const base = `vega-field-${name}`;
	return {
		inputId: base,
		labelId: `${base}-label`,
		helpId: `${base}-help`,
		errorId: `${base}-error`
	};
}
