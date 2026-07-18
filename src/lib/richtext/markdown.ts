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
