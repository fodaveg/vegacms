/**
 * Suite de componente de `VisualEditorScreen.svelte` (tarea "pantalla del editor visual"):
 * montaje real (mismo patrón que `PreviewPanel.svelte.test.ts`), centrada en lo que esta pantalla
 * posee y `bridge-client.ts` no puede probar por sí solo — el cableado con el DOM real: el
 * escuchador de `message` se registra en `onMount` y se da de baja en `onDestroy`, un mensaje del
 * origen bueno llega al cliente y pinta "conectado", y un estado de error pinta su texto con un
 * botón que vuelve a llamar a `start()`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import VisualEditorScreen from './VisualEditorScreen.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { t as translate } from '$lib/i18n';
import type { ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';

const PREVIEW_ORIGIN = 'https://sitio.test';
const TOKEN_URL = `${PREVIEW_ORIGIN}/preview/post/rec-1?token=abc`;

const TYPE: ResolvedContentType = {
	schema: { name: 'post', readonly: false, fields: [] },
	name: 'post',
	label: 'Entradas',
	labelSingular: 'Entrada',
	icon: null,
	hidden: false,
	group: null,
	singleton: false,
	permissions: ALL_PERMISSIONS,
	readonly: false,
	titleField: 'title',
	subtitleField: null,
	slugField: null,
	orderField: null,
	defaultSort: null,
	statusField: null,
	statusLabels: null,
	previewUrl: null,
	fields: [
		{
			schema: {
				name: 'title',
				type: 'text',
				subtype: 'plain',
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			},
			name: 'title',
			label: 'Título',
			help: null,
			placeholder: null,
			hidden: false,
			group: null,
			widget: 'text',
			subtype: 'plain',
			listable: true
		}
	],
	listFields: [],
	fieldGroups: [],
	editorRail: false
};

const RECORD: VegaRecord = { id: 'rec-1', type: 'post', values: { title: 'Hola mundo' } };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function tokenBody(): { url: string; expiresAt: string } {
	return { url: TOKEN_URL, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
}

/** Token que caduca enseguida: la renovación se programa 15 s ANTES de `expiresAt`
 *  (`RENEW_BUFFER_MS`), así que `+15_030 ms` la dispara a los ~30 ms y el ciclo de renovación se
 *  puede ejercer con temporizadores REALES, sin pelearse con los falsos. */
function expiringTokenBody(): { url: string; expiresAt: string } {
	return { url: TOKEN_URL, expiresAt: new Date(Date.now() + 15_030).toISOString() };
}

/** `matchMedia` de mentira (jsdom no lo trae). `narrow` decide de qué lado del punto de corte de
 *  900px cae la ventana; devuelve además el disparador para simular un cambio de tamaño. */
function stubMatchMedia(narrow = false): (nowNarrow: boolean) => void {
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	let matches = narrow;
	vi.stubGlobal('matchMedia', (query: string) => ({
		media: query,
		get matches() {
			return matches;
		},
		addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
			void listeners.add(listener),
		removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
			void listeners.delete(listener)
	}));
	return (nowNarrow: boolean) => {
		matches = nowNarrow;
		for (const listener of listeners) {
			listener({ matches: nowNarrow } as MediaQueryListEvent);
		}
	};
}

