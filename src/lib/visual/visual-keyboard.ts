import { isEditableTarget } from '$lib/shell/keyboard';

type VisualKeyboardAction =
	| 'save'
	| 'close-help'
	| 'clear-selection'
	| 'toggle-help'
	| 'move-up'
	| 'move-down'
	| 'delete'
	| null;

/** Decide el gesto antes de tocar estado; guardar es el único atajo activo dentro de un campo.
 *  Los selects de Vista/Zoom conservan sus teclas nativas, también Alt+flechas y Escape. */
export function visualKeyboardAction(
	event: KeyboardEvent,
	canvasActive: boolean,
	helpOpen: boolean
): VisualKeyboardAction {
	if (!canvasActive) return null;
	if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
		event.preventDefault();
		return 'save';
	}
	if (event.target instanceof HTMLElement && event.target.closest('select')) return null;
	if (isEditableTarget(event.target)) return null;
	if (event.key === 'Escape') return helpOpen ? 'close-help' : 'clear-selection';
	if (event.key === '?') {
		event.preventDefault();
		return 'toggle-help';
	}
	if (helpOpen) return null;
	if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
		event.preventDefault();
		return event.key === 'ArrowUp' ? 'move-up' : 'move-down';
	}
	if (event.key === 'Delete' || event.key === 'Backspace') {
		event.preventDefault();
		return 'delete';
	}
	return null;
}
