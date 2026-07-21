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
 * `dragFromIndex`/`dragOverIndex` (el origen y el destino EN VUELO de un arrastre) son variables
 * PLANAS, no `$state`: al vivir en un módulo `.ts` (no `.svelte`/`.svelte.ts`), este módulo no
 * podría usar runas aunque quisiera — los closures de fábrica (`createReorderDndController`) son
 * el mecanismo de encapsulación aquí, un controlador por instancia de tabla, cada uno con su
 * propio estado. El feedback visual del arrastre (#l12-ux, item 2: fila "agarrada" + indicador de
 * dónde caería) SÍ necesita que el marcado se re-pinte con cada cambio — por eso el controlador
 * acepta un `onDragStateChange` opcional: quien lo crea (`RecordTable`/`MergedViewTable`, ambos
 * `.svelte`, SÍ pueden usar runas) lo usa para espejar `dragFromIndex`/`dragOverIndex` en su
 * propio `$state` local y decidir las clases CSS desde ahí. El controlador en sí sigue sin saber
 * nada de Svelte — solo notifica un objeto plano.
 */

/** Estado de arrastre EN VUELO, para quien pinte el feedback visual (ver cabecera). Ambos
 *  `null` fuera de un gesto de arrastre. */
export interface ReorderDragState {
	/** Índice de la fila que se está arrastrando (la que se "agarró"), o `null` si no hay ningún
	 *  arrastre en curso. */
	fromIndex: number | null;
	/** Índice de la fila que se está sobrevolando AHORA MISMO (dónde caería si se soltara), o
	 *  `null` sin arrastre en curso. */
	overIndex: number | null;
}

/** Los cinco manejadores de evento que un `<table>` con asa de reorder necesita cablear — mismos
 *  nombres que llevaban en `RecordTable` antes de la extracción, para que el diff de migración de
 *  ese componente sea mínimo. */
export interface ReorderDndController {
	/** `dragstart` en el asa de la fila `index`: guarda el origen y marca el `dataTransfer` (varios
	 *  navegadores exigen `setData` para que el gesto de arrastre se complete). */
	handleDragStart(event: DragEvent, index: number): void;
	/** `dragover` en la fila `index`: `preventDefault` es OBLIGATORIO para que el navegador permita
	 *  soltar ahí (por defecto una fila no es un destino de drop válido). También fija `dropEffect
	 *  = 'move'` (nit de code-review): sin esto, algunos navegadores pintan el cursor de
	 *  "prohibido"/"copiar" en vez del de "mover" durante el arrastre — el `effectAllowed` de
	 *  `handleDragStart` por sí solo no basta en todos. Desde #l12-ux (item 2) también actualiza
	 *  `dragOverIndex` (y notifica) mientras haya un arrastre en curso, para el indicador de
	 *  destino — `index` es ahora un parámetro OBLIGATORIO (antes no hacía falta, el hueco no
	 *  existía). */
	handleDragOver(event: DragEvent, index: number): void;
	/** `drop` en la fila `index`: si hay un origen en vuelo y es distinto del destino, avisa. */
	handleDrop(event: DragEvent, index: number): void;
	/** `dragend` del asa: limpia el origen en vuelo (arrastre cancelado o ya resuelto por `drop`). */
	handleDragEnd(): void;
	/** `keydown` en el asa de la fila `index` (fallback de teclado, ver cabecera del módulo):
	 *  `ArrowUp`/`ArrowDown` mueve esa fila una posición de inmediato (sin un paso previo de
	 *  "agarrar"). Cualquier otra tecla sigue su comportamiento nativo (Tab, Enter/Space del propio
	 *  `<button>`…). Sin estado de arrastre que notificar: el movimiento es inmediato, no hay un
	 *  "en vuelo" que pintar (ver cabecera del módulo). */
	handleHandleKeydown(event: KeyboardEvent, index: number): void;
}

/**
 * Crea un controlador de arrastre+teclado nuevo, con su propio `dragFromIndex`/`dragOverIndex`
 * aislados (una instancia por tabla montada — `RecordTable`/`MergedViewTable` crean la suya en
 * `<script>`, nunca comparten una entre dos tablas).
 *
 * @param onReorder Avisa de `(fromIndex, toIndex)` tras un `drop` válido o una flecha de teclado.
 *   Nunca se llama con `fromIndex === toIndex` (ni el drop en la misma fila ni la flecha en un
 *   extremo llegan a invocarlo).
 * @param rowCount Número ACTUAL de filas renderizadas, releído en cada `keydown` (una función, no
 *   un número capturado una vez) — así el límite de `ArrowDown` sigue correcto aunque el conjunto
 *   de filas cambie entre el montaje del controlador y la pulsación (p.ej. tras un `reload()`).
 * @param onDragStateChange (#l12-ux, item 2, opcional) Notifica el `ReorderDragState` cada vez que
 *   cambia `fromIndex`/`overIndex` — quien lo crea lo usa para pintar el feedback visual del
 *   arrastre. Ausente = comportamiento previo a #l12-ux, intacto (el controlador simplemente no
 *   notifica nada).
 */
export function createReorderDndController(
	onReorder: (fromIndex: number, toIndex: number) => void,
	rowCount: () => number,
	onDragStateChange?: (state: ReorderDragState) => void
): ReorderDndController {
	let dragFromIndex: number | null = null;
	let dragOverIndex: number | null = null;

	function notify(): void {
		onDragStateChange?.({ fromIndex: dragFromIndex, overIndex: dragOverIndex });
	}

	return {
		handleDragStart(event, index) {
			dragFromIndex = index;
			dragOverIndex = index;
			event.dataTransfer?.setData('text/plain', String(index));
			if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
			notify();
		},
		handleDragOver(event, index) {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			// Sin arrastre en curso (p.ej. algo ajeno a esta tabla sobrevolando la fila) o ya sobre
			// el mismo índice: nada que notificar — evita un re-pintado por cada `dragover` repetido
			// del navegador mientras el puntero no cambia de fila.
			if (dragFromIndex === null || dragOverIndex === index) return;
			dragOverIndex = index;
			notify();
		},
		handleDrop(event, index) {
			event.preventDefault();
			const from = dragFromIndex;
			dragFromIndex = null;
			dragOverIndex = null;
			notify();
			if (from !== null && from !== index) onReorder(from, index);
		},
		handleDragEnd() {
			dragFromIndex = null;
			dragOverIndex = null;
			notify();
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

/**
 * (#l12-ux, item 2) Decide en qué BORDE de la fila `overIndex` pintar el indicador de "aquí
 * caería" — pura, sin efecto en la persistencia (`computeReorder`, quien la origina, decide dónde
 * cae REALMENTE el registro; esto es solo el hueco visual). Arrastrando HACIA ABAJO (`fromIndex <
 * overIndex`) el hueco va DEBAJO de la fila sobrevolada (el registro entraría tras ella);
 * arrastrando HACIA ARRIBA (`fromIndex > overIndex`), ENCIMA — mismo sentido intuitivo que
 * cualquier lista reordenable con línea de inserción. Sobre la propia fila de origen
 * (`fromIndex === overIndex`) o sin arrastre en vuelo (cualquiera de los dos `null`), no hay
 * indicador: `null`.
 */
export function dropIndicatorEdge(
	fromIndex: number | null,
	overIndex: number | null
): 'before' | 'after' | null {
	if (fromIndex === null || overIndex === null || fromIndex === overIndex) return null;
	return fromIndex < overIndex ? 'after' : 'before';
}
