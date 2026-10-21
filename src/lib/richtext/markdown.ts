/**
 * `markdown.ts` (F5-d del contrato P5, D-P5.7/D-P5.8): añade la extensión `Markdown` (paquete
 * `@tiptap/markdown`) a las extensiones compartidas de `editor.ts`, y expone `parseMarkdown`/
 * `serializeMarkdown` — wrappers PUROS (sin Svelte, sin DOM) sobre `MarkdownManager`, para poder
 * testear el round-trip MD↔TipTap como REGRESIÓN (`markdown.test.ts`) sin levantar un `Editor`
 * real ni jsdom: `MarkdownManager` opera sobre JSON de ProseMirror en memoria, nunca toca
 * `window`/`document`.
 *
 * El widget `Markdown.svelte` NO usa estas dos funciones directamente en producción: crea su
 * propio `Editor` (con `createMarkdownExtensions()`, para no divergir) y llama a
 * `editor.getMarkdown()`/`contentType:'markdown'` — el mismo `MarkdownManager`, pero el que monta
 * TipTap internamente para ESE editor. Aquí se exponen aparte solo para la suite de regresión.
 *
 * **Limitaciones conocidas del widget `markdown` (D-P5.8, spike ya resuelto)**: dos casos NO son
 * byte-exactos en el round-trip — HTML embebido con atributos (fuera de alcance: eso es
 * `richtext`, no `markdown`) y tablas (excluidas explícitamente de v1 por el contrato, §2.2 de
 * backend no las modela). Los 23 casos comunes del contrato (encabezados h1-h4, negrita/cursiva/
 * tachado, código inline, bloques de código con lenguaje, cita, listas anidadas, enlaces con
 * título, imágenes, párrafos, escapes `\*`/`\_`, `hr`, saltos múltiples) SÍ son byte-exactos —
 * `markdown.test.ts` los fija como regresión.
 */
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import type { JSONContent } from '@tiptap/core';
import { createExtensions } from './editor';
import { findUnsafeMarkdown } from '$lib/form/widgets/markdown-commands';

/** Extensiones del widget `markdown` (D-P5.7 + D-P5.8): las base de `editor.ts` más `Markdown`,
 *  la extensión que le da a TipTap el vocabulario de parseo/serialización MD↔JSON. */
export function createMarkdownExtensions() {
	return [...createExtensions(), Markdown];
}

// Instancia módulo-nivel (perezosa): construir un `MarkdownManager` recorre las extensiones para
// registrar sus reglas de parseo/render — no vale la pena repetirlo en cada llamada de un mismo
// proceso (test o SSR-nunca-pero-por-si-acaso), y no depende de ningún estado mutable externo.
let sharedManager: MarkdownManager | null = null;
function getManager(): MarkdownManager {
	if (!sharedManager)
		sharedManager = new MarkdownManager({ extensions: createMarkdownExtensions() });
	return sharedManager;
}

/** Markdown crudo → documento TipTap (JSON de ProseMirror). */
export function parseMarkdown(markdown: string): JSONContent {
	return getManager().parse(markdown);
}

/** Documento TipTap (JSON de ProseMirror) → Markdown serializado. */
export function serializeMarkdown(content: JSONContent): string {
	return getManager().serialize(content);
}

/** Lista de clases detrás de un enlace, al principio del texto que lo sigue: `{.btn}` o
 *  `{.btn .btn-solid}`. Solo clases con nombre de identificador CSS sencillo; `{#id}`,
 *  `{target=_blank}` o una mezcla no casan y se quedan como texto. */
const LINK_CLASS_LIST = /^\{[ \t]*(\.[A-Za-z][\w-]*(?:[ \t]+\.[A-Za-z][\w-]*)*)[ \t]*\}/;

type Mark = NonNullable<JSONContent['marks']>[number];

function linkMarkOf(node: JSONContent | undefined): Mark | undefined {
	if (node?.type !== 'text') return undefined;
	return node.marks?.find((mark) => mark.type === 'link');
}

function sameLink(a: Mark | undefined, b: Mark): boolean {
	return a !== undefined && a.attrs?.href === b.attrs?.href && a.attrs?.title === b.attrs?.title;
}

/** Aplica, SOLO para la vista previa, la sintaxis de atributos de enlace que algunos sitios dan a
 *  su Markdown (kramdown, `markdown-it-attrs`): `[Contacto](/contacto){.btn}` pinta un enlace con
 *  `class="btn"` en lugar de enseñar `{.btn}` como texto (QA de fodaveg, 21 oct 2026).
 *
 *  Transforma el documento ya parseado (JSON de ProseMirror), no el lexer: `@tiptap/markdown`
 *  registra sus tokenizadores propios en la instancia GLOBAL de `marked`, la misma que usa la regla
 *  de guardado (`findUnsafeMarkdownFragment`), y la vista previa no debe cambiar qué se acepta.
 *  Lo que se guarda sigue siendo el texto escrito, byte a byte: el widget no reserializa nunca.
 *
 *  Las clases pasan por `LINK_CLASS_LIST` (identificadores sencillos) y llegan al DOM como el
 *  atributo `class` de la marca `link`, que ProseMirror escribe con `setAttribute`: no hay ningún
 *  camino para otro atributo ni para HTML. Pura y sin DOM; devuelve un documento nuevo. */
export function applyLinkClassLists(doc: JSONContent): JSONContent {
	if (!doc.content) return doc;
	const content: JSONContent[] = [];
	for (const original of doc.content) {
		let node = applyLinkClassLists(original);
		const previousLink = linkMarkOf(content.at(-1));
		const match =
			previousLink && node.type === 'text' && !linkMarkOf(node)
				? LINK_CLASS_LIST.exec(node.text ?? '')
				: null;
		if (previousLink && match) {
			const className = match[1]
				.split(/[ \t]+/)
				.map((name) => name.slice(1))
				.join(' ');
			// Todo el texto del enlace, aunque lo partan otras marcas (`[**Con**tacto](/c){.btn}`).
			for (
				let i = content.length - 1;
				i >= 0 && sameLink(linkMarkOf(content[i]), previousLink);
				i--
			) {
				const marks = content[i].marks ?? [];
				content[i] = {
					...content[i],
					marks: marks.map((mark) =>
						mark.type === 'link' ? { ...mark, attrs: { ...mark.attrs, class: className } } : mark
					)
				};
			}
			const rest = (node.text ?? '').slice(match[0].length);
			if (rest === '') continue;
			node = { ...node, text: rest };
		}
		content.push(node);
	}
	return { ...doc, content };
}

/** Markdown crudo → documento de la VISTA PREVIA: `parse` del gestor del editor de vista previa y
 *  después `applyLinkClassLists`. */
export function parsePreviewMarkdown(markdown: string, manager: MarkdownManager): JSONContent {
	return applyLinkClassLists(manager.parse(markdown));
}

/** Primer fragmento de HTML o destino peligroso de `markdown`, o `null` si es seguro. El MISMO
 *  lexer que monta el widget (mismas extensiones), sin `Editor` ni DOM: lo usan los caminos de
 *  guardado (`form/markdown-safety.ts`), que lo cargan perezosamente como el propio widget. */
export function findUnsafeMarkdownFragment(markdown: string): string | null {
	return findUnsafeMarkdown(markdown, getManager());
}
