/**
 * Etiquetas por defecto en la capa de PRESENTACIÓN (lote 11, tarea 1): cuando el manifiesto no
 * da `label` a un campo ni `statusLabels` a un valor de estado, el modelo resuelto deriva la
 * humanización inglesa del nombre técnico («Title», «Status») o deja el valor crudo
 * («published»). El modelo no cambia (es un contrato, §4.8); estas funciones lo traducen con el
 * catálogo al pintar.
 *
 * Pura y sin Svelte: recibe `t` ya ligado al idioma activo, igual que `describeStatusBadge`.
 */

import { humanizeLabel } from './conventions';
import type { ResolvedField } from './types';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Etiqueta visible de un campo. Si `field.label` es exactamente la humanización por defecto de
 * su nombre (el manifiesto no la fijó) y el catálogo conoce ese nombre (`form.field.default.<name>`),
 * se usa la traducción; en cualquier otro caso, la etiqueta resuelta tal cual.
 */
export function fieldDisplayLabel(
	field: Pick<ResolvedField, 'name' | 'label'>,
	t: Translate
): string {
	if (field.label !== humanizeLabel(field.name)) return field.label;
	const key = `form.field.default.${field.name}`;
	const translated = t(key);
	return translated === key ? field.label : translated;
}

/**
 * Un rótulo del manifiesto DENTRO de una frase («Todavía no hay {label}.»). El manifiesto lo
 * escribe para ir solo, como título («Secciones de página»), y a mitad de frase esa mayúscula
 * inicial es una errata (QA de fodaveg, 21 oct 2026). Se baja la PRIMERA letra y nada más: el resto
 * del rótulo se respeta tal cual. Una sigla se deja como está (las dos primeras letras en
 * mayúscula: «FAQ», «PDFs»), igual que un rótulo de una sola letra.
 */
export function labelInSentence(label: string, locale: string): string {
	const [first, second] = Array.from(label);
	if (first === undefined || second === undefined) return label;
	const isUpper = (ch: string) =>
		ch !== ch.toLocaleLowerCase(locale) && ch === ch.toLocaleUpperCase(locale);
	if (!isUpper(first) || isUpper(second)) return label;
	return first.toLocaleLowerCase(locale) + label.slice(first.length);
}

/**
 * Etiqueta visible de un valor del campo de estado: la del manifiesto (`statusLabels`), si no la
 * del catálogo para los valores convencionales (`status.value.<raw>`: `draft`, `published`) y,
 * por último, el valor crudo.
 */
export function statusValueLabel(
	statusLabels: Record<string, string> | null | undefined,
	raw: string,
	t: Translate
): string {
	const fromManifest = statusLabels?.[raw];
	if (fromManifest !== undefined) return fromManifest;
	const key = `status.value.${raw}`;
	const translated = t(key);
	return translated === key ? raw : translated;
}
