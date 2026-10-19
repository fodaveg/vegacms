import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { rovingToolbar } from './toolbar-keyboard';

let toolbar: HTMLDivElement;
let behavior: ReturnType<typeof rovingToolbar>;
let outside: HTMLButtonElement;
const controls = () =>
	Array.from(toolbar.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select'));
function press(control: HTMLElement, key: string, options: KeyboardEventInit = {}): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
	control.dispatchEvent(event);
	return event;
}
async function changed(): Promise<void> {
	await Promise.resolve();
}

beforeEach(() => {
	toolbar = document.createElement('div');
	toolbar.innerHTML =
		'<button>Negrita</button><button disabled>Imagen</button><button>Enlace</button><select><option>Párrafo</option><option>Título</option></select>';
	outside = document.createElement('button');
	document.body.append(toolbar, outside);
	behavior = rovingToolbar(toolbar);
});
afterEach(() => {
	behavior.destroy();
	toolbar.remove();
	outside.remove();
});

describe('barra de formato: una entrada sin apropiarse del select', () => {
	test('una sola entrada; flechas omiten disabled e Inicio/Fin llegan a extremos', () => {
		const [bold, disabled, link, select] = controls();
		expect(controls().filter((c) => c.tabIndex === 0)).toEqual([bold]);
		bold.focus();
		press(bold, 'ArrowRight');
		expect(document.activeElement).toBe(link);
		press(link, 'Home');
		expect(document.activeElement).toBe(bold);
		press(bold, 'End');
		expect(document.activeElement).toBe(select);
		bold.focus();
		press(bold, 'ArrowLeft');
		expect(document.activeElement).toBe(select);
		expect(disabled.tabIndex).toBe(-1);
	});
	test('las teclas nativas del select y Tab no se interceptan; volver entra por primera herramienta', () => {
		const [bold, , , select] = controls();
		select.focus();
		for (const key of [
			'ArrowLeft',
			'ArrowRight',
			'ArrowUp',
			'ArrowDown',
			'Home',
			'End',
			'Escape',
			'Tab'
		]) {
			expect(press(select, key).defaultPrevented).toBe(false);
			expect(document.activeElement).toBe(select);
		}
		outside.focus();
		expect(controls().filter((c) => c.tabIndex === 0)).toEqual([bold]);
	});
	test('sin editor o readonly no introduce entrada; al habilitar y retirar controles se revalida', async () => {
		for (const c of controls()) c.disabled = true;
		await changed();
		expect(controls().every((c) => c.tabIndex === -1)).toBe(true);
		const link = controls()[2];
		link.disabled = false;
		await changed();
		expect(link.tabIndex).toBe(0);
		link.remove();
		await changed();
		expect(controls().every((c) => c.tabIndex === -1)).toBe(true);
		const image = document.createElement('button');
		toolbar.prepend(image);
		await changed();
		expect(image.tabIndex).toBe(0);
	});
	test('modificadores y otras teclas conservan sus acciones y el desmontaje retira listeners', () => {
		const bold = controls()[0];
		bold.focus();
		expect(press(bold, 'ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
		expect(press(bold, 'Enter').defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(bold);
		behavior.destroy();
		expect(press(bold, 'ArrowRight').defaultPrevented).toBe(false);
	});
});
