import type { Editor } from '@tiptap/core';

/** ProseMirror puede recibir selectionchange después de perder el foco por Tab. Antes de
 * operar en la barra, lleva el rango nativo actual a SU modelo, sin cambiar el documento.
 */
export function syncToolbarSelection(
	editor: Editor | null,
	event: FocusEvent,
	disabled: boolean
): void {
	if (!editor || disabled || editor.isDestroyed) return;
	const { view, state } = editor;
	const dom = view.dom;
	if (!(event.relatedTarget instanceof Node) || !dom.contains(event.relatedTarget)) return;
	const selection = dom.ownerDocument.getSelection();
	if (
		!selection?.anchorNode ||
		!selection.focusNode ||
		!dom.contains(selection.anchorNode) ||
		!dom.contains(selection.focusNode)
	)
		return;
	// La selección de una imagen/nodo no se convierte en un rango de texto.
	if (
		!selection.isCollapsed &&
		selection.anchorNode.nodeType !== Node.TEXT_NODE &&
		selection.focusNode.nodeType !== Node.TEXT_NODE
	)
		return;
	let from: number, to: number;
	try {
		from = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
		to = view.posAtDOM(selection.focusNode, selection.focusOffset);
	} catch {
		return;
	} // Un límite DOM no gestionado por esta vista no debe sobrescribir su rango.
	if (from < 0 || to < 0 || from > state.doc.content.size || to > state.doc.content.size) return;
	if (from !== state.selection.anchor || to !== state.selection.head) {
		// from/to son anchor/head, no límites ordenados: conserva también la dirección inversa.
		editor.commands.setTextSelection({ from, to });
	}
}
