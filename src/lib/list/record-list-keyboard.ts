import { isEditableTarget } from '$lib/shell/keyboard';

/** Atajo de nueva entrada. La confirmación de borrado bloquea incluso teclas en botones. */
export function handleNewRecordKeydown(
	event: KeyboardEvent,
	typeName: string,
	deletePending: () => boolean,
	navigate: (typeName: string) => void
): void {
	if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return;
	if (isEditableTarget(event.target) || deletePending()) return;
	event.preventDefault();
	navigate(typeName);
}
