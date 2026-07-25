/**
 * Suite de `PreviewPanel.svelte` (lote "publicación", fase B): la petición inicial al montar
 * (`POST {apiUrl}/token`, `Authorization` sin `Bearer`, cuerpo `{collection, id}`), los tres
 * estados (cargando/listo/error con reintento), el refresco manual y el automático por
 * `refreshToken`, y que el temporizador de renovación se cancela al desmontar. Montaje real
 * (proyecto vitest `component`, `mount`/`unmount` de Svelte 5), mismo patrón que
 * `shell/PublishButton.svelte.test.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PreviewPanel from './PreviewPanel.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** Ver `PublishButton.svelte.test.ts`: espera un macrotask real (para drenar la cadena de
 *  microtasks de `requestPreview`) + un `tick()` de Svelte para reflejar el `$state` en el DOM. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

function fakeCtx(): VegaAppContext {
	return {
		session: { token: 'tok-123', user: { id: 'u1', email: 'a@b.test' }, expiresAt: null },
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key
	} as unknown as VegaAppContext;
}

function mountPanel(initial: { refreshToken: number; onClose: () => void }): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	props: { refreshToken: number };
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	// Props REACTIVAS (`$state`), mismo patrón que `RecordBlocks.svelte.test.ts`: `RecordForm` pasa
	// `refreshToken={savedCount}` sobre el MISMO panel montado (nunca lo remonta al guardar), así
	// que ejercer el refresco automático exige mutar la prop sobre un montaje vivo, no crear uno
	// nuevo con el valor ya puesto.
	const props = $state({
		apiBasePath: 'https://pb.test/api/vega-preview',
		collection: 'posts',
		recordId: 'rec-1',
		...initial
	});
	const instance = mount(PreviewPanel, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]]),
		props
	});
	return { target, instance, props };
}

describe('PreviewPanel.svelte', () => {
	let mounted: ReturnType<typeof mountPanel> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test('al montar: POST {apiUrl}/token con Authorization sin "Bearer" y {collection, id}', async () => {
		const token = {
			url: 'https://site.test/preview/posts/rec-1?token=abc',
			expiresAt: '2099-01-01T00:00:00.000Z'
		};
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(token));
		vi.stubGlobal('fetch', fetchMock);

		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush();

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://pb.test/api/vega-preview/token');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('tok-123');
		expect(JSON.parse(String(init.body))).toEqual({ collection: 'posts', id: 'rec-1' });

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-preview-panel-frame');
		expect(iframe?.src).toBe(token.url);
		// Antes del evento `load` del iframe, sigue el overlay "cargando…" (nunca en blanco).
		expect(mounted.target.querySelector('.vega-preview-panel-overlay')).not.toBeNull();
	});

	test('el overlay "cargando" desaparece tras el evento `load` del iframe', async () => {
		const token = {
			url: 'https://site.test/preview/posts/rec-1',
			expiresAt: '2099-01-01T00:00:00.000Z'
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(token)));
		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush();

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-preview-panel-frame');
		iframe?.dispatchEvent(new Event('load'));
		await tick();

		expect(mounted.target.querySelector('.vega-preview-panel-overlay')).toBeNull();
	});

	test('respuesta no-2xx: estado de error explícito con botón de reintento, nunca un iframe vacío', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush();

		expect(mounted.target.querySelector('.vega-preview-panel-frame')).toBeNull();
		const message = mounted.target.querySelector('[role="alert"]');
		expect(message).not.toBeNull();
		expect(message?.textContent).toContain('503');
	});

	test('reintentar tras un error vuelve a pedir el token', async () => {
		const token = {
			url: 'https://site.test/preview/posts/rec-1',
			expiresAt: '2099-01-01T00:00:00.000Z'
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('nope', { status: 503 }))
			.mockResolvedValueOnce(jsonResponse(token));
		vi.stubGlobal('fetch', fetchMock);
		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush();

		const retryButton = mounted.target.querySelector<HTMLButtonElement>(
			'.vega-preview-panel-message button'
		);
		retryButton?.click();
		await flush();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(mounted.target.querySelector('.vega-preview-panel-frame')).not.toBeNull();
	});

	test('subir "refreshToken" (un guardado) dispara un refresco automático', async () => {
		const token = {
			url: 'https://site.test/preview/posts/rec-1',
			expiresAt: '2099-01-01T00:00:00.000Z'
		};
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(token));
		vi.stubGlobal('fetch', fetchMock);
		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		mounted.props.refreshToken = 1;
		await flush();

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test('botón "Actualizar" pide un token nuevo a mano', async () => {
		const token = {
			url: 'https://site.test/preview/posts/rec-1',
			expiresAt: '2099-01-01T00:00:00.000Z'
		};
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(token));
		vi.stubGlobal('fetch', fetchMock);
		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const refreshButton = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-preview-panel-button'
		)[0];
		refreshButton?.click();
		await flush();

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test('botón "Cerrar" llama a onClose', async () => {
		const token = {
			url: 'https://site.test/preview/posts/rec-1',
			expiresAt: '2099-01-01T00:00:00.000Z'
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(token)));
		const onClose = vi.fn();
		mounted = mountPanel({ refreshToken: 0, onClose });
		await flush();

		const closeButton = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-preview-panel-button'
		)[1];
		closeButton?.click();

		expect(onClose).toHaveBeenCalledOnce();
	});

	test('desmontar cancela la renovación programada (temporizadores REALES, ver cabecera del módulo)', async () => {
		// Mismo criterio que `PublishButton.svelte.test.ts` (ver su cabecera): temporizadores REALES
		// a propósito, `vi.useFakeTimers()` no garantiza drenar la cadena de microtasks de
		// `onMount` → `requestPreview` → `scheduleRenew` de un componente montado de verdad. En vez
		// de esperar la ventana real de `RENEW_BUFFER_MS`, se espía `clearTimeout` global: confirma
		// que `onDestroy` limpia el temporizador pendiente sin depender del reloj.
		const token = {
			url: 'https://site.test/preview/posts/rec-1',
			expiresAt: new Date(Date.now() + 3600000).toISOString() // caduca en 1h: de sobra
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(token)));
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

		mounted = mountPanel({ refreshToken: 0, onClose: vi.fn() });
		await flush(); // llega a 'ready' → `scheduleRenew` programa el temporizador

		const toUnmount = mounted.instance;
		const target = mounted.target;
		mounted = null;
		await unmount(toUnmount);
		target.remove();

		expect(clearTimeoutSpy).toHaveBeenCalled();
	});
});
