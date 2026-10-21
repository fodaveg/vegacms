/**
 * Adjunto (`{@attach portalTo(destino)}`) que pinta un nodo en OTRO sitio del documento sin
 * cambiar de dueño: el estado, los manejadores y el ciclo de vida siguen siendo del componente que
 * lo declara. Lo usa `VisualOverlay.svelte` para sacar sus controles del lienzo escalado (dentro de
 * la hoja, encima del iframe) a la franja y al margen del escenario, FUERA de la página (QA de
 * fodaveg, 21 oct 2026: ningún control del overlay se dibuja sobre contenido del sitio).
 *
 * Sin destino (`null`, como en un montaje aislado de pruebas) el nodo se queda donde está. Al
 * desmontar, el propio adjunto lo retira del destino; quien lo declara debe envolverlo en un
 * elemento propio (p. ej. `display: contents`) para que Svelte retire su bloque sin recorrer
 * hermanos ajenos del destino. Mismo patrón que el `use:portal` de `RelationCreateDialog.svelte`.
 */
export function portalTo(target: HTMLElement | null | undefined) {
	return (node: HTMLElement): (() => void) | void => {
		if (!target) return;
		target.appendChild(node);
		return () => node.remove();
	};
}
