/** Separado para probar fallos de descarga sin fingir que el widget se llegó a montar. */
export function loadRelationWidget() {
	return import('./Relation.svelte');
}