/** Mismo criterio que `PreviewPanel.svelte.test.ts`: macrotask real (drena la cadena de
 *  microtasks de `requestPreview`) + `tick()` de Svelte. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

function fakeCtx(overrides: Partial<VegaAppContext> = {}): VegaAppContext {
	return {
		port: { previewApiUrl: 'https://pb.test/api/vega-preview', previewVisualEditing: true },
		session: { token: 'tok-123', user: { id: 'u1', email: 'a@b.test' }, expiresAt: null },
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		nav: { toRecord: vi.fn() },
		...overrides
	} as unknown as VegaAppContext;
}

function mountScreen(ctx: VegaAppContext): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualEditorScreen, {
		target,
		props: { type: TYPE, record: RECORD },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

function sendSiteMessage(data: Record<string, unknown>, origin = PREVIEW_ORIGIN): void {
	// Sin `source` (ver cabecera de `bridge-client.ts#handleMessage`): el cliente solo compara
	// `event.source` contra el marco cuando el evento LO TRAE — omitirlo aquí evita tener que
	// fabricar una identidad de ventana que case con `iframeEl.contentWindow` de jsdom.
	window.dispatchEvent(new MessageEvent('message', { origin, data }));
}

describe('VisualEditorScreen.svelte', () => {
	let mounted: ReturnType<typeof mountScreen> | null = null;

	// Por defecto, ventana ANCHA: jsdom no trae `matchMedia` y la pantalla lo consulta al montar
	// para decidir si el lienzo se monta siquiera (ver su cabecera). Los tests que necesitan la
	// ventana estrecha vuelven a llamar a `stubMatchMedia(true)` antes de montar.
	beforeEach(() => {
		stubMatchMedia(false);
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

	test('al montar: pide el token SIN draft y monta el iframe con su URL', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);

		mounted = mountScreen(fakeCtx());
		await flush();

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://pb.test/api/vega-preview/token');
		expect(JSON.parse(String(init.body))).toEqual({ collection: 'post', id: 'rec-1' });

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		expect(iframe?.src).toBe(TOKEN_URL);
	});

	test('un mensaje del origen bueno llega al cliente y pinta "conectado"', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		mounted = mountScreen(fakeCtx());
		await flush();

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		iframe?.dispatchEvent(new Event('load'));
		await tick();

		sendSiteMessage({
			vega: 'vega-visual-1',
			type: 'ready',
			collection: 'post',
			id: 'rec-1',
			blocks: [{ id: 'b1', type: 'hero', rect: { top: 0, left: 0, width: 100, height: 50 } }]
		});
		await tick();

		expect(mounted.target.querySelector('.vega-visual-status')?.textContent).toContain(
			translate('es', 'editor.visual.connected', { count: 1 })
		);
	});

	test('un estado de error del puente pinta su texto y "Reintentar" vuelve a llamar a start()', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		mounted = mountScreen(fakeCtx());
		await flush();

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		iframe?.dispatchEvent(new Event('load'));
		await tick();

		// Sobre con una versión que el cliente no implementa → `error/protocol-version` (§contrato).
		sendSiteMessage({ vega: 'vega-visual-99', type: 'ready' });
		await tick();

		const status = mounted.target.querySelector('.vega-visual-status');
		expect(status?.textContent).toContain(
			translate('es', 'editor.visual.error.protocolVersion.title')
		);
		const retryButton = mounted.target.querySelector<HTMLButtonElement>('.vega-visual-retry');
		expect(retryButton).not.toBeNull();

		retryButton?.click();
		await tick();

		// `start()` reengancha desde el error (ver `bridge-client.ts`): vuelve a "conectando".
		expect(status?.textContent).toContain(translate('es', 'editor.visual.connecting'));
	});

	test('renovar el token PARA el puente: la barra no puede seguir diciendo "conectado" con el marco ya desmontado', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(expiringTokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		mounted = mountScreen(fakeCtx());
		await flush();

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		iframe?.dispatchEvent(new Event('load'));
		await tick();
		sendSiteMessage({
			vega: 'vega-visual-1',
			type: 'ready',
			collection: 'post',
			id: 'rec-1',
			blocks: [{ id: 'b1', type: 'hero', rect: { top: 0, left: 0, width: 100, height: 50 } }]
		});
		await tick();
		expect(mounted.target.querySelector('.vega-visual-status')?.textContent).toContain(
			translate('es', 'editor.visual.connected', { count: 1 })
		);

		// La renovación programada dispara `requestPreview()` otra vez, que desmonta el `<iframe>`:
		// sin el `stop()` del cliente, la barra seguiría anunciando los bloques de una página que
		// ya no está en pantalla.
		await new Promise((resolve) => setTimeout(resolve, 80));
		await tick();

		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
		expect(mounted.target.querySelector('.vega-visual-status')?.textContent).not.toContain(
			translate('es', 'editor.visual.connected', { count: 1 })
		);
	});

	test('con el token caído, la barra NO dice "conectando": el mensaje lo da el lienzo', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500)));
		mounted = mountScreen(fakeCtx());
		await flush();

		expect(mounted.target.querySelector('.vega-visual-overlay--error')).not.toBeNull();
		expect(mounted.target.querySelector('.vega-visual-status')?.textContent?.trim()).toBe('');
	});

	test('"bad-preview-url" es el único error del puente SIN botón de reintentar', async () => {
		// Un `data:` da origen opaco, así que el cliente no tiene contra qué validar y falla cerrado
		// (`bridge-client.ts#originOf`). Reintentar no puede arreglarlo: la URL se fija al crear.
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				jsonResponse({
					url: 'data:text/html,<p>hola',
					expiresAt: new Date(Date.now() + 3_600_000).toISOString()
				})
			)
		);
		mounted = mountScreen(fakeCtx());
		await flush();

		mounted.target.querySelector('.vega-visual-frame')?.dispatchEvent(new Event('load'));
		await tick();

		expect(mounted.target.querySelector('.vega-visual-status')?.textContent).toContain(
			translate('es', 'editor.visual.error.badPreviewUrl.title')
		);
		expect(mounted.target.querySelector('.vega-visual-retry')).toBeNull();
	});

	test('ventana estrecha: ni se monta el lienzo ni se pide token, solo el aviso', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const setNarrow = stubMatchMedia(true);

		mounted = mountScreen(fakeCtx());
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(mounted.target.querySelector('.vega-visual-grid')).toBeNull();
		expect(mounted.target.querySelector('.vega-visual-narrow')?.textContent).toContain(
			translate('es', 'editor.visual.tooNarrow.title')
		);

		// Y al ensancharse SÍ arranca: el lienzo se monta y entonces se pide el token.
		setNarrow(false);
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(mounted.target.querySelector('.vega-visual-frame')).not.toBeNull();
	});

	test('desmontar da de baja el escuchador de `message`', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const addSpy = vi.spyOn(window, 'addEventListener');
		const removeSpy = vi.spyOn(window, 'removeEventListener');

		mounted = mountScreen(fakeCtx());
		await flush();

		const messageCall = addSpy.mock.calls.find(([type]) => type === 'message');
		expect(messageCall).toBeDefined();
		const handler = messageCall?.[1];

		const toUnmount = mounted.instance;
		const target = mounted.target;
		mounted = null;
		await unmount(toUnmount);
		target.remove();

		expect(removeSpy).toHaveBeenCalledWith('message', handler);
	});
});
