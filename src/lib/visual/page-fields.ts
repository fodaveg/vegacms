/**
 * Qué campos del REGISTRO de la página toca el editor visual (spec del 22 oct 2026, parte A), en
 * un solo sitio: la ficha «Campos de la página» (`VisualPageFields.svelte`, que es `BlockEditor`
 * sobre el registro) y lo que la pantalla anuncia al sitio en `editable` antes de haber cargado
 * esa ficha.
 *
 * `pageInlineFields` aplica las reglas de `BlockEditor#inlineTarget` en su modo homogéneo
 * (`inline-fields.ts`): `editable` nunca ofrece un campo que la ficha luego negaría. Lo comprueba
 * `inline-targets.svelte.test.ts` contra la propia ficha.
 */
import type { ResolvedContentType } from '$lib/model/types';
import { isTextWidget } from './texts-mode';
import { inlineFieldsOf } from './inline-fields';

/** Fuera de la ficha: la ruta (también la bilingüe) y el slug, que tienen su camino propio en el
 *  formulario (redirecciones, «Proponer ruta»), y el estado y «Publicar el», que escribe
 *  `VisualPublishControl`. */
export function pageStructuralFields(type: ResolvedContentType): string[] {
	return [
		type.page?.pathField,
		...Object.values(type.page?.localizedPath?.fields ?? {}),
		type.slugField,
		type.statusField,
		type.publishAtField
	].filter((field): field is string => typeof field === 'string');
}

function shownFields(type: ResolvedContentType) {
	const structural = pageStructuralFields(type);
	return type.fields.filter((field) => !field.hidden && !structural.includes(field.name));
}

/** Campos del registro que se pueden escribir en la página (`editable.record`): la ficha es
 *  `BlockEditor` en modo homogéneo, así que son sus reglas (`inline-fields.ts`). */
export function pageInlineFields(type: ResolvedContentType): string[] {
	return inlineFieldsOf(type, null, pageStructuralFields(type), false).text;
}

/** Campos que la ficha pinta («solo textos»): los únicos que su borrador lleva al token de vista
 *  previa, para no pisar con un valor viejo lo que guarda otro (estado, «Publicar el»…). */
export function pageTextFields(type: ResolvedContentType): string[] {
	return shownFields(type)
		.filter((field) => isTextWidget(field.widget))
		.map((field) => field.name);
}
