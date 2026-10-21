/**
 * Guard de salida con cambios sin guardar, compartido por `RecordForm.svelte` y
 * `VisualEditorScreen.svelte` (los dos lo registran con `beforeNavigate`).
 *
 * Una navegación que SALE del documento (recarga, cerrar la pestaña, una URL externa: SvelteKit la
 * marca con `willUnload`, y `type === 'leave'` siempre la lleva) solo se cancela: SvelteKit
 * convierte ese `cancel()` en el diálogo nativo de `beforeunload`. Llamar a `window.confirm` ahí no
 * pinta nada y el navegador lo deja en consola como error («Blocked confirm(...) during
 * beforeunload», QA de fodaveg del 21 oct 2026). La pregunta propia solo tiene sentido en una
 * navegación INTERNA, la única que puede esperar su respuesta síncrona.
 */

/** Lo que este guard lee de la `BeforeNavigate` de SvelteKit. */
export interface LeaveNavigation {
	willUnload: boolean;
	cancel(): void;
}

/** Cancela la salida del documento sin preguntar; en una navegación interna pregunta con
 *  `confirmLeave` y cancela si la respuesta es no. Solo se llama con cambios sin guardar. */
export function guardUnsavedLeave(navigation: LeaveNavigation, confirmLeave: () => boolean): void {
	if (navigation.willUnload) {
		navigation.cancel();
		return;
	}
	if (!confirmLeave()) navigation.cancel();
}
