/**
 * `review-links.ts`: la parte de la revisión antes de publicar que lee ENLACES y resuelve rutas.
 * Puro (sin Svelte, sin DOM, sin puerto). El contrato general vive en `publish-review.ts`.
 *
 * **HTML sin DOM.** El texto enriquecido (`widget: richtext`) se guarda como HTML que serializa
 * TipTap. Aquí se leen sus `<a>` e `<img>` con un lector de etiquetas mínimo en vez de
 * `DOMParser`/`template`, para que la revisión corra igual en un test de Node que en el navegador
 * y no dependa de `document`. El lector acepta atributos con comillas dobles, simples o sin
 * comillas, y una `>` dentro de un valor entrecomillado (el DOM actual ya no la escapa).
 *
 * **Qué es «interno»**: lo mismo que decide el editor al insertar el enlace (`isInternalHref`,
 * `form/widgets/richtext-link.ts`): empieza por `/`, no es `//host` y no lleva `\`. Todo lo demás
 * (`https:`, `mailto:`, `tel:`, `#ancla` suelta, rutas relativas sin barra) NO se revisa.
 *
 * **Normalización de la ruta** (`normalizeSitePath`), lo que hace que `/sobre`, `/sobre/`,
 * `/sobre?x=1` y `/sobre#equipo` sean la MISMA ruta: se quita `?consulta` y `#ancla`, se quitan las
 * barras finales (salvo la raíz `/`) y se decodifica el porcentaje con `decodeURI`
 * (`/caf%C3%A9` = `/café`; `%2F` y el resto de reservados se quedan como están). NO se pliegan
 * mayúsculas: las rutas las distinguen (`redirect-plan.ts`, «las rutas distinguen mayúsculas»).
 */

import { isInternalHref } from '$lib/form/widgets/richtext-link';

// ————— Ruta —————

/** Decodifica porcentaje sin lanzar con una secuencia mal formada (`%E0%A4%A`). */
function safeDecode(value: string): string {
	try {
		return decodeURI(value);
	} catch {
		return value;
	}
}

/**
 * Ruta canónica de un `href` interno, o `null` si `href` no es una ruta del propio sitio (ver la
 * cabecera). Quita consulta y ancla, barras finales y decodifica el porcentaje.
 */
