/**
 * Slug que acompaña al título AL CREAR (capacidad `slugField`). Módulo PURO: sin Svelte, sin el
 * puerto — `RecordForm.svelte` le pregunta, en cada edición de campo, si hay que escribir el slug.
 *
 * Reglas (audit 30 sep: una entrada nueva se guardaba sin slug, sin URL y con «Ver en el sitio»
 * desactivado):
 * - SOLO en creación. Al editar un registro existente el slug NO se toca jamás: es una URL pública
 *   y re-derivarla del título rompería enlaces vivos en silencio (misma decisión que la ruta de una
 *   página, `ResolvedContentType.page`).
 * - Solo hasta que la persona toca el campo slug: `touched` lleva los campos físicos que ya editó
 *   a mano. A partir de ahí el slug es suyo, aunque lo vacíe.
 * - Respeta la localización: el título de un idioma alimenta el slug de ESE idioma
 *   (`physicalFieldFor`); un título compartido alimenta el slug compartido.
 * - Devuelve `''` si el título no da nada utilizable (`slugify`): el slug aún no era de nadie, así
 *   que seguir el título vacío es coherente (y nunca pisa un slug escrito por la persona).
 */

import type { ResolvedContentType } from '$lib/model/types';
import { slugify } from '$lib/model/slugify';
import { localeForField, physicalFieldFor } from './form-sections';
import type { FormMode } from './form-model';

/** Escritura que debe hacer el formulario: `value` en el campo físico `field`. */
interface SlugWrite {
	field: string;
	value: string;
}

/**
 * Dado que la persona acaba de poner `value` en `editedField`, devuelve el slug a escribir, o
 * `null` si no toca (no es creación, el tipo no tiene slug/título, el campo editado no es el
 * título, el valor no es texto o la persona ya tocó el slug).
 */
export function slugWriteForTitleEdit(
	type: ResolvedContentType,
	mode: FormMode,
	editedField: string,
	value: unknown,
	touched: readonly string[]
): SlugWrite | null {
	if (mode !== 'create' || type.slugField === null || type.titleField === null) return null;
	if (typeof value !== 'string') return null;
	const locale = localeForField(type, editedField) ?? '';
	if (physicalFieldFor(type, type.titleField, locale) !== editedField) return null;
	const slugName = physicalFieldFor(type, type.slugField, locale);
	if (slugName === null || slugName === editedField || touched.includes(slugName)) return null;
	return { field: slugName, value: slugify(value) };
}
