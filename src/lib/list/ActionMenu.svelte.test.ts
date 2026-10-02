/**
 * Suite de `ActionMenu.svelte` (Lote 12, láminas 6 y 7): el teclado del patrón APG «menu button»
 * que el encargo exige y que ningún e2e mide fila a fila — abrir con Enter/Espacio (click nativo
 * del `<button>`) y con flechas, recorrer con flechas circulares y Home/End, Escape que cierra y
 * devuelve el foco, cierre al salir el foco o al pinchar fuera, y la acción que se ejecuta DESPUÉS
 * de devolver el foco al disparador. Montaje real (`mount`), mismo patrón que `RecordTable`.
 *
 * `mountMenu` espera un `tick()` tras montar: `bind:this` se asienta en el primer flush, y un click
 * síncrono justo después de `mount()` llegaría al manejador de ventana con `triggerEl` aún a
 * `null` (medido: el menú se cerraba en el mismo click que lo abría). En un navegador real ese
 * instante no existe.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ActionMenu from './ActionMenu.svelte';
import type { ActionMenuItem } from './action-menu';

interface Mounted {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	outside: HTMLButtonElement;
}

function makeItems(onDuplicate = vi.fn(), onDelete = vi.fn()): ActionMenuItem[] {
	return [
		{
			id: 'duplicate',
			label: 'Duplicar',
			icon: 'copy',
			action: 'duplicate',
			onSelect: onDuplicate
		},
		{
			id: 'delete',
			label: 'Borrar…',
			icon: 'trash',
			tone: 'danger',
			action: 'delete',
			onSelect: onDelete
		}
	];
}

async function mountMenu(
	props: Partial<{
		items: ActionMenuItem[];
		variant: 'button' | 'icon';
		triggerTabindex: 0 | -1;
		anchor: 'below-end' | 'viewport';
		reveal: boolean;
		onTriggerKeydown: (event: KeyboardEvent) => void;
	}> = {}
): Promise<Mounted> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	// Un control AJENO al menú, para medir el cierre al salir el foco y el click fuera.
	const outside = document.createElement('button');
	outside.textContent = 'fuera';
	document.body.appendChild(outside);
	const instance = mount(ActionMenu, {
		target,
		props: {
			id: 'menu-test',
			label: 'Acciones de «Sobre mí»',
			triggerText: 'Más',
			items: props.items ?? makeItems(),
			...props
		}
	});
	await tick();
	return { target, instance, outside };
}

function trigger(m: Mounted): HTMLButtonElement {
	return m.target.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
}

function menu(m: Mounted): HTMLElement | null {
	return m.target.querySelector<HTMLElement>('[role="menu"]');
}

function menuItems(m: Mounted): HTMLButtonElement[] {
	return Array.from(m.target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
}

function key(el: Element | null, keyName: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true });
	(el ?? document.body).dispatchEvent(event);
	return event;
}

/** Abrir mueve el foco tras `tick()`; dos vueltas dejan el DOM y el foco asentados. */
async function settle(): Promise<void> {
	await tick();
	await tick();
}