export function normalizeSitePath(href: string): string | null {
	const trimmed = href.trim();
	if (!isInternalHref(trimmed)) return null;
	const cut = trimmed.search(/[?#]/);
	let path = cut === -1 ? trimmed : trimmed.slice(0, cut);
	path = safeDecode(path).replace(/\/+$/, '');
	return path === '' ? '/' : path;
}

// ————— Resolución contra páginas y redirecciones —————

/** Una página del sitio, lo mínimo que la revisión necesita de ella. */
export interface ReviewPage {
	/** `ResolvedContentType.name` de la colección de páginas. */
	type: string;
	id: string;
	/** Una ruta de la página (con ruta por idioma, una entrada por idioma). */
	path: string;
	/** `false` si está en borrador. Un tipo sin `statusField` cuenta como publicado. */
	published: boolean;
}

/** Una redirección, lo mínimo que la revisión necesita de ella. */
export interface ReviewRedirect {
	from: string;
	to: string;
}

/** Cota de saltos al seguir una cadena de redirecciones: pasada, se trata como bucle. */
export const MAX_REDIRECT_HOPS = 10;

type LinkResolution =
	| { status: 'ok' }
	/** La ruta es de una página (directa o tras redirecciones) pero está en borrador. */
	| { status: 'draft' }
	/** Ni página ni redirección. */
	| { status: 'not-found' }
	/** Hay redirección, pero la cadena acaba en una ruta propia que no existe (`to` = esa ruta). */
	| { status: 'redirect-dead-end'; to: string }
	| { status: 'redirect-loop' };

/** Índices de rutas ya normalizadas: construirlos una vez y resolver N enlaces. */
export interface LinkTargets {
	pages: ReadonlyMap<string, ReviewPage>;
	redirects: ReadonlyMap<string, ReviewRedirect>;
}

/**
 * Indexa páginas y redirecciones por ruta normalizada. Si dos páginas comparten ruta (el índice
 * único del sembrado lo impide, pero un esquema propio puede no tenerlo) gana la PUBLICADA: basta
 * una publicada para que la ruta responda. Con dos redirecciones desde la misma `from` gana la
 * primera.
 */
export function buildLinkTargets(
	pages: readonly ReviewPage[],
	redirects: readonly ReviewRedirect[]
): LinkTargets {
	const pageIndex = new Map<string, ReviewPage>();
	for (const page of pages) {
		const key = normalizeSitePath(page.path);
		if (key === null) continue;
		const current = pageIndex.get(key);
		if (!current || (!current.published && page.published)) pageIndex.set(key, page);
	}
	const redirectIndex = new Map<string, ReviewRedirect>();
	for (const redirect of redirects) {
		const key = normalizeSitePath(redirect.from);
		if (key !== null && !redirectIndex.has(key)) redirectIndex.set(key, redirect);
	}
	return { pages: pageIndex, redirects: redirectIndex };
}

/**
 * ¿Lleva `path` (ya normalizada) a algún sitio? Una página gana a una redirección con el mismo
 * `from` (la ruta de la página es la viva, como en `planRedirect`). Una ruta que solo existe como
 * origen de una redirección NO es rota: el visitante llega. Se sigue la cadena hasta una página
 * (publicada → `ok`, borrador → `draft`), una URL externa o `to` que no es ruta propia (→ `ok`,
 * no se comprueba) o un callejón: ruta propia sin página ni redirección (`redirect-dead-end`) o
 * bucle.
 */
export function resolvePath(path: string, targets: LinkTargets): LinkResolution {
	const visited = new Set<string>();
	let current = path;
	let lastTo = path;
	for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
		const page = targets.pages.get(current);
		if (page) return page.published ? { status: 'ok' } : { status: 'draft' };
		const redirect = targets.redirects.get(current);
		if (!redirect) {
			return hop === 0 ? { status: 'not-found' } : { status: 'redirect-dead-end', to: lastTo };
		}
		if (visited.has(current)) return { status: 'redirect-loop' };
		visited.add(current);
		lastTo = redirect.to;
		const next = normalizeSitePath(redirect.to);
		if (next === null) return { status: 'ok' };
		current = next;
	}
	return { status: 'redirect-loop' };
}

// ————— Etiquetas de HTML —————

const ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&quot;': '"',
	'&#39;': "'",
	'&#x27;': "'",
	'&lt;': '<',
	'&gt;': '>'
};

function decodeEntities(value: string): string {
	return value.replace(/&(?:amp|quot|lt|gt|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** `<tag …>` con valores entrecomillados que pueden llevar `>`. */
function tagPattern(tag: string): RegExp {
	return new RegExp(`<${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Atributos de una etiqueta ya recortada: nombre en minúsculas → valor (`''` sin valor). */
function readAttributes(tag: string): Map<string, string> {
	const attributes = new Map<string, string>();
	const body = tag.replace(/^<[a-z0-9]+/i, '').replace(/\/?>$/, '');
	for (const match of body.matchAll(ATTRIBUTE)) {
		const name = match[1].toLowerCase();
		if (attributes.has(name)) continue;
		attributes.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
	}
	return attributes;
}

/** `href` de cada `<a>` de `html` que lo lleve, en orden de aparición. */
export function extractAnchorHrefs(html: string): string[] {
	const hrefs: string[] = [];
	for (const tag of html.matchAll(tagPattern('a'))) {
		const href = readAttributes(tag[0]).get('href');
		if (href !== undefined) hrefs.push(href);
	}
	return hrefs;
}

/** Una `<img>` de un HTML. `alt` es `null` si la etiqueta NO trae el atributo (`alt=""` = `''`). */
interface HtmlImage {
	src: string;
	alt: string | null;
}

/** Cada `<img>` de `html`, en orden de aparición. */
export function extractImages(html: string): HtmlImage[] {
	const images: HtmlImage[] = [];
	for (const tag of html.matchAll(tagPattern('img'))) {
		const attributes = readAttributes(tag[0]);
		images.push({ src: attributes.get('src') ?? '', alt: attributes.get('alt') ?? null });
	}
	return images;
}
