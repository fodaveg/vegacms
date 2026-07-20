/**
 * Tests unitarios de `createReorderDndController` (`reorder-dnd.ts`, L7d): los invariantes de la
 * glue de arrastre+teclado SIN DOM real — el módulo no toca `document`/`window`, así que un mock
 * mínimo de `DragEvent`/`KeyboardEvent` (`preventDefault`/`dataTransfer` de juguete) basta; vive
 * en el proyecto `server` de Vitest (`*.test.ts` plano, `environment: 'node'`, ver
 * `vite.config.ts`), coherente con el resto de `list/*.test.ts` (lógica pura, sin componente).
 *
 * Fixture compartido: `dragEvent()`/`keyEvent()` construyen el mock tipado (cast a
 * `DragEvent`/`KeyboardEvent`, los tipos del lib DOM de TS bastan para el chequeo de tipos aunque
 * el runtime sea Node) — cada test espía `preventDefault` para comprobar que el gesto se consume
 * cuando corresponde (y NUNCA cuando el resultado es un no-op).
 */

import { describe, expect, test, vi } from 'vitest';
import { createReorderDndController } from './reorder-dnd';

/** Mock mínimo de `DataTransfer`: solo los tres miembros que toca el módulo. */
function dataTransfer() {
	return { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
}

/** Mock mínimo de `DragEvent`, con su propio `dataTransfer` de juguete (uno nuevo por llamada:
 *  ningún test comparte `dataTransfer` entre eventos, igual que el navegador). */
function dragEvent() {
	return {
		preventDefault: vi.fn(),
		dataTransfer: dataTransfer()
	} as unknown as DragEvent;
}

/** Mock mínimo de `KeyboardEvent`: solo `key`/`preventDefault`, lo único que lee el controlador. */
function keyEvent(key: string) {
	return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('createReorderDndController', () => {
	describe('teclado (ArrowUp/ArrowDown)', () => {
		test('ArrowUp en el índice 0: no-op, no llama a onReorder ni consume el evento', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);
			const event = keyEvent('ArrowUp');

			dnd.handleHandleKeydown(event, 0);

			expect(onReorder).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		test('ArrowDown en el último índice (según rowCount()): no-op', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);
			const event = keyEvent('ArrowDown');

			dnd.handleHandleKeydown(event, 2); // rowCount() - 1

			expect(onReorder).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		test('ArrowUp en un índice intermedio: emite onReorder(i, i-1) y consume el evento', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);
			const event = keyEvent('ArrowUp');

			dnd.handleHandleKeydown(event, 1);

			expect(onReorder).toHaveBeenCalledExactlyOnceWith(1, 0);
			expect(event.preventDefault).toHaveBeenCalledOnce();
		});

		test('ArrowDown en un índice intermedio: emite onReorder(i, i+1) y consume el evento', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);
			const event = keyEvent('ArrowDown');

			dnd.handleHandleKeydown(event, 1);

			expect(onReorder).toHaveBeenCalledExactlyOnceWith(1, 2);
			expect(event.preventDefault).toHaveBeenCalledOnce();
		});

		test('cualquier otra tecla: no-op, ni siquiera en un índice intermedio', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);
			const event = keyEvent('Enter');

			dnd.handleHandleKeydown(event, 1);

			expect(onReorder).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		test('rowCount() se relee en cada keydown, nunca capturado una sola vez', () => {
			const onReorder = vi.fn();
			let count = 3;
			const dnd = createReorderDndController(onReorder, () => count);

			// Con rowCount() === 3, el índice 2 es el último: ArrowDown ahí es no-op.
			dnd.handleHandleKeydown(keyEvent('ArrowDown'), 2);
			expect(onReorder).not.toHaveBeenCalled();

			// El conjunto crece (p.ej. tras un `reload()` con una fila nueva): el MISMO índice 2 ya
			// no es el último — si el controlador hubiera capturado `rowCount()` una sola vez al
			// crearse, este segundo intento seguiría siendo no-op. No lo es.
			count = 4;
			dnd.handleHandleKeydown(keyEvent('ArrowDown'), 2);
			expect(onReorder).toHaveBeenCalledExactlyOnceWith(2, 3);
		});
	});

	describe('arrastre (dragstart/dragover/drop/dragend)', () => {
		test('drop sobre el MISMO índice que el dragstart: no-op, no llama a onReorder', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);

			dnd.handleDragStart(dragEvent(), 1);
			const drop = dragEvent();
			dnd.handleDrop(drop, 1);

			expect(onReorder).not.toHaveBeenCalled();
			expect(drop.preventDefault).toHaveBeenCalledOnce(); // el drop SIEMPRE se consume
		});

		test('drop de i sobre j (distintos): emite onReorder(i, j)', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);

			dnd.handleDragStart(dragEvent(), 0);
			dnd.handleDrop(dragEvent(), 2);

			expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 2);
		});

		test('dragFromIndex se limpia en dragend: un drop posterior sin dragstart no dispara nada', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);

			dnd.handleDragStart(dragEvent(), 0);
			dnd.handleDragEnd(); // arrastre cancelado (p.ej. Esc, o soltar fuera de cualquier fila)
			dnd.handleDrop(dragEvent(), 2);

			expect(onReorder).not.toHaveBeenCalled();
		});

		test('dragFromIndex también se limpia tras un drop resuelto: un segundo drop sin dragstart nuevo no repite el reorder', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 3);

			dnd.handleDragStart(dragEvent(), 0);
			dnd.handleDrop(dragEvent(), 2);
			expect(onReorder).toHaveBeenCalledTimes(1);

			dnd.handleDrop(dragEvent(), 1); // sin dragstart previo: dragFromIndex ya es null
			expect(onReorder).toHaveBeenCalledTimes(1); // sin una segunda llamada
		});

		test('dragstart marca dataTransfer (setData + effectAllowed) para que el gesto se complete', () => {
			const dnd = createReorderDndController(vi.fn(), () => 3);
			const event = dragEvent();

			dnd.handleDragStart(event, 1);

			expect(event.dataTransfer?.setData).toHaveBeenCalledExactlyOnceWith('text/plain', '1');
			expect(event.dataTransfer?.effectAllowed).toBe('move');
		});

		test('dragover consume el evento y fija dropEffect a "move" (nit de code-review)', () => {
			const dnd = createReorderDndController(vi.fn(), () => 3);
			const event = dragEvent();

			dnd.handleDragOver(event);

			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(event.dataTransfer?.dropEffect).toBe('move');
		});
	});

	describe('onReorder: se invoca la función provista, con el valor actual de cada evento', () => {
		test('cada gesto llama a la MISMA función pasada en la creación, con los índices de ESE gesto', () => {
			const onReorder = vi.fn();
			const dnd = createReorderDndController(onReorder, () => 4);

			dnd.handleHandleKeydown(keyEvent('ArrowDown'), 1);
			dnd.handleDragStart(dragEvent(), 3);
			dnd.handleDrop(dragEvent(), 0);

			expect(onReorder).toHaveBeenCalledTimes(2);
			expect(onReorder).toHaveBeenNthCalledWith(1, 1, 2); // ArrowDown en 1 → (1, 2)
			expect(onReorder).toHaveBeenNthCalledWith(2, 3, 0); // drop de 3 sobre 0 → (3, 0)
		});
	});
});
