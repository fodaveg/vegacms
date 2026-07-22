import { describe, expect, test } from 'vitest';
import { MarkdownManager } from '@tiptap/markdown';
import { createMarkdownExtensions } from '$lib/richtext/markdown';
import {
	applyMarkdownCommand,
	countMarkdownWords,
	hasUnsafeMarkdownContent
} from './markdown-commands';

describe('applyMarkdownCommand', () => {
	test('envuelve la selección y conserva seleccionado solo el texto interior', () => {
		expect(applyMarkdownCommand('hola mundo', 5, 10, 'bold')).toEqual({
			value: 'hola **mundo**',
			selectionStart: 7,
			selectionEnd: 12
		});
	});

	test('inserta un placeholder seleccionable cuando no hay selección', () => {
		expect(
			applyMarkdownCommand('', 0, 0, 'italic', {
				text: 'texto',
				code: 'código',
				url: 'https://',
				alt: 'descripción'
			})
		).toEqual({ value: '*texto*', selectionStart: 1, selectionEnd: 6 });
	});

	test('aplica y retira prefijos sobre todas las líneas seleccionadas', () => {
		const quoted = applyMarkdownCommand('uno\ndos', 0, 7, 'blockquote');
		expect(quoted.value).toBe('> uno\n> dos');
		expect(applyMarkdownCommand(quoted.value, 0, quoted.value.length, 'blockquote').value).toBe(
			'uno\ndos'
		);
	});

	test('deja el cursor tras el prefijo cuando no hay selección', () => {
		expect(applyMarkdownCommand('', 0, 0, 'heading1')).toEqual({
			value: '# ',
			selectionStart: 2,
			selectionEnd: 2
		});
		expect(applyMarkdownCommand('', 0, 0, 'blockquote').selectionStart).toBe(2);
		expect(applyMarkdownCommand('', 0, 0, 'bulletList').selectionStart).toBe(2);
		expect(applyMarkdownCommand('', 0, 0, 'orderedList').selectionStart).toBe(3);
	});

	test('una selección que termina en salto no transforma la línea siguiente', () => {
		expect(applyMarkdownCommand('uno\ndos', 0, 4, 'blockquote').value).toBe('> uno\ndos');
	});

	test('normaliza y numera una lista ordenada desde uno', () => {
		expect(applyMarkdownCommand('- uno\n- dos', 0, 11, 'orderedList').value).toBe('1. uno\n2. dos');
		expect(applyMarkdownCommand('9. uno\n4. dos', 0, 13, 'orderedList').value).toBe('uno\ndos');
	});

	test('los comandos de enlace e imagen seleccionan la URL para sustituirla', () => {
		const labels = { text: 'texto', code: 'código', url: 'https://', alt: 'alternativa' };
		expect(applyMarkdownCommand('Vega', 0, 4, 'link', labels)).toEqual({
			value: '[Vega](https://)',
			selectionStart: 7,
			selectionEnd: 15
		});
		expect(applyMarkdownCommand('', 0, 0, 'image', labels)).toEqual({
			value: '![alternativa](https://)',
			selectionStart: 15,
			selectionEnd: 23
		});
	});

	test('el bloque de código conserva la selección dentro del fence', () => {
		expect(applyMarkdownCommand('antes código después', 6, 12, 'codeBlock')).toEqual({
			value: 'antes \n```\ncódigo\n```\n después',
			selectionStart: 11,
			selectionEnd: 17
		});
	});
});

describe('hasUnsafeMarkdownContent', () => {
	const manager = new MarkdownManager({ extensions: createMarkdownExtensions() });

	test('rechaza esquemas peligrosos u ofuscados y admite destinos web o relativos', () => {
		expect(hasUnsafeMarkdownContent('[x](javascript:alert(1))', manager)).toBe(true);
		const entityObfuscated = `![x](java&${String.fromCharCode(35)}115;cript:alert(1))`;
		expect(hasUnsafeMarkdownContent(entityObfuscated, manager)).toBe(true);
		expect(hasUnsafeMarkdownContent('[x](https://example.com) ![x](/media/x.png)', manager)).toBe(
			false
		);
	});

	test('rechaza HTML embebido de bloque o inline aunque su etiqueta parezca inocua', () => {
		expect(hasUnsafeMarkdownContent('<script>alert(1)</script>', manager)).toBe(true);
		expect(
			hasUnsafeMarkdownContent('texto <a href="javascript:alert(1)">peligro</a>', manager)
		).toBe(true);
		expect(hasUnsafeMarkdownContent('texto<br>salto', manager)).toBe(true);
	});
});

describe('countMarkdownWords', () => {
	test('cuenta espacios y saltos sin inflar el vacío', () => {
		expect(countMarkdownWords('')).toBe(0);
		expect(countMarkdownWords('  uno\n dos   tres ')).toBe(3);
	});
});
