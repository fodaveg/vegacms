/**
 * `reorder-dnd.ts` (L7d, roadmap `mergedViews`): la glue de arrastre (DnD nativo) + teclado del
 * asa de reorder manual, EXTRAÍDA de `RecordTable.svelte` (única dueña hasta L7d) para que
 * `MergedViewTable.svelte` la reutilice sin duplicar la maquinaria de eventos — ambas tablas
 * pintan el mismo asa (`⠿`, `<button draggable="true">`) y necesitan idéntico comportamiento.
 *
 * Agnóstico de colección/registro por construcción: opera solo sobre ÍNDICES dentro de la lista
 * renderizada por el consumidor (`records` en `RecordTable`, el conjunto mezclado en
 * `MergedViewTable`) y emite `onReorder(fromIndex, toIndex)` — quien crea el controlador decide
 * qué persistir (`computeReorder`, `reorder.ts`) y con qué colección; este módulo no sabe nada de
 * eso, igual que no lo sabía `RecordTable` antes de la extracción.
 *
 * `dragFromIndex` (el origen de un arrastre en vuelo) es una variable PLANA, no `$state`: mismo
 * criterio que tenía en `RecordTable` (ver su comentario original, ahora aquí) — ningún marcado la
 * lee reactivamente, solo la consulta `handleDrop` dentro del mismo gesto de arrastre. Al vivir en
 * un módulo `.ts` (no `.svelte`/`.svelte.ts`), tampoco podría usar runas aunque quisiera: los
 * closures de fábrica (`createReorderDndController`) son el mecanismo de encapsulación aquí, un
 * controlador por instancia de tabla, cada uno con su propio `dragFromIndex`.
 */

/** Los cinco manejadores de evento que un `<table>` con asa de reorder necesita cablear — mismos
 *  nombres que llevaban en `RecordTable` antes de la extracción, para que el diff de migración de
 *  ese componente sea mínimo. */
export interface ReorderDndController {
	/** `dragstart` en el asa de la fila `index`: guarda el origen y marca el `dataTransfer` (varios
	 *  navegadores exigen `setData` para que el gesto de arrastre se complete). */
	handleDragStart(event: DragEvent, index: number): void;
	/** `dragover` en la fila (cualquier índice): `preventDefault` es OBLIGATORIO para que el
	 *  navegador permita soltar ahí (por defecto una fila no es un destino de drop válido).
	 *  También fija `dropEffect = 'move'` (nit de code-review): sin esto, algunos navegadores
	 *  pintan el cursor de "prohibido"/"copiar" en vez del de "mover" durante el arrastre — el
	 *  `effectAllowed` de `handleDragStart` por sí solo no basta en todos. */
	handleDragOver(event: DragEvent): void;
	/** `drop` en la fila `index`: si hay un origen en vuelo y es distinto del destino, avisa. */
	handleDrop(event: DragEvent, index: number): void;
	/** `dragend` del asa: limpia el origen en vuelo (arrastre cancelado o ya resuelto por `drop`). */
	handleDragEnd(): void;
	/** `keydown` en el asa de la fila `index` (fallback de teclado, ver cabecera del módulo):
	 *  `ArrowUp`/`ArrowDown` mueve esa fila una posición de inmediato (sin un paso previo de
	 *  "agarrar"). Cualquier otra tecla sigue su comportamiento nativo (Tab, Enter/Space del propio
	 *  `<button>`…). */
	handleHandleKeydown(event: KeyboardEvent, index: number): void;
}

/**
 * Crea un controlador de arrastre+teclado nuevo, con su propio `dragFromIndex` aislado (una
 * instancia por tabla montada — `RecordTable`/`MergedViewTable` crean la suya en `<script>`,
 * nunca comparten una entre dos tablas).
 *
 * @param onReorder Avisa de `(fromIndex, toIndex)` tras un `drop` válido o una flecha de teclado.
 *   Nunca se llama con `fromIndex === toIndex` (ni el drop en la misma fila ni la flecha en un
 *   extremo llegan a invocarlo).
 * @param rowCount Número ACTUAL de filas renderizadas, releído en cada `keydown` (una función, no
 *   un número capturado una vez) — así el límite de `ArrowDown` sigue correcto aunque el conjunto
 *   de filas cambie entre el montaje del controlador y la pulsación (p.ej. tras un `reload()`).
 */
export function createReorderDndController(
	onReorder: (fromIndex: number, toIndex: number) => void,
	rowCount: () => number
): ReorderDndController {
	let dragFromIndex: number | null = null;

	return {
		handleDragStart(event, index) {
			dragFromIndex = index;
			event.dataTransfer?.setData('text/plain', String(index));
			if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		},
		handleDragOver(event) {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		},
		handleDrop(event, index) {
			event.preventDefault();
			if (dragFromIndex !== null && dragFromIndex !== index) onReorder(dragFromIndex, index);
			dragFromIndex = null;
		},
		handleDragEnd() {
			dragFromIndex = null;
		},
		handleHandleKeydown(event, index) {
			if (event.key === 'ArrowUp' && index > 0) {
				event.preventDefault();
				onReorder(index, index - 1);
			} else if (event.key === 'ArrowDown' && index < rowCount() - 1) {
				event.preventDefault();
				onReorder(index, index + 1);
			}
		}
	};
}
