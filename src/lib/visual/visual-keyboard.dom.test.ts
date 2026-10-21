import { afterEach, describe, expect, test } from 'vitest';
import { visualKeyboardAction } from './visual-keyboard';

afterEach(() => document.body.replaceChildren());

/** `keydown` cuyo `target` es `el`, como lo recibe el listener de ventana de la pantalla. */
function keydown(el: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
	Object.defineProperty(event, 'target', { value: el });
	return event;
}

describe('visualKeyboardAction: dueños de sus teclas', () => {
	test('un botón cualquiera (fila del árbol) sí lleva Supr, Alt+↓ y Escape a la sección', () => {
		const row = document.createElement('button');
		document.body.append(row);
		expect(visualKeyboardAction(keydown(row, 'Delete'), true, false)).toBe('delete');
		expect(visualKeyboardAction(keydown(row, 'ArrowDown', { altKey: true }), true, false)).toBe(
			'move-down'
		);
		expect(visualKeyboardAction(keydown(row, 'Escape'), true, false)).toBe('clear-selection');
	});

	test('los controles de vista de la barra (data-vega-own-keys) no borran, mueven ni deseleccionan', () => {
		const segm = document.createElement('div');
		segm.setAttribute('data-vega-own-keys', '');
		const preset = document.createElement('button');
		segm.append(preset);
		document.body.append(segm);
		for (const [key, init] of [
			['Delete', {}],
			['Backspace', {}],
			['ArrowDown', { altKey: true }],
			['ArrowUp', { altKey: true }],
			['Escape', {}]
		] as const)
			expect(visualKeyboardAction(keydown(preset, key, init), true, false)).toBeNull();
		// Guardar sigue siendo global, también desde ahí.
		expect(visualKeyboardAction(keydown(preset, 's', { ctrlKey: true }), true, false)).toBe('save');
	});

	test('⌘S guarda también sin lienzo («Solo textos»); el resto de atajos no', () => {
		const field = document.createElement('input');
		document.body.append(field);
		const save = keydown(field, 's', { metaKey: true });
		expect(visualKeyboardAction(save, false, false)).toBe('save');
		expect(save.defaultPrevented).toBe(true);
		expect(visualKeyboardAction(keydown(document.body, 'Escape'), false, false)).toBeNull();
		field.remove();
	});

	test('un <select> y un menú conservan sus teclas como antes', () => {
		const select = document.createElement('select');
		const menu = document.createElement('div');
		menu.setAttribute('role', 'menu');
		const item = document.createElement('button');
		menu.append(item);
		document.body.append(select, menu);
		expect(visualKeyboardAction(keydown(select, 'Delete'), true, false)).toBeNull();
		expect(visualKeyboardAction(keydown(item, 'Escape'), true, false)).toBeNull();
	});
});
