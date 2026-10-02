/**
 * Suite de `GrowingTextarea.svelte` (lote 12, lámina 4): el área de una línea que crece con su
 * texto. Montaje real (proyecto vitest `component`, jsdom). jsdom no implementa `field-sizing`
 * (`CSS.supports` no existe o devuelve `false`), así que aquí corre el camino de reserva: el alto
 * calculado con `scrollHeight`.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import GrowingTextarea from './GrowingTextarea.svelte';

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

function setup(props: Record<string, unknown> = {}): HTMLTextAreaElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(GrowingTextarea, {
		target,
		props: { value: '', onChange: vi.fn(), ...props }
	});
	mounted = { target, instance };
	flushSync();
	return target.querySelector('textarea')!;
}

function type(area: HTMLTextAreaElement, text: string): void {
	area.value = text;
	area.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.restoreAllMocks();
});

describe('GrowingTextarea.svelte', () => {
	test('es un <textarea rows="1"> sin tirador, con la clase de quien lo usa y sus atributos', () => {
		const area = setup({
			id: 'vega-field-title',
			class: 'vega-widget-text',
			placeholder: 'Escribe',
			maxlength: 140,
			'aria-invalid': 'true',
			'aria-describedby': 'ayuda'
		});
		expect(area.tagName).toBe('TEXTAREA');
		expect(area.getAttribute('rows')).toBe('1');
		expect(area.id).toBe('vega-field-title');
		expect(area.classList.contains('vega-widget-text')).toBe(true);
		expect(area.placeholder).toBe('Escribe');
		expect(area.maxLength).toBe(140);
		expect(area.getAttribute('aria-invalid')).toBe('true');
		expect(area.getAttribute('aria-describedby')).toBe('ayuda');
	});

	test('pinta el valor recibido y lo actualiza cuando cambia desde fuera', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const props = $state({ value: 'uno', onChange: vi.fn() });
		const instance = mount(GrowingTextarea, { target, props });
		mounted = { target, instance };
		flushSync();
		const area = target.querySelector('textarea')!;
		expect(area.value).toBe('uno');
		props.value = 'dos';
		flushSync();
		expect(area.value).toBe('dos');
	});

	test('cada cambio llega a onChange con el texto', () => {
		const onChange = vi.fn();
		const area = setup({ onChange });
		type(area, 'Hola');
		expect(onChange).toHaveBeenLastCalledWith('Hola');
	});

	test('singleLine: un texto pegado con saltos se entrega con espacios, y el cursor no se mueve', () => {
		const onChange = vi.fn();
		const area = setup({ onChange, singleLine: true });
		area.value = 'uno\ndos\r\ntres';
		area.setSelectionRange(4, 4);
		area.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(area.value).toBe('uno dos tres');
		expect(onChange).toHaveBeenLastCalledWith('uno dos tres');
		expect(area.selectionStart).toBe(4);
	});

	test('sin singleLine, los saltos se conservan', () => {
		const onChange = vi.fn();
		const area = setup({ onChange });
		type(area, 'uno\ndos');
		expect(onChange).toHaveBeenLastCalledWith('uno\ndos');
	});

	test('singleLine: Intro no inserta salto (se cancela) y avisa a onEnter', () => {
		const onEnter = vi.fn();
		const area = setup({ singleLine: true, onEnter });
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		area.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(onEnter).toHaveBeenCalledTimes(1);
	});

	test('singleLine: Intro durante una composición de IME no se toca', () => {
		const onEnter = vi.fn();
		const area = setup({ singleLine: true, onEnter });
		const event = new KeyboardEvent('keydown', {
			key: 'Enter',
			isComposing: true,
			bubbles: true,
			cancelable: true
		});
		area.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(onEnter).not.toHaveBeenCalled();
	});

	test('sin singleLine, Intro es el de un textarea: no se cancela', () => {
		const onEnter = vi.fn();
		const area = setup({ onEnter });
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		area.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(onEnter).not.toHaveBeenCalled();
	});

	test('sin field-sizing, el alto se calcula al escribir: scrollHeight + bordes', () => {
		const area = setup();
		vi.spyOn(area, 'scrollHeight', 'get').mockReturnValue(60);
		vi.spyOn(area, 'offsetHeight', 'get').mockReturnValue(30);
		vi.spyOn(area, 'clientHeight', 'get').mockReturnValue(28);
		type(area, 'un título que ocupa varias líneas');
		expect(area.style.height).toBe('62px');
	});
});
