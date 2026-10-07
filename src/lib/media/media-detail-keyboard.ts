interface MediaDetailKeyboardState {
	confirmationOpen: boolean;
	focalPending: boolean;
	clearFocalPending: () => void;
	requestClose: () => void;
	dialog: HTMLElement | null;
}

/** Esc deja primero el ajuste focal pendiente; Tab permanece dentro del diálogo activo. */
export function handleMediaDetailKeyboard(
	event: KeyboardEvent,
	state: MediaDetailKeyboardState
): void {
	// Los diálogos de confirmación tienen sus propias trampas de foco y Escape.
	if (state.confirmationOpen) return;
	if (event.key === 'Escape') {
		event.preventDefault();
		event.stopPropagation();
		if (state.focalPending) state.clearFocalPending();
		else state.requestClose();
		return;
	}
	if (event.key !== 'Tab') return;
	const focusable = state.dialog
		? Array.from(state.dialog.querySelectorAll<HTMLElement>('button, input'))
		: [];
	if (focusable.length === 0) return;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}
