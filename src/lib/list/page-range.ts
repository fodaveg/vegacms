/**
 * Rango de páginas a pintar en la paginación numerada (R4 del rediseño C2, mockup `.gridfoot
 * .pages`): dado `page`/`totalPages`, decide QUÉ botones mostrar — todas las páginas si caben,
 * o `1 … {vecinas de page} … {totalPages}` si no. Módulo puro (sin Svelte, sin el puerto):
 * `Pagination.svelte` (4c/R4) solo pinta lo que este módulo decide, la navegación real sigue
 * siendo responsabilidad de `+page.svelte` (`goToPage`).
 *
 * Algoritmo (ventana simétrica alrededor de `page`, con `siblingCount` vecinos a cada lado):
 * si `totalPages` cabe entero en la ventana (incluidos los dos extremos + los vecinos de
 * `page`), se listan TODAS las páginas sin elipsis — nunca se sustituye un hueco de un solo
 * número por "…" (sería más ruido que ahorro). Si no cabe, los extremos (`1`/`totalPages`)
 * siempre se pintan, y cada lado colapsa a una `'ellipsis'` si el hueco hacia el extremo es
 * mayor que 1; si el hueco es de tamaño 1, se pinta el número en vez de la elipsis (mismo
 * criterio: nunca ocultar un único botón detrás de "…").
 */

/** Un slot del rango: un número de página 1-based, o `'ellipsis'` (hueco colapsado, sin acción). */
export type PageRangeItem = number | 'ellipsis';

function range(start: number, end: number): number[] {
	const items: number[] = [];
	for (let n = start; n <= end; n++) items.push(n);
	return items;
}

/**
 * Calcula el rango a pintar. `siblingCount` (default 1) es cuántas páginas vecinas de `page` se
 * muestran a cada lado antes de considerar colapsar el resto en una elipsis.
 *
 * Casos límite:
 * - `totalPages <= 0`: rango vacío (no debería ocurrir con datos reales, pero no lanza).
 * - `totalPages === 1`: `[1]`, sin elipsis posible.
 * - `page` fuera de `[1, totalPages]`: se clampa internamente, nunca produce un rango inválido.
 */
export function pageRange(page: number, totalPages: number, siblingCount = 1): PageRangeItem[] {
	if (totalPages <= 0) return [];
	if (totalPages === 1) return [1];

	const current = Math.min(Math.max(page, 1), totalPages);

	// Ventana completa (1 + 2*siblingCount + 1 = extremos + vecinos): si `totalPages` cabe ahí
	// entero, listar todo sin elipsis es más honesto que fingir un salto que no existe.
	const totalWindow = siblingCount * 2 + 5;
	if (totalPages <= totalWindow) return range(1, totalPages);

	const leftSibling = Math.max(current - siblingCount, 1);
	const rightSibling = Math.min(current + siblingCount, totalPages);

	const showLeftEllipsis = leftSibling > 2;
	const showRightEllipsis = rightSibling < totalPages - 1;

	const items: PageRangeItem[] = [1];

	if (showLeftEllipsis) {
		items.push('ellipsis');
	} else {
		// Hueco de tamaño <= 1 entre "1" y `leftSibling`: se rellena con el número, nunca con "…".
		for (let p = 2; p < leftSibling; p++) items.push(p);
	}

	for (let p = leftSibling; p <= rightSibling; p++) {
		if (p !== 1 && p !== totalPages) items.push(p);
	}

	if (showRightEllipsis) {
		items.push('ellipsis');
	} else {
		for (let p = rightSibling + 1; p < totalPages; p++) items.push(p);
	}

	items.push(totalPages);
	return items;
}
