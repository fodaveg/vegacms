/**
 * La vista previa del widget `markdown` pinta `[Contacto](/contacto){.btn}` como un enlace con
 * `class="btn"` (QA de fodaveg, 21 oct 2026). Mismo montaje que `Markdown.svelte`: un `Editor` de
 * solo lectura con `createMarkdownExtensions()` y `parsePreviewMarkdown` sobre su propio gestor.
 * Lo que llega al DOM es lo que ve el autor: ni `{.btn}` como texto ni otro atributo que la clase.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import type { MarkdownExtensionStorage } from '@tiptap/markdown';
import { createMarkdownExtensions, parsePreviewMarkdown } from './markdown';

let editor: Editor | null = null;

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

function renderPreview(markdown: string): HTMLElement {
	const element = document.createElement('div');
	document.body.append(element);
	editor = new Editor({ element, extensions: createMarkdownExtensions(), editable: false });
	const manager = (editor.storage.markdown as MarkdownExtensionStorage).manager;
	editor.commands.setContent(parsePreviewMarkdown(markdown, manager), { emitUpdate: false });
	return editor.view.dom;
}

describe('vista previa del widget markdown con `{.clase}` detrás de un enlace', () => {
	test('`[Contacto](/contacto){.btn .btn-solid}` es un <a class="btn btn-solid"> sin el texto de la lista', () => {
		const dom = renderPreview('Escríbeme: [Contacto](/contacto){.btn .btn-solid}');
		const link = dom.querySelector('a');
		expect(link?.getAttribute('href')).toBe('/contacto');
		expect(link?.className).toBe('btn btn-solid');
		expect(link?.textContent).toBe('Contacto');
		expect(dom.textContent).toBe('Escríbeme: Contacto');
		expect([...(link?.attributes ?? [])].map((attribute) => attribute.name).sort()).toEqual([
			'class',
			'href',
			'rel',
			'target'
		]);
	});

	test('una lista con otro atributo no toca el enlace y se lee tal cual', () => {
		const dom = renderPreview('[Contacto](/contacto){.btn onclick=alert(1)}');
		const link = dom.querySelector('a');
		expect(link?.hasAttribute('class')).toBe(false);
		expect(link?.hasAttribute('onclick')).toBe(false);
		expect(dom.textContent).toBe('Contacto{.btn onclick=alert(1)}');
	});

	test('un enlace sin lista sigue sin clase', () => {
		const link = renderPreview('[Contacto](/contacto)').querySelector('a');
		expect(link?.hasAttribute('class')).toBe(false);
	});
});
