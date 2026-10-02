/**
 * Suite de `Topbar.svelte` (lote 12): la densidad Cómoda/Compacta vive en el menú de cuenta
 * (lámina 3) y la marca de la barra es un enlace a la portada (lámina 1, estado 1.7).
 *
 * Garantías que tenía el `DensityToggle` retirado y que se conservan aquí: la opción activa se
 * lee de `data-density` al montar, elegir FIJA (no cicla) la densidad y la persiste en
 * `vega.density.v1`, elegir la ya activa no hace nada, y la opción activa se marca para los
 * lectores de pantalla (antes `aria-pressed`, ahora `aria-checked` de un `menuitemradio`).
 * Montaje real (proyecto `component`), con `t` de verdad para buscar por el texto que ve el usuario.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Topbar from './Topbar.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { SESSION_CONTEXT_KEY } from '$lib/session/session.svelte';
import { t } from '$lib/i18n';
import { STORAGE_KEYS } from '$lib/theme/preferences';

interface Harness {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	nav: { toIndex: ReturnType<typeof vi.fn>; toSettings: ReturnType<typeof vi.fn> };
}

function mountTopbar(): Harness {
	const nav = { toIndex: vi.fn(), toSettings: vi.fn() };
	const ctx = {
		port: { buildApiUrl: null },
		model: { site: { name: 'Sitio de prueba' }, types: [], nav: { groups: [] } },
		session: { token: 'tok', user: { id: 'u1', email: 'ana@vega.test' }, expiresAt: null },
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		locale: 'es',
		icons: { knownIcons: [], has: () => true },
		nav,
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;
	const session = { status: 'ready', logout: vi.fn() };
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Topbar, {
		target,
		props: {
			sidebarOpen: false,
			onToggleSidebar: () => {},
			sidebarCollapsed: false,
			onToggleCollapse: () => {}
		},
		context: new Map<unknown, unknown>([
			[VEGA_CONTEXT_KEY, ctx],
			[SESSION_CONTEXT_KEY, session]
		])
	});
	// Los `bind:this` (disparador y menú) se enlazan en un efecto: sin vaciarlos, un click inmediato
	// llegaría al manejador de ventana con el disparador aún sin enlazar y cerraría el menú.
	flushSync();
	return { target, instance, nav };
}

describe('Topbar.svelte: densidad en el menú de cuenta y marca como enlace', () => {
	let h: Harness | null = null;

	function trigger(): HTMLButtonElement {
		return h!.target.querySelector<HTMLButtonElement>('.vega-topbar-user-trigger')!;
	}
	function menu(): HTMLElement | null {
		return h!.target.querySelector<HTMLElement>('[role="menu"]');
	}
	function radio(name: string): HTMLElement {
		return Array.from(h!.target.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
			(el) => el.textContent?.trim() === name
		)!;
	}
	function settingsItem(): HTMLElement {
		return h!.target.querySelector<HTMLElement>('[role="menuitem"]')!;
	}
	async function openMenu(): Promise<void> {
		trigger().click();
		await tick();
	}
	function key(el: Element | Window, k: string): void {
		el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
	}

	beforeEach(() => {
		localStorage.clear();
		document.documentElement.dataset.density = 'comfortable';
	});

	afterEach(async () => {
		if (h) {
			await unmount(h.instance);
			h.target.remove();
			h = null;
		}
		delete document.documentElement.dataset.density;
		localStorage.clear();
	});

	test('la barra ya no lleva el segmentado de densidad: solo existe dentro del menú', async () => {
		h = mountTopbar();
		await tick();
		expect(h.target.querySelector('.vega-density-toggle')).toBeNull();
		expect(h.target.querySelector('[role="menuitemradio"]')).toBeNull();
		expect(menu()).toBeNull();
		await openMenu();
		expect(h.target.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2);
	});

	test('el menú abre con la densidad vigente marcada (aria-checked) y un rótulo de grupo', async () => {
		h = mountTopbar();
		await openMenu();
		expect(trigger().getAttribute('aria-expanded')).toBe('true');
		const group = h.target.querySelector<HTMLElement>('[role="group"]')!;
		const labelId = group.getAttribute('aria-labelledby')!;
		expect(document.getElementById(labelId)?.textContent?.trim()).toBe('Densidad');
		expect(radio('Cómoda').getAttribute('aria-checked')).toBe('true');
		expect(radio('Compacta').getAttribute('aria-checked')).toBe('false');
	});

	test('al abrir lee la densidad aplicada al documento (p. ej. cambiada desde Ajustes)', async () => {
		h = mountTopbar();
		document.documentElement.dataset.density = 'compact';
		await openMenu();
		expect(radio('Compacta').getAttribute('aria-checked')).toBe('true');
		expect(radio('Cómoda').getAttribute('aria-checked')).toBe('false');
	});

	test('elegir Compacta la FIJA en el documento, la persiste y el menú sigue abierto', async () => {
		h = mountTopbar();
		await openMenu();
		radio('Compacta').click();
		await tick();
		expect(document.documentElement.dataset.density).toBe('compact');
		expect(localStorage.getItem(STORAGE_KEYS.density)).toBe('compact');
		expect(radio('Compacta').getAttribute('aria-checked')).toBe('true');
		expect(radio('Cómoda').getAttribute('aria-checked')).toBe('false');
		expect(menu()).not.toBeNull();
		expect(trigger().getAttribute('aria-expanded')).toBe('true');
	});

	test('elegir la opción ya activa no cicla ni reescribe nada', async () => {
		h = mountTopbar();
		await openMenu();
		radio('Cómoda').click();
		await tick();
		expect(document.documentElement.dataset.density).toBe('comfortable');
		expect(localStorage.getItem(STORAGE_KEYS.density)).toBeNull();
		expect(radio('Cómoda').getAttribute('aria-checked')).toBe('true');
	});

	test('volver a Cómoda tras Compacta también se aplica y se guarda', async () => {
		h = mountTopbar();
		await openMenu();
		radio('Compacta').click();
		await tick();
		radio('Cómoda').click();
		await tick();
		expect(document.documentElement.dataset.density).toBe('comfortable');
		expect(localStorage.getItem(STORAGE_KEYS.density)).toBe('comfortable');
	});

	test('lectores de pantalla: roles de menú, dos radios y «Ajustes» como menuitem, sin aria-pressed', async () => {
		h = mountTopbar();
		await openMenu();
		expect(menu()!.getAttribute('aria-label')).toBe('Menú de cuenta');
		expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
		const radios = h.target.querySelectorAll('[role="menuitemradio"]');
		expect(radios).toHaveLength(2);
		for (const r of radios) expect(r.hasAttribute('aria-pressed')).toBe(false);
		expect(settingsItem().textContent?.trim()).toBe('Ajustes');
		// Las densidades van ENCIMA de «Ajustes» (lámina 3).
		expect(
			radio('Compacta').compareDocumentPosition(settingsItem()) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	test('teclado: ArrowDown en el disparador abre y enfoca la primera opción; ArrowUp, la última', async () => {
		h = mountTopbar();
		key(trigger(), 'ArrowDown');
		await tick();
		await tick();
		expect(document.activeElement).toBe(radio('Cómoda'));
		// Se cierra y se repite con ArrowUp.
		key(window, 'Escape');
		await tick();
		expect(menu()).toBeNull();
		key(trigger(), 'ArrowUp');
		await tick();
		await tick();
		expect(document.activeElement).toBe(settingsItem());
	});

	test('teclado: flechas recorren Cómoda, Compacta y Ajustes con vuelta; Inicio y Fin saltan a los extremos', async () => {
		h = mountTopbar();
		key(trigger(), 'ArrowDown');
		await tick();
		await tick();
		const menuEl = menu()!;
		key(menuEl, 'ArrowDown');
		expect(document.activeElement).toBe(radio('Compacta'));
		key(menuEl, 'ArrowDown');
		expect(document.activeElement).toBe(settingsItem());
		key(menuEl, 'ArrowDown');
		expect(document.activeElement).toBe(radio('Cómoda'));
		key(menuEl, 'ArrowUp');
		expect(document.activeElement).toBe(settingsItem());
		key(menuEl, 'Home');
		expect(document.activeElement).toBe(radio('Cómoda'));
		key(menuEl, 'End');
		expect(document.activeElement).toBe(settingsItem());
	});

	test('teclado: Escape cierra el menú y devuelve el foco al botón', async () => {
		h = mountTopbar();
		key(trigger(), 'ArrowDown');
		await tick();
		await tick();
		expect(document.activeElement).toBe(radio('Cómoda'));
		key(window, 'Escape');
		await tick();
		expect(menu()).toBeNull();
		expect(trigger().getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger());
	});

	test('un click fuera cierra el menú; uno dentro (en una opción) no', async () => {
		h = mountTopbar();
		await openMenu();
		radio('Compacta').click();
		await tick();
		expect(menu()).not.toBeNull();
		document.body.click();
		await tick();
		expect(menu()).toBeNull();
	});

	test('«Ajustes» sigue navegando por ctx.nav y cierra el menú', async () => {
		h = mountTopbar();
		await openMenu();
		settingsItem().click();
		await tick();
		expect(h.nav.toSettings).toHaveBeenCalledTimes(1);
		expect(menu()).toBeNull();
	});

	test('la marca es un enlace a la portada: href "/", nombre accesible «Inicio», título con el sitio', async () => {
		h = mountTopbar();
		const brand = h.target.querySelector<HTMLAnchorElement>('a.vega-topbar-site')!;
		expect(brand).not.toBeNull();
		expect(brand.getAttribute('href')).toBe('/');
		expect(brand.getAttribute('aria-label')).toBe('Inicio');
		expect(brand.getAttribute('title')).toBe('Sitio de prueba');
		expect(brand.textContent).toContain('Vega');
		expect(brand.textContent).toContain('Sitio de prueba');
	});

	test('click normal en la marca navega por ctx.nav.toIndex; uno modificado sigue el href', async () => {
		h = mountTopbar();
		const brand = h.target.querySelector<HTMLAnchorElement>('a.vega-topbar-site')!;
		const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
		brand.dispatchEvent(plain);
		expect(plain.defaultPrevented).toBe(true);
		expect(h.nav.toIndex).toHaveBeenCalledTimes(1);

		const modified = new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			button: 0,
			ctrlKey: true
		});
		brand.dispatchEvent(modified);
		expect(modified.defaultPrevented).toBe(false);
		expect(h.nav.toIndex).toHaveBeenCalledTimes(1);
	});
});
