/**
 * `richtext-link.ts` (tarea «insertar imagen desde la biblioteca y enlace a una página del sitio»):
 * todo lo que la barra del texto enriquecido decide sobre un ENLACE sin Svelte ni TipTap, con test.
 * `RichtextLinkDialog.svelte` pinta y orquesta; `EditorToolbar.svelte` ejecuta los comandos.
 *
 * **Qué se guarda** (decisión de David): el enlace a una página guarda su RUTA, un `href` normal
 * (`/sobre-mi`), nunca el id del registro. Si la ruta de la página cambia después, el enlace no se
 * actualiza solo: para eso está la oferta de redirección al guardar (`redirect-plan.ts`).
 *
 * **Qué se admite** (`validateLinkHref`): `http`, `https`, `mailto`, `tel`, o una ruta que empiece
 * por `/`. Es más estricto que `safe-uri.ts` (que deja pasar cualquier cosa sin esquema) porque
 * aquí hay una persona escribiendo y se le puede decir qué corregir; `safe-uri.ts` degrada en
 * silencio un valor que ya viene escrito.
 *
 * **Pestaña nueva** (`stripNewTabFromInternalLinks`): la extensión `Link` (`$lib/richtext/editor`)
 * está configurada con `HTMLAttributes: { rel, target: '_blank' }`, y su `renderHTML` las mezcla
 * SIEMPRE, también cuando el enlace se creó con `target: null`. O sea: desde el editor no hay forma
 * de serializar un `<a>` sin `target="_blank"`. Una ruta del propio sitio no debe abrir pestaña
 * nueva, así que el widget quita `target` y `rel` de los enlaces internos en el HTML que emite.
 */

