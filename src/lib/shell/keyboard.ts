/**
 * Utilidades de teclado compartidas por los atajos globales del shell (R1/R2 del rediseño C2):
 * el atajo `/` de `GlobalSearch.svelte` y el atajo `N` de `/c/[type]/+page.svelte`. Vive aquí
 * (y no duplicado en cada consumidor) para que ambos guardas no diverjan con el tiempo — un
 * atajo que empiece a robar teclas dentro de un campo editable sería un bug sutil y molesto.
 */

/**
 * `true` si `target` es un campo donde el usuario está ESCRIBIENDO (input/textarea o cualquier
 * elemento `contenteditable`): un atajo de una sola tecla NUNCA debe robar la pulsación ahí, o
 * teclear la letra del atajo dentro del buscador/editor haría algo inesperado en vez de escribir.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}
