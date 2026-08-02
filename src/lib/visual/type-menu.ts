/**
 * `type-menu.ts` (defecto "el botón `+` del lienzo crea sin preguntar el tipo"): la parte del
 * menú "elegir tipo de bloque" que NO depende de dónde vive el botón — EXTRAÍDA de
 * `VisualBlockTree.svelte` (patrón APG heredado de `RecordBlocks.svelte`) para que
 * `VisualOverlay.svelte` la reutilice en el `+` de sus puntos de inserción, en vez de escribir un
 * segundo algoritmo de navegación por teclado. El encargo es explícito sobre el riesgo: "si acaba
 * habiendo dos menús de tipos con dos comportamientos de teclado distintos, el encargo ha salido
 * mal".
 *
 * Mismo reparto que `$lib/list/reorder-dnd.ts`: funciones PURAS sobre el DOM que le pasan, sin
 * `$state` propio — cada `.svelte` sigue siendo dueño de su `open`/refs, porque eso SÍ es distinto
 * en cada sitio (el árbol abre un único menú fijo bajo un botón de texto, en flujo normal; el
 * lienzo abre como mucho un menú a la vez, anclado a un punto de inserción entre N+1 posibles,
 * sobre un lienzo con scroll y zoom). Forzar a los dos a compartir MARCADO habría acoplado dos
 * superficies con necesidades de posicionamiento genuinamente distintas sin necesidad; lo único
 * que de verdad puede DIVERGIR en silencio si se escribe a mano dos veces es el algoritmo de
 * foco/flechas — y eso es justo lo que vive aquí, una sola vez.
 */

/** Los `role="menuitem"` que hay AHORA MISMO dentro de `menuEl` — se lee del DOM en cada
 *  pulsación, no de una lista capturada al abrir (el menú puede cambiar de contenido entre que se
 *  abre y que el autor teclea). */
export function typeMenuItems(menuEl: HTMLElement | null): HTMLButtonElement[] {
	return Array.from(menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
}

/** `ArrowUp`/`ArrowDown`/`Home`/`End` sobre la lista de arriba (patrón APG de menú): el índice al
 *  que debería moverse el foco, o `null` si la tecla no es ninguna de esas (o no hay items donde
 *  moverlo). Quien llame decide qué hacer con el índice (`items[index]?.focus()`) y si hace
 *  `preventDefault` — esta función no toca el DOM, solo calcula. */
export function typeMenuKeydownIndex(
	event: KeyboardEvent,
	items: readonly HTMLButtonElement[]
): number | null {
	if (items.length === 0) return null;
	const current = items.indexOf(document.activeElement as HTMLButtonElement);
	if (event.key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % items.length;
	if (event.key === 'ArrowUp')
		return current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
	if (event.key === 'Home') return 0;
	if (event.key === 'End') return items.length - 1;
	return null;
}
