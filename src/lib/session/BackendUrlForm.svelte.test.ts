/**
 * Suite de `BackendUrlForm.svelte` (lote L5, distribución/onboarding genérico): estado actual
 * (same-origin/override), validación de URL antes de guardar, y "Probar conexión" best-effort.
 * Montaje real (proyecto vitest `component`, ver `vite.config.ts`; Svelte 5 `mount()`/
 * `unmount()`), mismo patrón que `form/FieldRow.svelte.test.ts` — sin `VegaAppContext`: el
 * componente recibe `t` como prop (se monta en `/login`, SIN contexto, y en `/settings`, CON
 * contexto — ver la cabecera del propio componente).
 *
 * `t` de prueba es un passthrough que expone la clave (y los params, si los hay) tal cual, para
 * poder aserta sobre el TEXTO renderizado sin acoplarse a la redacción real de `es.ts`/`en.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import BackendUrlForm from './BackendUrlForm.svelte';
import { writeBackendOverride } from './backend-override';

function t(key: string, params?: Record<string, string | number>): string {
	return params ? `${key}:${JSON.stringify(params)}` : key;
}

function mountForm(confirmBeforeReload = false): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(BackendUrlForm, { target, props: { t, confirmBeforeReload } });
	return { target, instance };
}

/** `window.location.reload` NO es reconfigurable en jsdom (`vi.spyOn` lanza "Cannot redefine
 *  property"): se sustituye el global `location` ENTERO (mismo criterio que `vi.stubGlobal` para
 *  `fetch` más abajo), con un stub mínimo — el componente solo llama a `.reload()`. */
function stubLocationReload(): ReturnType<typeof vi.fn> {
	const reload = vi.fn();
	vi.stubGlobal('location', { ...window.location, reload });
	return reload;
}

describe('BackendUrlForm.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test('sin override guardado: estado "same-origin", sin botón de restablecer', () => {
		mounted = mountForm();

		expect(mounted.target.textContent).toContain('connect.current.sameOrigin');
		expect(
			Array.from(mounted.target.querySelectorAll('button')).some((b) =>
				b.textContent?.includes('connect.reset')
			)
		).toBe(false);
	});

	test('con override guardado: muestra la URL actual y el botón de restablecer', () => {
		writeBackendOverride('https://pb.example.com');
		mounted = mountForm();

		expect(mounted.target.textContent).toContain('connect.current.override');
		expect(mounted.target.textContent).toContain('https://pb.example.com');
		const resetButton = Array.from(mounted.target.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('connect.reset')
		);
		expect(resetButton).not.toBeUndefined();
	});

	test('URL inválida al guardar: muestra el error, no persiste nada', async () => {
		mounted = mountForm();

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		const form = mounted.target.querySelector('form');
		expect(input).not.toBeNull();
		expect(form).not.toBeNull();

		input!.value = 'no-es-una-url';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();

		expect(mounted.target.querySelector('[role="alert"]')?.textContent).toBe('connect.invalidUrl');
		expect(localStorage.getItem('vega.backendUrl.v1')).toBeNull();
	});

	test('URL válida al guardar: persiste el override y recarga la página', async () => {
		const reloadSpy = stubLocationReload();
		mounted = mountForm();

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		const form = mounted.target.querySelector('form');

		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();

		expect(localStorage.getItem('vega.backendUrl.v1')).toBe('https://pb.example.com');
		expect(reloadSpy).toHaveBeenCalledTimes(1);
	});

	test('restablecer: borra el override y recarga la página', async () => {
		writeBackendOverride('https://pb.example.com');
		const reloadSpy = stubLocationReload();
		mounted = mountForm();

		const resetButton = Array.from(mounted.target.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('connect.reset')
		);
		resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();

		expect(localStorage.getItem('vega.backendUrl.v1')).toBeNull();
		expect(reloadSpy).toHaveBeenCalledTimes(1);
	});

	test('probar conexión: éxito best-effort muestra el resultado OK sin bloquear el guardado', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		mounted = mountForm();

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));

		const testButton = Array.from(mounted.target.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('connect.test')
		);
		testButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();

		expect(mounted.target.querySelector('[role="status"]')?.textContent).toBe('connect.testOk');
	});

	test('probar conexión: fallo de red (p.ej. CORS) muestra el resultado de fallo, honesto pero no bloqueante', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		mounted = mountForm();

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));

		const testButton = Array.from(mounted.target.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('connect.test')
		);
		testButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();

		expect(mounted.target.querySelector('[role="status"]')?.textContent).toBe('connect.testFail');
	});

	// ————— Fix de code-review de L5: resultado de "Probar conexión" obsoleto al editar la URL —————

	test('editar la URL tras "Probar conexión" limpia el resultado (ya no es del A probado)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		mounted = mountForm();

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		input!.value = 'https://a.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));

		const testButton = Array.from(mounted.target.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('connect.test')
		);
		testButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		expect(mounted.target.querySelector('[role="status"]')?.textContent).toBe('connect.testOk');

		// Edita a B SIN volver a probar: el resultado de A ya no pinta nada.
		input!.value = 'https://b.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		expect(mounted.target.querySelector('[role="status"]')).toBeNull();
	});

	test('editar la URL tras un error de validación también lo limpia', async () => {
		mounted = mountForm();

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		const form = mounted.target.querySelector('form');
		input!.value = 'no-es-una-url';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();
		expect(mounted.target.querySelector('[role="alert"]')).not.toBeNull();

		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		expect(mounted.target.querySelector('[role="alert"]')).toBeNull();
	});

	// ————— Fix de code-review de L5: `confirmBeforeReload` (footgun de /settings) —————

	test('confirmBeforeReload=false (default, /login): Guardar NO llama a confirm()', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm');
		const reloadSpy = stubLocationReload();
		mounted = mountForm(false);

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		const form = mounted.target.querySelector('form');
		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();

		expect(confirmSpy).not.toHaveBeenCalled();
		expect(localStorage.getItem('vega.backendUrl.v1')).toBe('https://pb.example.com');
		expect(reloadSpy).toHaveBeenCalledTimes(1);
	});

	test('confirmBeforeReload=true (/settings), usuario CONFIRMA: guarda y recarga', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const reloadSpy = stubLocationReload();
		mounted = mountForm(true);

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		const form = mounted.target.querySelector('form');
		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();

		expect(confirmSpy).toHaveBeenCalledWith('connect.reloadConfirm');
		expect(localStorage.getItem('vega.backendUrl.v1')).toBe('https://pb.example.com');
		expect(reloadSpy).toHaveBeenCalledTimes(1);
	});

	test('confirmBeforeReload=true (/settings), usuario CANCELA: no persiste ni recarga (estado consistente)', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const reloadSpy = stubLocationReload();
		mounted = mountForm(true);

		const input = mounted.target.querySelector<HTMLInputElement>('#backend-url');
		const form = mounted.target.querySelector('form');
		input!.value = 'https://pb.example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();

		expect(confirmSpy).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem('vega.backendUrl.v1')).toBeNull();
		expect(reloadSpy).not.toHaveBeenCalled();
	});

	test('confirmBeforeReload=true, Restablecer con CANCELA: no borra el override guardado ni recarga', async () => {
		writeBackendOverride('https://pb.example.com');
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const reloadSpy = stubLocationReload();
		mounted = mountForm(true);

		const resetButton = Array.from(mounted.target.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('connect.reset')
		);
		resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();

		expect(confirmSpy).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem('vega.backendUrl.v1')).toBe('https://pb.example.com');
		expect(reloadSpy).not.toHaveBeenCalled();
	});
});
