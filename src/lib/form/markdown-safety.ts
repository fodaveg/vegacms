/**
 * Regla de guardado de los campos `markdown` (QA de fodaveg, 21 oct 2026): la MISMA en el
 * formulario, en el editor visual y en «Solo textos».
 *
 * **La regla.** Un campo `markdown` no se guarda si el autor lo ha CAMBIADO y su texto contiene
 * HTML o un destino de enlace/imagen no permitido (`findUnsafeMarkdown`, el mismo lexer que la
 * vista previa del widget). Es una garantía de Vega, no una opción del sitio: el manifiesto no
 * tiene ninguna clave para permitirlo (`docs/CONFIG.md`, «Campos `markdown`»). Un texto heredado
 * que ya trae HTML se enseña y se puede dejar como está: guardar OTROS campos del mismo registro
 * no lo reescribe (`toRecordInput` solo envía lo sucio), así que tampoco se bloquea por él.
 *
 * **Por qué no es validación nativa.** Hasta 0.14.0 el widget marcaba su `<textarea>` con
 * `setCustomValidity`: el `<form>` del formulario clásico se negaba a enviarse y, si el campo
 * estaba plegado u oculto (un bloque cerrado, otra pestaña de idioma), el navegador no podía
 * enseñar su globo y el guardado se quedaba en «Cambios sin guardar» sin una palabra; el editor
 * visual, que guarda con un botón y no con un `<form>`, lo guardaba igual. Aquí es una regla
 * sobre el VALOR, que cada camino de guardado consulta antes de escribir y que produce un error
 * de campo como cualquier otro (se pinta, se enfoca y se resume).
 *
 * El lexer vive en el trozo perezoso del editor Markdown (`$lib/richtext/markdown`): solo se
 * carga si hay de verdad un campo `markdown` cambiado que mirar, así que no pesa en el resto de
 * formularios.
 */

import type { WidgetId } from '$lib/model/types';
import type { FormValues } from './form-model';
import { dirtyFields, type FormInputValues } from './dirty';
import type { TranslatedError } from './field-errors';

/** Código LOCAL del error (no de PocketBase). `known: false`: el mensaje ya va traducido y con el
 *  fragmento, `fieldErrorMessage` lo pinta tal cual. */
export const MARKDOWN_UNSAFE_CODE = 'vega_markdown_unsafe';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Lo mínimo de un campo que la regla necesita: nombre y widget. */
export interface MarkdownSafetyField {
	name: string;
	widget: WidgetId;
}

/** Campos `markdown` cambiados con texto: los únicos que la regla tiene que mirar. */
export function changedMarkdownFields(
	fields: readonly MarkdownSafetyField[],
	baseline: FormValues,
	current: FormInputValues
): string[] {
	const dirty = dirtyFields(baseline, current);
	return fields
		.filter((field) => field.widget === 'markdown' && dirty.has(field.name))
		.filter((field) => {
			const value = current[field.name];
			return typeof value === 'string' && value.trim() !== '';
		})
		.map((field) => field.name);
}

/** Errores por campo de la regla, por nombre de campo. */
export type MarkdownSafetyErrors = Record<string, TranslatedError>;

/**
 * Errores por campo de la regla (ver cabecera): vacío si no hay nada que rechazar.
 *
 * Sin campos `markdown` cambiados responde `{}` EN EL ACTO, sin promesa: un guardado que no toca
 * Markdown arranca en el mismo turno del clic, como antes de esta regla (el botón pasa a
 * «Guardando» y la escritura sale sin esperar a nada). Solo hay espera, la del lexer perezoso,
 * cuando de verdad hay un campo `markdown` cambiado que mirar; quien guarda espera únicamente
 * si recibe una promesa.
 */
export function markdownSafetyErrors(
	fields: readonly MarkdownSafetyField[],
	baseline: FormValues,
	current: FormInputValues,
	t: Translate
): MarkdownSafetyErrors | Promise<MarkdownSafetyErrors> {
	const names = changedMarkdownFields(fields, baseline, current);
	if (names.length === 0) return {};
	return unsafeMarkdownErrors(names, current, t);
}

async function unsafeMarkdownErrors(
	names: readonly string[],
	current: FormInputValues,
	t: Translate
): Promise<MarkdownSafetyErrors> {
	const { findUnsafeMarkdownFragment } = await import('$lib/richtext/markdown');
	const errors: Record<string, TranslatedError> = {};
	for (const name of names) {
		const fragment = findUnsafeMarkdownFragment(current[name] as string);
		if (fragment === null) continue;
		errors[name] = {
			code: MARKDOWN_UNSAFE_CODE,
			message: t('form.markdown.unsafeSave', { fragment }),
			known: false
		};
	}
	return errors;
}
