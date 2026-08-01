/**
 * Suite de componente de `VisualColumnResizer.svelte`: teclado, doble clic y arrastre por
 * puntero, sin ratón real (mismo criterio de "lo que se puede probar sin ratón" del encargo) —
 * el arrastre se ejercita disparando `PointerEvent`s sintéticos, no moviendo un cursor de
 * verdad. Sin `VegaAppContext`: este componente no usa `ctx.t()` ni ningún otro dato de
 * contexto, así que un montaje mínimo basta (a diferencia de `VisualBlockTree.svelte.test.ts`).
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualColumnResizer from './VisualColumnResizer.svelte';

interface MountResult {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	handle: HTMLElement;
}

function mountResizer(props: {
	value: number;
	min: number;
	max: number;
	defaultValue: number;
	sign: 1 | -1;
	onResize: (next: number) => void;
	onDragChange?: (dragging: boolean) => void;
}): MountResult {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualColumnResizer, {
		target,
		props: { label: 'Ajustar ancho', onDragChange: () => {}, ...props }
	});
	const handle = target.querySelector<HTMLElement>('.vega-col-resizer')!;
	return { target, instance, handle };
}

let mounted: MountResult | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

describe('atributos de accesibilidad', () => {
	test('role="separator" + orientación vertical + el trío aria-valuenow/min/max', () => {
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize: () => {}
		});
		const { handle } = mounted;
		expect(handle.getAttribute('role')).toBe('separator');
		expect(handle.getAttribute('aria-orientation')).toBe('vertical');
		expect(handle.getAttribute('aria-valuenow')).toBe('300');
		expect(handle.getAttribute('aria-valuemin')).toBe('220');
		expect(handle.getAttribute('aria-valuemax')).toBe('480');
		expect(handle.getAttribute('aria-label')).toBe('Ajustar ancho');
		expect(handle.getAttribute('tabindex')).toBe('0');
	});
});

describe('teclado', () => {
	test('sign=1 (columna a la izquierda): ArrowRight suma 16, ArrowLeft resta 16', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
		);
		expect(onResize).toHaveBeenLastCalledWith(316);
		mounted.handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(onResize).toHaveBeenLastCalledWith(284);
	});

	test('sign=-1 (columna a la derecha, p.ej. inspector): ArrowRight RESTA, ArrowLeft SUMA', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 320,
			min: 260,
			max: 520,
			defaultValue: 320,
			sign: -1,
			onResize
		});
		mounted.handle.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
		);
		expect(onResize).toHaveBeenLastCalledWith(304);
		mounted.handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(onResize).toHaveBeenLastCalledWith(336);
	});

	test('Home → el mínimo, End → el máximo, sin importar el sign', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		expect(onResize).toHaveBeenLastCalledWith(220);
		mounted.handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		expect(onResize).toHaveBeenLastCalledWith(480);
	});

	test('tope: a un paso del máximo, ArrowRight recorta a max en vez de pasarse', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 470,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
		);
		expect(onResize).toHaveBeenLastCalledWith(480); // 470+16=486, recortado a 480
	});

	test('tope: a un paso del mínimo, ArrowLeft recorta a min en vez de pasarse', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 225,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(onResize).toHaveBeenLastCalledWith(220); // 225-16=209, recortado a 220
	});

	test('otra tecla cualquiera no llama a onResize', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		expect(onResize).not.toHaveBeenCalled();
	});
});

describe('doble clic', () => {
	test('devuelve defaultValue, aunque esté lejos del valor actual', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 460,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(onResize).toHaveBeenCalledWith(280);
	});
});

describe('arrastre por puntero', () => {
	test('mover a la derecha agranda con sign=1, avisa onDragChange(true) y luego (false)', () => {
		const onResize = vi.fn();
		const onDragChange = vi.fn();
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize,
			onDragChange
		});
		mounted.handle.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 })
		);
		expect(onDragChange).toHaveBeenCalledWith(true);

		window.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, pointerId: 1 }));
		expect(onResize).toHaveBeenLastCalledWith(350); // 300 + (150-100)*1

		window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
		expect(onDragChange).toHaveBeenLastCalledWith(false);
	});

	test('mover a la derecha ENCOGE con sign=-1 (manilla del inspector)', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 320,
			min: 260,
			max: 520,
			defaultValue: 320,
			sign: -1,
			onResize
		});
		mounted.handle.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, pointerId: 1 })
		);
		window.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, pointerId: 1 }));
		expect(onResize).toHaveBeenLastCalledWith(270); // 320 + (250-200)*-1
	});

	test('arrastrar más allá del máximo se recorta, no se pasa', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 460,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, pointerId: 1 })
		);
		window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1000, pointerId: 1 }));
		expect(onResize).toHaveBeenLastCalledWith(480);
	});

	test('tras soltar (pointerup), un pointermove posterior ya no llama a onResize', () => {
		const onResize = vi.fn();
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize
		});
		mounted.handle.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, pointerId: 1 })
		);
		window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
		onResize.mockClear();
		window.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, pointerId: 1 }));
		expect(onResize).not.toHaveBeenCalled();
	});

	test('clic con un botón que no es el principal no arranca el arrastre', () => {
		const onDragChange = vi.fn();
		mounted = mountResizer({
			value: 300,
			min: 220,
			max: 480,
			defaultValue: 280,
			sign: 1,
			onResize: () => {},
			onDragChange
		});
		mounted.handle.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 2, clientX: 100, pointerId: 1 })
		);
		expect(onDragChange).not.toHaveBeenCalled();
	});
});