import type { Page, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import {
	buildTitleSearchQuery,
	RELATION_SEARCH_PER_PAGE,
	supportsTitleSearch
} from './relation-search';

// ————— Validación del destino —————

/** Por qué se rechaza un destino. Cada motivo tiene su texto en `form.editor.linkDialog.error.*`. */
export type LinkHrefError = 'empty' | 'scheme' | 'format';

type LinkHrefResult =
	{ ok: true; href: string; internal: boolean } | { ok: false; reason: LinkHrefError };

/** Esquemas que puede llevar un enlace escrito a mano. */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** `true` si `value` contiene un espacio en blanco o un carácter de control (0x00-0x1F, 0x7F):
 *  un navegador los tolera DENTRO de un esquema (`java\tscript:`), así que un destino que los
 *  lleve no se intenta limpiar, se rechaza. */
function hasWhitespaceOrControl(value: string): boolean {
	for (const ch of value) {
		const code = ch.codePointAt(0) ?? 0;
		if (code <= 0x20 || code === 0x7f || /\s/.test(ch)) return true;
	}
	return false;
}

/**
 * `true` si `href` es una ruta del propio sitio: empieza por `/` y no es protocolo-relativa
 * (`//host`, que es otra web) ni lleva una barra invertida (`/\host`: los navegadores la leen como
 * `//host`).
 */
export function isInternalHref(href: string): boolean {
	return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}

/**
 * Valida lo que alguien escribe como destino de un enlace. Devuelve el `href` ya recortado y si es
 * interno, o el motivo del rechazo:
 * - `empty`: nada escrito.
 * - `scheme`: lleva un esquema que no es `http`, `https`, `mailto` ni `tel` (`javascript:`,
 *   `data:`, `ftp:`…).
 * - `format`: no tiene esquema ni empieza por `/` (`ejemplo.com`), es protocolo-relativa, lleva
 *   espacios, o le falta el destino (`https://`, `mailto:`).
 */
export function validateLinkHref(raw: string): LinkHrefResult {
	const trimmed = raw.trim();
	if (trimmed === '') return { ok: false, reason: 'empty' };
	if (hasWhitespaceOrControl(trimmed)) return { ok: false, reason: 'format' };

	if (trimmed.startsWith('/')) {
		return isInternalHref(trimmed)
			? { ok: true, href: trimmed, internal: true }
			: { ok: false, reason: 'format' };
	}

	const schemeMatch = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(trimmed);
	if (!schemeMatch) return { ok: false, reason: 'format' };

	const scheme = schemeMatch[1].toLowerCase();
	const rest = schemeMatch[2];
	if (!ALLOWED_SCHEMES.has(scheme)) return { ok: false, reason: 'scheme' };

	if (scheme === 'http' || scheme === 'https') {
		// `https:ejemplo.com` o `https://` a secas: el navegador los resuelve a cosas que nadie
		// quiso escribir. Se exige `//` y un nombre de máquina.
		if (!/^\/\/[^/?#\\]+/.test(rest)) return { ok: false, reason: 'format' };
	} else if (rest === '') {
		return { ok: false, reason: 'format' };
	}
	return { ok: true, href: trimmed, internal: false };
}

// ————— HTML emitido —————

/**
 * Quita `target` y `rel` de los `<a>` cuyo `href` es una ruta del sitio (ver cabecera). El resto
 * del HTML no se toca: si no hay ningún enlace interno, devuelve la MISMA cadena, sin pasar por el
 * DOM, para no alterar ni un byte de lo que el editor serializa.
 */
export function stripNewTabFromInternalLinks(html: string): string {
	if (!html.includes('href="/')) return html;
	const template = document.createElement('template');
	template.innerHTML = html;
	let changed = false;
	for (const anchor of template.content.querySelectorAll('a[href]')) {
		if (!isInternalHref(anchor.getAttribute('href') ?? '')) continue;
		if (!anchor.hasAttribute('target') && !anchor.hasAttribute('rel')) continue;
		anchor.removeAttribute('target');
		anchor.removeAttribute('rel');
		changed = true;
	}
	return changed ? template.innerHTML : html;
}

// ————— Páginas del sitio —————

/** Una página que se puede enlazar: lo que pinta la lista del diálogo. */
export interface PageLinkCandidate {
	/** `ResolvedContentType.name` + id: clave estable de la fila. */
	key: string;
	typeLabel: string;
	title: string;
	/** La ruta pública, o `''` si la página todavía no tiene: se pinta, pero no se puede elegir. */
	path: string;
}

/**
 * Columna física que guarda la ruta de las páginas de `type`, o `null` si el tipo no es de
 * páginas. Con ruta por idioma (`page.localizedPath`) es la del idioma por defecto: el enlace
 * guarda UNA ruta, y la del idioma por defecto es la que existe siempre.
 */
export function pagePathColumn(type: ResolvedContentType): string | null {
	const page = type.page;
	if (!page) return null;
	if (page.localizedPath) {
		return page.localizedPath.fields[page.localizedPath.defaultLocale] ?? null;
	}
	return page.pathField;
}

/** Los tipos del modelo cuyos registros tienen ruta (`collections.<c>.page` en el manifiesto). */
export function pageTypesWithPath(model: Pick<ContentModel, 'types'>): ResolvedContentType[] {
	return model.types.filter((type) => pagePathColumn(type) !== null);
}

/**
 * Consulta de páginas de `type` para `term`. Un término que empieza por `/` busca en la RUTA;
 * cualquier otro, en el título (si el tipo admite buscar por título; si no, se trae la primera
 * página sin filtrar). En blanco: la primera página tal cual.
 */
export function buildPageSearchQuery(type: ResolvedContentType, term: string): Query {
	const trimmed = term.trim();
	const pathColumn = pagePathColumn(type);
	if (trimmed.startsWith('/') && pathColumn !== null) {
		return {
			filter: { kind: 'cond', field: pathColumn, op: 'contains', value: trimmed },
			perPage: RELATION_SEARCH_PER_PAGE
		};
	}
	if (type.titleField !== null && supportsTitleSearch(type)) {
		return buildTitleSearchQuery(type.titleField, trimmed);
	}
	return { perPage: RELATION_SEARCH_PER_PAGE };
}

/** Mapea una página de resultados de `type` a candidatos. Sin título, se enseña la ruta. */
export function pageCandidatesFromPage(
	type: ResolvedContentType,
	page: Page<VegaRecord>
): PageLinkCandidate[] {
	const pathColumn = pagePathColumn(type);
	return page.items.map((record) => {
		const rawPath = pathColumn !== null ? record.values[pathColumn] : null;
		const path = typeof rawPath === 'string' ? rawPath.trim() : '';
		const rawTitle = type.titleField !== null ? record.values[type.titleField] : null;
		const title = typeof rawTitle === 'string' && rawTitle.trim() !== '' ? rawTitle : path;
		return {
			key: `${type.name}:${record.id}`,
			typeLabel: type.labelSingular,
			title: title !== '' ? title : record.id,
			path
		};
	});
}