describe('ActionMenu.svelte — menú de acciones (patrón APG «menu button»)', () => {
	let mounted: Mounted | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted.outside.remove();
			mounted = null;
		}
	});

	test('cerrado: disparador con rol y nombre correctos, sin ningún menuitem en el DOM', async () => {
		mounted = await mountMenu({ variant: 'icon', triggerTabindex: -1 });
		const button = trigger(mounted);
		expect(button.getAttribute('aria-haspopup')).toBe('menu');
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('aria-controls')).toBe('menu-test');
		expect(button.getAttribute('aria-label')).toBe('Acciones de «Sobre mí»');
		expect(button.tabIndex).toBe(-1);
		expect(menu(mounted)).toBeNull();
		expect(menuItems(mounted)).toHaveLength(0);
	});

	test('variante de texto: el rótulo visible es el nombre accesible, sin aria-label', async () => {
		mounted = await mountMenu({ variant: 'button' });
		const button = trigger(mounted);
		expect(button.textContent?.trim()).toBe('Más');
		expect(button.hasAttribute('aria-label')).toBe(false);
		expect(button.tabIndex).toBe(0);
	});

	test('click (Enter/Espacio nativos) abre, marca aria-expanded y lleva el foco a la PRIMERA entrada', async () => {
		mounted = await mountMenu();
		trigger(mounted).click();
		await settle();
		expect(trigger(mounted).getAttribute('aria-expanded')).toBe('true');
		const list = menu(mounted);
		expect(list).not.toBeNull();
		expect(list?.getAttribute('aria-label')).toBe('Acciones de «Sobre mí»');
		const items = menuItems(mounted);
		expect(items.map((item) => item.textContent?.trim())).toEqual(['Duplicar', 'Borrar…']);
		expect(items[0]?.getAttribute('data-action')).toBe('duplicate');
		expect(items[1]?.getAttribute('data-action')).toBe('delete');
		expect(items[1]?.getAttribute('data-tone')).toBe('danger');
		expect(items[0]?.hasAttribute('data-tone')).toBe(false);
		expect(document.activeElement).toBe(items[0]);
	});

	test('ArrowDown sobre el disparador cerrado abre el menú (APG)', async () => {
		mounted = await mountMenu();
		trigger(mounted).focus();
		const event = key(trigger(mounted), 'ArrowDown');
		await settle();
		expect(event.defaultPrevented).toBe(true);
		expect(menu(mounted)).not.toBeNull();
		expect(document.activeElement).toBe(menuItems(mounted)[0]);
	});

	test('flechas CIRCULARES y Home/End dentro del menú', async () => {
		mounted = await mountMenu();
		trigger(mounted).click();
		await settle();
		const [first, second] = menuItems(mounted);
		expect(document.activeElement).toBe(first);
		key(first, 'ArrowDown');
		expect(document.activeElement).toBe(second);
		key(second, 'ArrowDown'); // circular: vuelve al primero
		expect(document.activeElement).toBe(first);
		key(first, 'ArrowUp'); // circular hacia arriba: al último
		expect(document.activeElement).toBe(second);
		key(second, 'Home');
		expect(document.activeElement).toBe(first);
		key(first, 'End');
		expect(document.activeElement).toBe(second);
	});

	test('Escape cierra y DEVUELVE EL FOCO al disparador', async () => {
		mounted = await mountMenu();
		trigger(mounted).click();
		await settle();
		const event = key(document.activeElement, 'Escape');
		await settle();
		expect(event.defaultPrevented).toBe(true);
		expect(menu(mounted)).toBeNull();
		expect(trigger(mounted).getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger(mounted));
	});

	test('elegir una entrada: cierra, devuelve el foco al disparador y DESPUÉS ejecuta la acción', async () => {
		const order: string[] = [];
		const onDuplicate = vi.fn(() => {
			order.push(`select:${document.activeElement === trigger(mounted!) ? 'trigger' : 'other'}`);
		});
		mounted = await mountMenu({ items: makeItems(onDuplicate) });
		trigger(mounted).click();
		await settle();
		menuItems(mounted)[0]?.click();
		await settle();
		expect(onDuplicate).toHaveBeenCalledTimes(1);
		// El foco ya estaba en el disparador cuando corrió la acción (un diálogo que abra lo
		// restaurará ahí al cerrarse).
		expect(order).toEqual(['select:trigger']);
		expect(menu(mounted)).toBeNull();
	});

	test('la entrada de peligro llama a SU acción, no a la otra', async () => {
		const onDuplicate = vi.fn();
		const onDelete = vi.fn();
		mounted = await mountMenu({ items: makeItems(onDuplicate, onDelete) });
		trigger(mounted).click();
		await settle();
		menuItems(mounted)[1]?.click();
		await settle();
		expect(onDelete).toHaveBeenCalledTimes(1);
		expect(onDuplicate).not.toHaveBeenCalled();
	});

	test('el foco sale del menú hacia otro control: se cierra', async () => {
		mounted = await mountMenu();
		trigger(mounted).click();
		await settle();
		expect(menu(mounted)).not.toBeNull();
		mounted.outside.focus();
		await settle();
		expect(menu(mounted)).toBeNull();
	});

	test('un click fuera del menú lo cierra; un click dentro no', async () => {
		mounted = await mountMenu();
		trigger(mounted).click();
		await settle();
		menu(mounted)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(menu(mounted)).not.toBeNull();
		mounted.outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(menu(mounted)).toBeNull();
	});

	test('con el menú cerrado, una tecla que no abre se ofrece al contenedor (onTriggerKeydown)', async () => {
		const onTriggerKeydown = vi.fn();
		mounted = await mountMenu({ onTriggerKeydown });
		key(trigger(mounted), 'ArrowLeft');
		expect(onTriggerKeydown).toHaveBeenCalledTimes(1);
		expect(onTriggerKeydown.mock.calls[0]?.[0]).toMatchObject({ key: 'ArrowLeft' });
		// Abierto, la misma tecla ya no se ofrece: el menú es quien manda.
		trigger(mounted).click();
		await settle();
		key(trigger(mounted), 'ArrowLeft');
		expect(onTriggerKeydown).toHaveBeenCalledTimes(1);
	});

	test('anchor="viewport": el menú se pinta anclado a la ventana con coordenadas y dirección', async () => {
		mounted = await mountMenu({ anchor: 'viewport', variant: 'icon', triggerTabindex: -1 });
		trigger(mounted).click();
		await settle();
		const list = menu(mounted)!;
		expect(list.classList.contains('vega-action-menu-list--viewport')).toBe(true);
		// jsdom no mide cajas (todo 0): basta con que haya coordenadas y dirección resueltas.
		expect(list.getAttribute('style')).toMatch(/right: \d+px; top: \d+px;/);
		expect(list.getAttribute('data-direction')).toBe('down');
	});

	test('anchor="viewport": un desplazamiento mientras está abierto lo RECOLOCA, no lo cierra', async () => {
		mounted = await mountMenu({ anchor: 'viewport' });
		trigger(mounted).click();
		await settle();
		const before = menu(mounted)?.getAttribute('style');
		// La caja del disparador «se mueve» 100 px (el navegador no mide en jsdom: se simula).
		trigger(mounted).getBoundingClientRect = () =>
			({
				top: 100,
				right: 300,
				bottom: 128,
				left: 272,
				width: 28,
				height: 28,
				x: 272,
				y: 100
			}) as DOMRect;
		window.dispatchEvent(new Event('scroll'));
		await settle();
		expect(menu(mounted)).not.toBeNull();
		expect(menu(mounted)?.getAttribute('style')).not.toBe(before);
		expect(menu(mounted)?.getAttribute('style')).toContain('top: 134px;');
	});

	test('anchor="below-end" (por defecto): sin coordenadas inline, la coloca el CSS', async () => {
		mounted = await mountMenu();
		trigger(mounted).click();
		await settle();
		expect(menu(mounted)?.hasAttribute('style')).toBe(false);
	});
});
