/** Plegado temporal del editor visual: AppShell es el único dueño; el cajón móvil es independiente. */
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import AppShell from './AppShell.svelte';

interface TopbarProps {
	sidebarCollapsed: boolean;
	sidebarOpen: boolean;
	onToggleCollapse: () => void;
	onToggleSidebar: () => void;
}
interface SidebarProps {
	collapsed: boolean;
	open: boolean;
	onClose: () => void;
}

const harness = vi.hoisted(() => ({
	navigate: null as null | ((navigation: { to: { route: { id: string } } | null }) => void),
	topbar: null as TopbarProps | null,
	sidebar: null as SidebarProps | null,
	read: vi.fn(() => false),
	persist: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: NonNullable<typeof harness.navigate>) => (harness.navigate = callback)
}));
vi.mock('$lib/theme/apply', () => ({
	readSidebarCollapsed: harness.read,
	setSidebarCollapsed: harness.persist
}));
// Los hijos consumen las mismas props que el chrome real; no intervienen sus contextos de sesión.
vi.mock('./Topbar.svelte', () => ({
	default: (_anchor: unknown, props: TopbarProps) => {
		harness.topbar = props;
	}
}));
vi.mock('./Sidebar.svelte', () => ({
	default: (_anchor: unknown, props: SidebarProps) => {
		harness.sidebar = props;
	}
}));
vi.mock('./GlobalBanner.svelte', () => ({ default: () => {} }));
vi.mock('./UpdateBanner.svelte', () => ({ default: () => {} }));

let instance: ReturnType<typeof mount> | null = null;
let target: HTMLElement;

function start(saved = false): void {
	harness.read.mockReturnValue(saved);
	instance = mount(AppShell, {
		target,
		props: { children: createRawSnippet(() => ({ render: () => '<p>Contenido</p>' })) }
	});
	flushSync();
}
function navigate(id: string): void {
	harness.navigate!({ to: { route: { id } } });
	flushSync();
}
function toggle(): void {
	harness.topbar!.onToggleCollapse();
	flushSync();
}

beforeEach(() => {
	vi.clearAllMocks();
	harness.navigate = null;
	target = document.createElement('div');
	document.body.appendChild(target);
});
afterEach(async () => {
	if (instance) await unmount(instance);
	instance = null;
	target.remove();
});

describe('AppShell: sidebar durante edición visual', () => {
	test.each([false, true])('entrar pliega sin persistir y salir restaura %s', (saved) => {
		start(saved);
		navigate('/c/[type]');
		expect(harness.sidebar!.collapsed).toBe(saved);
		navigate('/c/[type]/[id]/visual');
		expect(harness.topbar!.sidebarCollapsed).toBe(true);
		expect(harness.sidebar!.collapsed).toBe(true);
		expect(harness.persist).not.toHaveBeenCalled();
		navigate('/c/[type]/[id]');
		expect(harness.sidebar!.collapsed).toBe(saved);
		expect(harness.persist).not.toHaveBeenCalled();
	});

	test('el toggle manual durante edición persiste y se restaura al salir', () => {
		start(true);
		navigate('/c/[type]/[id]/visual');
		toggle();
		expect(harness.persist).toHaveBeenLastCalledWith(false);
		// Navegar entre registros visuales no deshace una apertura manual.
		navigate('/c/[type]/[id]/visual');
		expect(harness.sidebar!.collapsed).toBe(false);
		navigate('/c/[type]');
		expect(harness.sidebar!.collapsed).toBe(false);
		navigate('/c/[type]/[id]/visual');
		expect(harness.sidebar!.collapsed).toBe(true);
		toggle();
		toggle();
		navigate('/c/[type]');
		expect(harness.sidebar!.collapsed).toBe(true);
		expect(harness.persist.mock.calls).toEqual([[false], [false], [true]]);
	});

	test('el cajón móvil abre/cierra aunque escritorio esté plegado y cierra al navegar', () => {
		start();
		navigate('/c/[type]/[id]/visual');
		harness.topbar!.onToggleSidebar();
		flushSync();
		expect(harness.sidebar!.open).toBe(true);
		expect(harness.sidebar!.collapsed).toBe(true);
		expect(target.querySelector('main')!.inert).toBe(true);
		harness.sidebar!.onClose();
		flushSync();
		expect(harness.sidebar!.open).toBe(false);
		harness.topbar!.onToggleSidebar();
		navigate('/c/[type]');
		expect(harness.sidebar!.open).toBe(false);
		expect(harness.sidebar!.collapsed).toBe(false);
		expect(target.querySelector('main')!.inert).toBe(false);
		expect(harness.persist).not.toHaveBeenCalled();
	});
});
