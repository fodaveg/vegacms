/**
 * Utilidades de la RUTA pública de una página (`ResolvedPageConfig.pathField`, modelo de páginas
 * — tarea p1 `1dc63001`; encargo "crear y editar páginas"). Dos funciones puras que la UI
 * consume desde `RecordForm.svelte`/`validation.ts`, ninguna decide UNICIDAD (eso lo impone el
 * índice real de PocketBase; Vega solo lo COMPRUEBA, ver `page-path-not-unique` en
 * `warnings.ts`) — esto es solo FORMA.
 *
 * **La ruta NUNCA se deriva sola después de crear** (decisión de diseño escrita en la cabecera de
 * `ResolvedContentType.page`, `types.ts`, §"La ruta NUNCA se deriva de slugField"): `suggestPagePath`
 * es una función PURA que calcula una propuesta, no un efecto que mantenga nada sincronizado — el
 * llamador (el botón "Proponer ruta" de `RecordForm.svelte`, SOLO en creación) decide cuándo
 * pedirla, y el resultado queda editable como cualquier otro valor de campo.
 */

import { slugify } from './slugify';

/**
 * Propone una ruta a partir de un texto libre (el slug o el título actuales): `/` + `slugify(text)`.
 * `''` si `slugify` no da nada utilizable (mismo criterio que el propio `slugify` — título vacío,
 * o en un alfabeto que no romaniza) — el llamador no escribe nada en ese caso, igual que
 * "Regenerar" nunca pisa un slug bueno con una cadena vacía.
 */
export function suggestPagePath(text: string): string {
	const slug = slugify(text);
	return slug === '' ? '' : `/${slug}`;
}

/**
 * Código LOCAL (no viene de PB) del error de FORMATO de una ruta pública, ver `form.errorCode.
 * vega_page_path_invalid` en `$lib/i18n`. Vive aquí (no en `$lib/backend/errors`) porque es una
 * regla PROPIA del modelo de páginas, no del backend ni del puerto genérico — mismo criterio de
 * ubicación que el resto de este módulo.
 */
export const PAGE_PATH_INVALID_CODE = 'vega_page_path_invalid';

/**
 * Formato de una ruta pública (§2 del encargo "crear y editar páginas"): empieza por `/`, sin
 * ningún espacio, sin barra final salvo cuando la ruta ENTERA es la raíz (`/`). Una ruta VACÍA se
 * considera válida de FORMA — si el campo es `required` o no lo decide `schema.required`/
 * `validateForm`, esta función solo mira la FORMA de lo que ya se ha escrito.
 */
export function isValidPagePath(path: string): boolean {
	if (path === '') return true;
	if (!path.startsWith('/')) return false;
	if (/\s/.test(path)) return false;
	if (path !== '/' && path.endsWith('/')) return false;
	return true;
}
