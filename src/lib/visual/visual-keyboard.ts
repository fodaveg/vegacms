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
 *  Un `<select>` o un menú (`role="menu"`, como el de zoom de la barra) conserva sus teclas: flechas,
 *  Alt+flechas, Supr, Retroceso y Escape son suyos, nunca de los bloques. Lo mismo los controles de
 *  VISTA de la barra que sustituyeron a los `<select>` «Vista» y «Zoom» (el segmentado de tamaños y
 *  el disparador del zoom, marcados `data-vega-own-keys`): con el foco ahí, Supr no borra la sección
 *  seleccionada ni Alt+↓ la mueve. */
export const OWN_KEYS_SELECTOR = 'select, [role="menu"], [data-vega-own-keys]';

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
	if (event.target instanceof HTMLElement && event.target.closest(OWN_KEYS_SELECTOR)) return null;
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
