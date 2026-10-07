/** El atajo de guardar evita siempre el diálogo nativo y respeta el modal de programación. */
export function handleRecordSaveKeydown(
	event: KeyboardEvent,
	state: {
		scheduleOpen: boolean;
		formDisabled: boolean;
		dirty: boolean;
		form: HTMLFormElement | null | undefined;
	}
): void {
	if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
	event.preventDefault();
	if (state.scheduleOpen || state.formDisabled || !state.dirty) return;
	// Un diálogo puede guardar un destino independiente. El atajo nunca guarda el padre.
	if (state.form?.ownerDocument.querySelector('[aria-modal="true"]')) return;
	state.form?.requestSubmit();
}
