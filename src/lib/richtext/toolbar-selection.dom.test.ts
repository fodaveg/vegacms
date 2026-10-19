import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { syncToolbarSelection } from './toolbar-selection';

let dom: HTMLDivElement, other: HTMLDivElement, text: Text;
const setTextSelection = vi.fn();
const posAtDOM = vi.fn((_node: Node, offset: number) => offset + 1);
let editor: Editor;
function select(anchor: number, head: number): void {
	document.getSelection()!.setBaseAndExtent(text, anchor, text, head);
}
function enter(relatedTarget: EventTarget = dom): FocusEvent {
	return new FocusEvent('focusin', { relatedTarget });
}
beforeEach(() => {
	vi.clearAllMocks();
	posAtDOM.mockImplementation((_node, offset) => offset + 1);
	dom = document.createElement('div');
	text = document.createTextNode('Texto seleccionado');
	dom.append(text);
	other = document.createElement('div');
	other.textContent = 'Otro editor';
	document.body.append(dom, other);
	editor = {
		isDestroyed: false,
		view: { dom, posAtDOM },
		state: { doc: { content: { size: 20 } }, selection: { anchor: 1, head: 6 } },
		commands: { setTextSelection }
	} as unknown as Editor;
});
afterEach(() => {
	document.getSelection()?.removeAllRanges();
	dom.remove();
	other.remove();
});
describe('entrada a herramientas: sincroniza solo el rango del propio editor', () => {
	test.each([
		[6, 6, 7, 7],
		[5, 0, 6, 1],
		[2, 8, 3, 9]
	])('conserva cursor/dirección %s→%s', (anchor, head, from, to) => {
		select(anchor, head);
		syncToolbarSelection(editor, enter(), false);
		expect(setTextSelection).toHaveBeenCalledExactlyOnceWith({ from, to });
	});
	test('un rango ya sincronizado no emite otra transacción', () => {
		select(0, 5);
		syncToolbarSelection(editor, enter(), false);
		expect(setTextSelection).not.toHaveBeenCalled();
	});
	test('ignora foco ajeno, selección externa, readonly y desmontaje', () => {
		select(6, 6);
		syncToolbarSelection(editor, enter(other), false);
		syncToolbarSelection(editor, enter(), true);
		syncToolbarSelection(null, enter(), false);
		document.getSelection()!.selectAllChildren(other);
		syncToolbarSelection(editor, enter(), false);
		expect(setTextSelection).not.toHaveBeenCalled();
	});
	test('un límite DOM inválido o fuera del documento no cambia la selección', () => {
		select(6, 6);
		posAtDOM.mockImplementationOnce(() => {
			throw new Error('unmanaged boundary');
		});
		syncToolbarSelection(editor, enter(), false);
		posAtDOM.mockReturnValue(-1);
		syncToolbarSelection(editor, enter(), false);
		expect(setTextSelection).not.toHaveBeenCalled();
	});
});
