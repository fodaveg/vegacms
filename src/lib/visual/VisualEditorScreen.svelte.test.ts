/**
 * Suite de componente de `VisualEditorScreen.svelte` (tarea "pantalla del editor visual", ampliada
 * por la tarea "árbol de secciones y el inspector"): montaje real (mismo patrón que
 * `RecordBlocks.svelte.test.ts`/`PreviewPanel.svelte.test.ts`).
 *
 * Dos familias de test conviven aquí:
 * - Las heredadas de la tarea anterior (puente/token/overlay): el cableado con el DOM real que
 *   `bridge-client.ts` no puede probar por sí solo.
 * - Las nuevas (árbol + inspector): un `ContentType` con `blocks` de VERDAD, resuelto con
 *   `resolveContentModel` y respaldado por `createMemoryBackend` (mismo criterio que
 *   `RecordBlocks.svelte.test.ts`, ver su cabecera — no un doble a medias) — porque
 *   `createBlocksState()` ahora vive DENTRO de esta pantalla y necesita un `ctx.port`/`ctx.model`
 *   reales para cargar/guardar bloques, cosa que el `fakeCtx` de la tarea anterior no tenía.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import VisualEditorScreen from './VisualEditorScreen.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import { INSPECTOR_DEFAULT_WIDTH, TREE_DEFAULT_WIDTH } from './column-widths';
import { readColumnWidths } from './column-widths-storage';

const PREVIEW_ORIGIN = 'https://sitio.test';
const TOKEN_URL = `${PREVIEW_ORIGIN}/preview/post/rec-1?token=abc`;
const RECORD: VegaRecord = { id: 'rec-1', type: 'post', values: { title: 'Hola mundo' } };

// ————— Modelo con `blocks` DE VERDAD (mismo criterio que `RecordBlocks.svelte.test.ts`): el
// árbol/inspector cuelgan de `createBlocksState()`, que necesita un `blocksConfig` real. —————

const postType: ContentType = {
	name: 'post',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

const postBlockType: ContentType = {
	name: 'post_block',
	readonly: false,
	fields: [
		{
			name: 'post',
			type: 'relation',
			target: 'post',
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'sort',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'heading',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true, // autodetectado como titleField, mismo criterio que RecordBlocks
			hidden: false,
			unique: false
		}
	]
};

/** Un bloque de la fixture: `id`/`heading`/`sort` bastan (modo HOMOGÉNEO, sin `typeField`). */
interface BlockSeed {
	id: string;
	heading: string;
	sort: number;
}

interface Fixture {
	ctx: VegaAppContext;
	type: ResolvedContentType;
	port: MemoryBackendPort;
}

async function setup(blocks: BlockSeed[] = []): Promise<Fixture> {
	const model = resolveContentModel({
		types: [postType, postBlockType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				post: { blocks: { collection: 'post_block', parentField: 'post', orderField: 'sort' } }
			}
		}
	});
	expect(model.warnings).toEqual([]); // fixture bien formada, cero degradación
	const type = model.types.find((t) => t.name === 'post')!;

	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [postType, postBlockType],
		records: {
			post: [{ id: 'rec-1', values: { title: 'Hola mundo' } }],
			post_block: blocks.map((b) => ({
				id: b.id,
				values: { post: 'rec-1', sort: b.sort, heading: b.heading }
			}))
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });
	// La capacidad de vista previa/edición visual NO la modela `memory` (es propia de PocketBase +
	// la extensión Go): se añade encima, mismo patrón que el `fakeCtx` de la tarea anterior.
	Object.assign(port, {
		previewApiUrl: 'https://pb.test/api/vega-preview',
		previewVisualEditing: true
	});

	const ctx = {
		port,
		model,
		session: { token: 'tok-123', user: { id: 'u1', email: 'a@b.test' }, expiresAt: null },
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		nav: { toRecord: vi.fn(), toSettings: vi.fn() },
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		// Se deja declarado aunque esta pantalla NO lo use (ver su cabecera): el shell lo publica
		// siempre, y omitirlo del doble escondería que el guard va por otro camino.
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;

	return { ctx, type, port };
}

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

/** `matchMedia` de mentira (jsdom no lo trae): la pantalla consulta DOS puntos de corte propios
 *  (900px del lienzo, `canvasActive`; 1180px de la manilla del árbol, `treeResizerActive`) y cada
 *  uno necesita poder moverse por separado — de ahí que se enruten por el texto de la query en vez
 *  de compartir un único flag "narrow" como antes de la manilla del árbol. `canvasNarrow`/
 *  `treeNarrow` fijan el lado inicial de cada uno; los setters devueltos simulan un cambio de
 *  tamaño de cada uno por su cuenta. */
function stubMatchMedia(
	canvasNarrow = false,
	treeNarrow = false
): { setCanvasNarrow: (nowNarrow: boolean) => void; setTreeNarrow: (nowNarrow: boolean) => void } {
	const canvasListeners = new Set<(event: MediaQueryListEvent) => void>();
	const treeListeners = new Set<(event: MediaQueryListEvent) => void>();
	let canvasMatches = canvasNarrow;
	let treeMatches = treeNarrow;
	vi.stubGlobal('matchMedia', (query: string) => {
		const isTreeQuery = query.includes('1180px');
		const listeners = isTreeQuery ? treeListeners : canvasListeners;
		return {
			media: query,
			get matches() {
				return isTreeQuery ? treeMatches : canvasMatches;
			},
			addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
				void listeners.add(listener),
			removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
				void listeners.delete(listener)
		};
	});
	return {
		setCanvasNarrow: (nowNarrow: boolean) => {
			canvasMatches = nowNarrow;
			for (const listener of canvasListeners)
				listener({ matches: nowNarrow } as MediaQueryListEvent);
		},
		setTreeNarrow: (nowNarrow: boolean) => {
			treeMatches = nowNarrow;
			for (const listener of treeListeners) listener({ matches: nowNarrow } as MediaQueryListEvent);
		}
	};
}

/** `ResizeObserver` de mentira (jsdom NO lo trae, a diferencia de `matchMedia` que sí se puede
 *  stubear con una forma mínima): la pantalla lo usa para medir `.vega-visual-canvas` (tarea "el
 *  acabado"), así que sin este stub CUALQUIER montaje revienta con un `ReferenceError`, no solo
 *  los tests nuevos de zoom. `observe(el)` dispara el callback EN EL ACTO con el
 *  `getBoundingClientRect()` actual del elemento (jsdom no hace layout de verdad: por defecto da
 *  0×0, así que los tests que necesiten un tamaño concreto stubean `getBoundingClientRect` ANTES
 *  de montar o antes de llamar a `triggerResize`). `triggerResize()` reinvoca a TODOS los
 *  observadores activos con la medida VIVA en ese momento — simula tanto un redimensionado de
 *  ventana como el efecto de arrastrar una manilla de columna, que en un navegador real dispara el
 *  mismo `ResizeObserver` sin que el componente tenga que enterarse de la causa (ver la cabecera
 *  de `VisualEditorScreen.svelte`). */
function stubResizeObserver(): { triggerResize: () => void } {
	const observers = new Set<{ el: Element; cb: ResizeObserverCallback }>();
	class ResizeObserverStub {
		#cb: ResizeObserverCallback;
		constructor(cb: ResizeObserverCallback) {
			this.#cb = cb;
		}
		observe(el: Element): void {
			const entry = { el, cb: this.#cb };
			observers.add(entry);
			this.#cb(
				[{ contentRect: el.getBoundingClientRect() } as ResizeObserverEntry],
				this as unknown as ResizeObserver
			);
		}
		unobserve(el: Element): void {
			for (const entry of observers) if (entry.el === el) observers.delete(entry);
		}
		disconnect(): void {
			for (const entry of observers) if (entry.cb === this.#cb) observers.delete(entry);
		}
	}
	vi.stubGlobal('ResizeObserver', ResizeObserverStub);
	return {
		triggerResize: () => {
			for (const { el, cb } of observers) {
				cb(
					[{ contentRect: el.getBoundingClientRect() } as ResizeObserverEntry],
					undefined as unknown as ResizeObserver
				);
			}
		}
	};
}

/** Mismo criterio que `PreviewPanel.svelte.test.ts`: macrotask real (drena la cadena de
 *  microtasks de `requestPreview`/`createBlocksState#load`) + `tick()` de Svelte. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

function mountScreen(
	ctx: VegaAppContext,
	type: ResolvedContentType
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualEditorScreen, {
		target,
		props: { type, record: RECORD },
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

/** Conecta el puente hasta `connected` con los bloques dados: ceremonia repetida en varios tests
 *  nuevos (árbol/inspector), no en los heredados (que ya la tenían inline). `liveRefresh` (§"Live
 *  refresh" del contrato) apagado por defecto: los tests heredados prueban el camino de siempre. */
async function connectBridge(
	target: HTMLElement,
	blocks: { id: string; type: string }[],
	liveRefresh = false
): Promise<void> {
	const iframe = target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
	iframe?.dispatchEvent(new Event('load'));
	await tick();
	sendSiteMessage({
		vega: 'vega-visual-1',
		type: 'ready',
		collection: 'post',
		id: 'rec-1',
		blocks: blocks.map((b) => ({
			id: b.id,
			type: b.type,
			rect: { top: 0, left: 0, width: 100, height: 50 }
		})),
		liveRefresh
	});
	await tick();
}

/** Ventana de rebote de `scheduleCanvasRefresh` (`REFRESH_DEBOUNCE_MS = 200`), agotada con
 *  temporizadores REALES (mismo criterio que `flush()`, no falsos): 250ms de margen y una `flush()`
 *  final para que se resuelva la promesa de `client.requestPreview` que dispara `refreshCanvas`. */
async function flushRefreshDebounce(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 250));
	await flush();
}

describe('VisualEditorScreen.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	// Por defecto, ventana ANCHA: jsdom no trae `matchMedia` y la pantalla lo consulta al montar
	// para decidir si el lienzo se monta siquiera (ver su cabecera). Los tests que necesitan la
	// ventana estrecha vuelven a llamar a `stubMatchMedia(true)` antes de montar.
	beforeEach(() => {
		stubMatchMedia(false);
		// `ResizeObserver` (ver cabecera de `stubResizeObserver`): necesario en TODOS los tests, no
		// solo en los de zoom, porque el montaje entero pasa por él.
		stubResizeObserver();
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

		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://pb.test/api/vega-preview/token');
		expect(JSON.parse(String(init.body))).toEqual({ collection: 'post', id: 'rec-1' });

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		expect(iframe?.src).toBe(TOKEN_URL);
	});

	test('un mensaje del origen bueno llega al cliente y pinta "conectado"', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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

	test('un `select` del sitio selecciona ESE bloque: el contorno lo marca, no otro', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		iframe?.dispatchEvent(new Event('load'));
		await tick();

		sendSiteMessage({
			vega: 'vega-visual-1',
			type: 'ready',
			collection: 'post',
			id: 'rec-1',
			blocks: [
				{ id: 'b1', type: 'hero', rect: { top: 0, left: 0, width: 100, height: 50 } },
				{ id: 'b2', type: 'gallery', rect: { top: 60, left: 0, width: 100, height: 50 } }
			]
		});
		await tick();

		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b2' });
		await tick();

		const b1 = mounted.target.querySelector('[data-vega-block-id="b1"]');
		const b2 = mounted.target.querySelector('[data-vega-block-id="b2"]');
		expect(b1?.classList.contains('vega-visual-overlay-box--selected')).toBe(false);
		expect(b2?.classList.contains('vega-visual-overlay-box--selected')).toBe(true);

		// Y si el bloque seleccionado desaparece de un `layout` posterior, la selección se LIMPIA.
		// Ojo con cómo se comprueba: que el contorno seleccionado no se pinte NO prueba nada, porque
		// ese bloque ya no se pinta de ninguna manera. Lo que distingue "limpiada" de "fantasma" es
		// lo que pasa si el bloque VUELVE: con la selección limpia no se re-selecciona solo.
		sendSiteMessage({
			vega: 'vega-visual-1',
			type: 'layout',
			blocks: [{ id: 'b1', type: 'hero', rect: { top: 0, left: 0, width: 100, height: 50 } }]
		});
		await tick();
		expect(mounted.target.querySelector('[data-vega-block-id="b2"]')).toBeNull();

		sendSiteMessage({
			vega: 'vega-visual-1',
			type: 'layout',
			blocks: [
				{ id: 'b1', type: 'hero', rect: { top: 0, left: 0, width: 100, height: 50 } },
				{ id: 'b2', type: 'gallery', rect: { top: 60, left: 0, width: 100, height: 50 } }
			]
		});
		await tick();
		expect(mounted.target.querySelector('[data-vega-block-id="b2"]')).not.toBeNull();
		expect(mounted.target.querySelector('.vega-visual-overlay-box--selected')).toBeNull();
	});

	test('un estado de error del puente pinta su texto y "Reintentar" vuelve a llamar a start()', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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
		const { setCanvasNarrow } = stubMatchMedia(true);

		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(mounted.target.querySelector('.vega-visual-grid')).toBeNull();
		expect(mounted.target.querySelector('.vega-visual-narrow')?.textContent).toContain(
			translate('es', 'editor.visual.tooNarrow.title')
		);

		// Y al ensancharse SÍ arranca: el lienzo se monta y entonces se pide el token.
		setCanvasNarrow(false);
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(mounted.target.querySelector('.vega-visual-frame')).not.toBeNull();
	});

	test('desmontar da de baja el escuchador de `message`', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const addSpy = vi.spyOn(window, 'addEventListener');
		const removeSpy = vi.spyOn(window, 'removeEventListener');

		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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

// ————— Árbol de secciones + inspector (tarea "árbol de secciones y el inspector") —————

describe('VisualEditorScreen.svelte — árbol de secciones e inspector', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		stubMatchMedia(false);
		stubResizeObserver();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
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

	test('el árbol lista los bloques en su orden, con título y contador', async () => {
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		const titles = Array.from(mounted.target.querySelectorAll('.vega-tree-title')).map(
			(el) => el.textContent
		);
		expect(titles).toEqual(['Hero', 'Features']);
		expect(mounted.target.querySelector('.vega-tree-count')?.textContent).toBe('2');
	});

	test('sin bloques: el árbol y el inspector lo dicen, no se quedan en blanco', async () => {
		const { ctx, type } = await setup([]);
		mounted = mountScreen(ctx, type);
		await flush();

		expect(mounted.target.querySelector('.vega-tree-notice')?.textContent).toContain(
			'Todavía no hay'
		);
		expect(mounted.target.querySelector('.vega-inspector-notice')?.textContent).toContain(
			'Todavía no hay'
		);
	});

	test('los dos sentidos de la selección: elegir en el árbol resalta el lienzo y abre su ficha; un `select` del sitio selecciona en el árbol', async () => {
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);

		const iframe = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame')!;
		const postMessageSpy = vi.spyOn(iframe.contentWindow!, 'postMessage');

		// 1) Árbol → lienzo + inspector.
		const rows = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-row');
		rows[1].click(); // "Features" (b2)
		await tick();

		expect(rows[1].getAttribute('aria-current')).toBe('true');
		expect(rows[0].getAttribute('aria-current')).toBeNull();
		expect(
			mounted.target
				.querySelector('[data-vega-block-id="b2"]')
				?.classList.contains('vega-visual-overlay-box--selected')
		).toBe(true);
		expect(
			postMessageSpy.mock.calls.some(
				([msg]) =>
					(msg as Record<string, unknown>).type === 'highlight' &&
					(msg as Record<string, unknown>).blockId === 'b2'
			)
		).toBe(true);
		expect(
			postMessageSpy.mock.calls.some(
				([msg]) =>
					(msg as Record<string, unknown>).type === 'scroll-to' &&
					(msg as Record<string, unknown>).blockId === 'b2'
			)
		).toBe(true);

		const bodies = mounted.target.querySelectorAll<HTMLElement>('.vega-inspector-body');
		expect(bodies).toHaveLength(2);
		expect(bodies[0].hasAttribute('hidden')).toBe(true); // b1, no seleccionado
		expect(bodies[1].hasAttribute('hidden')).toBe(false); // b2, seleccionado

		// 2) Lienzo → árbol + inspector (al revés).
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		expect(rows[0].getAttribute('aria-current')).toBe('true');
		expect(rows[1].getAttribute('aria-current')).toBeNull();
		expect(bodies[0].hasAttribute('hidden')).toBe(false);
		expect(bodies[1].hasAttribute('hidden')).toBe(true);
	});

	test('editar en el inspector marca sucio (punto en el árbol) y guardar lo limpia', async () => {
		const { ctx, type, port } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }]);

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();

		const headingInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.value = 'Hero editado';
		headingInput.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		expect(mounted.target.querySelector('.vega-tree-dirty')).not.toBeNull();

		mounted.target
			.querySelector<HTMLButtonElement>(
				'.vega-inspector-body:not([hidden]) .vega-block-save-button'
			)!
			.click();
		await flush();

		expect(mounted.target.querySelector('.vega-tree-dirty')).toBeNull();
		expect(mounted.target.querySelector('.vega-tree-title')?.textContent).toBe('Hero editado');
		expect((await port.get('post_block', 'b1')).values.heading).toBe('Hero editado');
	});

	test('guardar un bloque pide un token de vista previa NUEVO (el marco se refresca)', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();
		const headingInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.value = 'Hero editado';
		headingInput.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		mounted.target
			.querySelector<HTMLButtonElement>(
				'.vega-inspector-body:not([hidden]) .vega-block-save-button'
			)!
			.click();
		await flush();

		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
	});

	test('cambiar de bloque seleccionado NO pierde lo escrito sin guardar en el anterior', async () => {
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		const rows = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-row');
		rows[0].click(); // b1
		await tick();
		const b1Input = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		b1Input.value = 'Borrador sin guardar';
		b1Input.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		rows[1].click(); // b2: NO debe desmontar el editor de b1
		await tick();
		rows[0].click(); // de vuelta a b1
		await tick();

		expect(b1Input.isConnected).toBe(true); // el MISMO nodo, nunca recreado
		expect(b1Input.value).toBe('Borrador sin guardar');
	});

	test('el árbol es operable por teclado: cada fila es un botón normal, con nombre accesible', async () => {
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		const rows = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-row');
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.tagName).toBe('BUTTON');
			expect(row.type).toBe('button');
			expect(row.getAttribute('aria-label')).toBeTruthy();
			expect(row.disabled).toBe(false); // en el orden de tabulación, ningún truco de foco
		}
		expect(rows[0].getAttribute('aria-label')).toContain('Hero');
		expect(rows[1].getAttribute('aria-label')).toContain('Features');

		// Enter/Space activan un `<button>` nativo — aquí se ejercita con `.focus()` + `.click()`
		// (jsdom no simula la activación por teclado de un elemento nativo; lo que SÍ prueba esto
		// es que el control es un botón real, alcanzable y operable, no un `<div onclick>`).
		rows[1].focus();
		expect(document.activeElement).toBe(rows[1]);
		rows[1].click();
		await tick();
		expect(rows[1].getAttribute('aria-current')).toBe('true');
	});

	test('D3 (encargo de accesibilidad): seleccionar un bloque anuncia su título y posición por la región `aria-live` del árbol', async () => {
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		// La región vive UNA vez, en `VisualBlockTree.svelte` (ver la cabecera de
		// `blocks-state.svelte.ts`, "Anuncio de la selección"): antes de esta tarea solo la
		// escribía `handleReorder`, así que arranca vacía. Se busca por su clase y NO por
		// `.vega-tree-panel [aria-live]`: la región cuelga a propósito FUERA del panel del cajón,
		// porque dentro el `visibility: hidden` del cajón cerrado la dejaba muda (ver el comentario
		// de esa región en el marcado del árbol).
		const live = mounted.target.querySelector('.vega-visually-hidden[aria-live="polite"]')!;
		expect(live.textContent).toBe('');

		const rows = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-row');
		rows[0].click();
		await tick();
		expect(live.textContent).toBe(
			translate('es', 'editor.visual.tree.announceSelect', { label: 'Hero', position: 1, total: 2 })
		);

		// Seleccionar OTRO bloque cambia el texto (no es un anuncio fijo, sigue a la selección real).
		rows[1].click();
		await tick();
		expect(live.textContent).toBe(
			translate('es', 'editor.visual.tree.announceSelect', {
				label: 'Features',
				position: 2,
				total: 2
			})
		);
	});

	test('D3: una selección FANTASMA (id que el sitio reporta pero no resuelve a ningún registro) no anuncia una posición inventada', async () => {
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [{ id: 'fantasma', type: 'hero' }]);

		const live = mounted.target.querySelector('.vega-visually-hidden[aria-live="polite"]')!;
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'fantasma' });
		await tick();

		expect(live.textContent).toBe('');
	});

	test('un id que el sitio reporta pero el árbol no tiene: el inspector lo DICE, no lo esconde', async () => {
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		// El sitio anota un bloque ('fantasma') que no existe como registro de `post_block`.
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'fantasma', type: 'hero' }
		]);

		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'fantasma' });
		await tick();

		expect(mounted.target.querySelector('.vega-inspector-notice')?.textContent).toContain(
			'ya no está en este registro'
		);
	});

	// Guard de salida: el mecanismo es `beforeNavigate` + `beforeunload`, el MISMO que
	// `RecordForm.svelte` y nunca `registerExitGuard` (que solo intercepta `ctx.nav.*`; el audit de
	// P5 ya cambió `RecordForm` por eso). Aquí se ejerce la mitad que un test de componente puede
	// ejercer de verdad —`beforeunload`, que es un evento de `window`—; `beforeNavigate` necesita el
	// router de SvelteKit vivo, así que su cobertura es e2e, igual que la de `RecordForm`.
	test('cerrar la pestaña con ediciones sin guardar: se avisa; sin ediciones, no', async () => {
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		const limpio = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(limpio);
		expect(limpio.defaultPrevented).toBe(false);

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();
		const headingInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.value = 'Sin guardar';
		headingInput.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		const sucio = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(sucio);
		expect(sucio.defaultPrevented).toBe(true);
	});

	test('el aviso de cerrar pestaña se da de baja al desmontar', async () => {
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();
		const headingInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.value = 'Sin guardar';
		headingInput.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		const toUnmount = mounted.instance;
		const target = mounted.target;
		mounted = null;
		await unmount(toUnmount);
		target.remove();

		// Ya desmontada: un `beforeunload` no puede seguir bloqueando el cierre de la pestaña por
		// una pantalla que ya no existe.
		const trasDesmontar = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(trasDesmontar);
		expect(trasDesmontar.defaultPrevented).toBe(false);
	});
});

// ————— Acciones estructurales desde el árbol y el lienzo (tarea "acciones estructurales desde el
// editor visual"): montaje real contra el puerto en memoria (mismo criterio que el resto del
// fichero) — aquí es donde de verdad importa que `onStructuralChange` pida un token nuevo (se
// comprueba contando llamadas a `fetch`, igual que el test heredado "guardar un bloque pide un
// token de vista previa NUEVO"), no solo que el componente aislado llame al método correcto
// (eso ya lo cubren `VisualBlockTree.svelte.test.ts`/`VisualOverlay.svelte.test.ts` con un
// `BlocksState` de mentira). -----

describe('VisualEditorScreen.svelte — acciones estructurales (árbol + lienzo)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		stubMatchMedia(false);
		stubResizeObserver();
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

	test('duplicar desde el árbol: inserta la copia justo debajo y pide un token de vista previa nuevo', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const duplicateBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Duplicar'))!;
		duplicateBtn.click();
		await flush();

		const rows = await port.list('post_block', {
			sort: [{ field: 'sort', dir: 'asc' }],
			perPage: 50
		});
		expect(rows.items.map((r) => r.values.heading)).toEqual(['Hero', 'Hero', 'Features']);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
	});

	test('mover abajo desde el árbol persiste el nuevo orden y pide vista previa nueva', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		const downButtons = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).filter((btn) => btn.getAttribute('aria-label')?.startsWith('Bajar'));
		downButtons[0].click(); // "Hero" baja
		await flush();

		const rows = await port.list('post_block', {
			sort: [{ field: 'sort', dir: 'asc' }],
			perPage: 50
		});
		expect(rows.items.map((r) => r.values.heading)).toEqual(['Features', 'Hero']);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
	});

	test('borrar el bloque seleccionado desde el árbol: borra de verdad, pide vista previa nueva, y la selección se limpia sola al recargar', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);

		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();
		expect(mounted.target.querySelector('.vega-tree-row--selected')).not.toBeNull();

		const deleteBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Borrar'))!;
		deleteBtn.click();
		await tick();
		mounted.target.querySelector<HTMLButtonElement>('.vega-delete-confirm')!.click();
		await flush();

		expect((await port.list('post_block', { perPage: 50 })).totalItems).toBe(1);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);

		// Ver cabecera de `VisualEditorScreen.svelte` ("Borrar el seleccionado limpia la selección
		// SOLA"): ni `VisualBlockTree`/`VisualOverlay` tocan `selectedBlockId`, es el `onState` del
		// puente el que la limpia cuando el sitio recargado deja de reportar el id borrado.
		await connectBridge(mounted.target, [{ id: 'b2', type: 'gallery' }]);
		expect(mounted.target.querySelector('.vega-tree-row--selected')).toBeNull();
	});

	test('duplicar desde la barra flotante del lienzo: mismo resultado que desde el árbol', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }]);

		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		const duplicateBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-toolbar-btn')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Duplicar'))!;
		duplicateBtn.click();
		await flush();

		expect((await port.list('post_block', { perPage: 50 })).totalItems).toBe(2);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
	});

	test('insertar desde un punto del lienzo: crea la sección EN esa posición, no siempre al final', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);

		const points = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		);
		expect(points).toHaveLength(3); // antes de b1, entre b1 y b2, después de b2
		points[1].click(); // entre b1 y b2
		await flush();

		const rows = await port.list('post_block', {
			sort: [{ field: 'sort', dir: 'asc' }],
			perPage: 50
		});
		expect(rows.items).toHaveLength(3);
		expect(rows.items[0].id).toBe('b1');
		expect(rows.items[2].id).toBe('b2');
		expect(rows.items[1].id).not.toBe('b1');
		expect(rows.items[1].id).not.toBe('b2');
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
	});
});

// ————— Anchos de columna ajustables (petición de David tras usar el editor visual en prod) —————

describe('VisualEditorScreen.svelte — manillas de ancho de columna', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		localStorage.clear();
		stubResizeObserver();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
	});

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		localStorage.clear();
	});

	test('ventana ancha: las DOS manillas se montan, cada una con su etiqueta', async () => {
		stubMatchMedia(false, false);
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const handles = mounted.target.querySelectorAll('.vega-col-resizer');
		expect(handles).toHaveLength(2);
		expect(handles[0].getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.resize.tree')
		);
		expect(handles[1].getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.resize.inspector')
		);
	});

	test('por debajo de 1180px NO se monta la manilla del árbol (la del inspector sigue)', async () => {
		stubMatchMedia(false, true); // lienzo ancho (>900px), pero por debajo de los 1180px del árbol
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const handles = mounted.target.querySelectorAll('.vega-col-resizer');
		expect(handles).toHaveLength(1);
		expect(handles[0].getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.resize.inspector')
		);
	});

	test('al ensancharse por encima de 1180px, la manilla del árbol vuelve a montarse', async () => {
		const { setTreeNarrow } = stubMatchMedia(false, true);
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();
		expect(mounted.target.querySelectorAll('.vega-col-resizer')).toHaveLength(1);

		setTreeNarrow(false);
		await tick();
		expect(mounted.target.querySelectorAll('.vega-col-resizer')).toHaveLength(2);
	});

	test('sin preferencia guardada: los anchos de partida de siempre (280/320)', async () => {
		stubMatchMedia(false, false);
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const [treeHandle, inspectorHandle] = mounted.target.querySelectorAll('.vega-col-resizer');
		expect(treeHandle.getAttribute('aria-valuenow')).toBe(String(TREE_DEFAULT_WIDTH));
		expect(inspectorHandle.getAttribute('aria-valuenow')).toBe(String(INSPECTOR_DEFAULT_WIDTH));
	});

	test('con una preferencia ya guardada: el grid arranca con ESE ancho, no con el de siempre', async () => {
		localStorage.setItem('vega.visual.columns.v1', JSON.stringify({ tree: 340, inspector: 380 }));
		stubMatchMedia(false, false);
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const [treeHandle, inspectorHandle] = mounted.target.querySelectorAll('.vega-col-resizer');
		expect(treeHandle.getAttribute('aria-valuenow')).toBe('340');
		expect(inspectorHandle.getAttribute('aria-valuenow')).toBe('380');
	});

	test('arrastrar la manilla del árbol persiste el ancho nuevo entre sesiones', async () => {
		stubMatchMedia(false, false);
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const [treeHandle] = mounted.target.querySelectorAll('.vega-col-resizer');
		treeHandle.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, pointerId: 1 })
		);
		window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, pointerId: 1 }));
		window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
		await tick();

		expect(treeHandle.getAttribute('aria-valuenow')).toBe(String(TREE_DEFAULT_WIDTH + 40));
		expect(readColumnWidths().tree).toBe(TREE_DEFAULT_WIDTH + 40);
	});

	test('doble clic en una manilla la devuelve a su ancho por defecto', async () => {
		localStorage.setItem('vega.visual.columns.v1', JSON.stringify({ tree: 450, inspector: 320 }));
		stubMatchMedia(false, false);
		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
		await flush();

		const [treeHandle] = mounted.target.querySelectorAll('.vega-col-resizer');
		expect(treeHandle.getAttribute('aria-valuenow')).toBe('450');
		treeHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await tick();

		expect(treeHandle.getAttribute('aria-valuenow')).toBe(String(TREE_DEFAULT_WIDTH));
		expect(readColumnWidths().tree).toBe(TREE_DEFAULT_WIDTH);
	});
});

// ————— Refresco en vivo del lienzo (§"Live refresh" del contrato): scheduleCanvasRefresh decide
// entre el camino nuevo (bridgeClient.refresh(), el `<iframe>` nunca se toca) y el de siempre
// (requestPreview(), que SÍ le cambia el `src`) según lo que el ÚLTIMO `ready` anunció. -----

describe('VisualEditorScreen.svelte — refresco en vivo del lienzo', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		stubMatchMedia(false);
		stubResizeObserver();
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

	/** `mockResolvedValue` reutilizaría el MISMO `Response` en cada llamada, y su cuerpo solo se
	 *  puede leer una vez (`createPreviewClient` llama `response.json()`): con dos peticiones de
	 *  token reales por test (la del montaje y la de `refreshCanvas`/`requestPreview`), hace falta
	 *  una respuesta NUEVA cada vez. */
	function freshTokenFetch(): ReturnType<typeof vi.fn> {
		return vi.fn(async () => jsonResponse(tokenBody()));
	}

	async function saveHeading(target: HTMLElement, value: string): Promise<void> {
		target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();
		const headingInput = target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.value = value;
		headingInput.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		target
			.querySelector<HTMLButtonElement>(
				'.vega-inspector-body:not([hidden]) .vega-block-save-button'
			)!
			.click();
		await flush();
	}

	test('con "liveRefresh" anunciado: guardar un bloque postea "refresh" y el `<iframe>` NUNCA se toca', async () => {
		const fetchMock = freshTokenFetch();
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }], true);

		const iframeBefore = mounted.target.querySelector<HTMLIFrameElement>('.vega-visual-frame');
		const postMessageSpy = vi.spyOn(iframeBefore!.contentWindow!, 'postMessage');

		await saveHeading(mounted.target, 'Hero editado');
		await flushRefreshDebounce();

		expect(
			postMessageSpy.mock.calls.some(([msg]) => (msg as Record<string, unknown>).type === 'refresh')
		).toBe(true);
		// MISMO nodo del DOM: `refreshCanvas` no escribe en `tokenState`, así que el bloque
		// `{#if tokenState.kind === 'ready'}` nunca se desmonta ni vuelve a montar el `<iframe>` — a
		// diferencia del camino de siempre (ver el test de abajo), que sí lo hace.
		const iframeAfter = mounted.target.querySelector('.vega-visual-frame');
		expect(iframeAfter).toBe(iframeBefore);
	});

	test('con "liveRefresh" falso: guardar un bloque recarga el marco entero, camino de siempre', async () => {
		const fetchMock = freshTokenFetch();
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }]); // liveRefresh: false

		const iframeBefore = mounted.target.querySelector('.vega-visual-frame');

		await saveHeading(mounted.target, 'Hero editado');
		await flushRefreshDebounce(); // por si acaso: no hay rebote en este camino, pero no debe fallar

		// Nodo NUEVO: `requestPreview()` pone `tokenState` en `loading` (desmonta el `<iframe>`) y
		// luego en `ready` con el token nuevo (lo vuelve a montar).
		const iframeAfter = mounted.target.querySelector('.vega-visual-frame');
		expect(iframeAfter).not.toBeNull();
		expect(iframeAfter).not.toBe(iframeBefore);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
	});

	test('dos cambios estructurales seguidos dentro de la ventana de rebote piden UN solo token', async () => {
		const fetchMock = freshTokenFetch();
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(
			mounted.target,
			[
				{ id: 'b1', type: 'hero' },
				{ id: 'b2', type: 'gallery' }
			],
			true
		);
		expect(fetchMock).toHaveBeenCalledTimes(1); // solo el token inicial, al montar

		const duplicateFirst = (): void =>
			Array.from(mounted!.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action'))
				.find((btn) => btn.getAttribute('aria-label')?.startsWith('Duplicar'))!
				.click();

		// Las dos mutaciones resuelven (async, pero con `flush()` de 10ms cada una: MUY por debajo de
		// `REFRESH_DEBOUNCE_MS = 200`) sin que el rebote llegue a vencer entre medias.
		duplicateFirst();
		await flush();
		duplicateFirst();
		await flush();

		await flushRefreshDebounce();

		// UN solo token para los DOS cambios: el rebote los coalesce en una sola llamada a
		// `refreshCanvas`, no una por mutación.
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	/** Dos `refreshCanvas` solapados: el rebote solo coalesce los cambios que caen DENTRO de su
	 *  ventana, así que dos guardados separados por más de `REFRESH_DEBOUNCE_MS` sí pueden dejar dos
	 *  peticiones de token en vuelo a la vez si la primera tarda. La que llega tarde tiene que
	 *  CALLARSE y dejar mandar a la posterior, nunca caer a la recarga entera: hacerlo tiraría el
	 *  refresco en vivo que ya estaba en marcha y, como `requestPreview()` incrementa
	 *  `refreshGeneration`, dejaría obsoleta también a la petición posterior, que recargaría otra
	 *  vez. Dos guardados acabarían en dos recargas enteras, lo contrario de lo que hace esta
	 *  pantalla. */
	test('una petición de token que llega TARDE no recarga el marco: manda la posterior', async () => {
		const pending: ((response: Response) => void)[] = [];
		const fetchMock = vi.fn(
			() => new Promise<Response>((resolve) => pending.push(resolve)) as Promise<Response>
		);
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		// Token del montaje: se resuelve a mano, porque este `fetch` no resuelve solo.
		pending.shift()!(jsonResponse(tokenBody()));
		await flush();
		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }], true);

		const iframeBefore = mounted.target.querySelector('.vega-visual-frame');
		expect(iframeBefore).not.toBeNull();

		// Dos guardados separados por más que la ventana de rebote: dos `refreshCanvas`, y sus dos
		// peticiones de token quedan en vuelo porque ninguna ha resuelto todavía.
		await saveHeading(mounted.target, 'Hero uno');
		await flushRefreshDebounce();
		await saveHeading(mounted.target, 'Hero dos');
		await flushRefreshDebounce();
		expect(pending).toHaveLength(2);

		// Resuelve PRIMERO la vieja (la que llegó tarde) y después la nueva.
		pending.shift()!(jsonResponse(tokenBody()));
		await flush();
		pending.shift()!(jsonResponse(tokenBody()));
		await flush();

		// Ni una recarga entera: el `<iframe>` sigue siendo el MISMO nodo y nadie pidió un cuarto
		// token (el del montaje más los dos refrescos, y se acabó).
		expect(mounted.target.querySelector('.vega-visual-frame')).toBe(iframeBefore);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	/** Desmontar con una petición de token EN VUELO (hallazgo de code-review). Cancelar los
	 *  temporizadores en `onDestroy` no basta: la petición que resuelve después pasaría su propia
	 *  guarda de generación, escribiría `tokenState` de un componente que ya no existe y armaría un
	 *  `renewTimer` que nadie puede cancelar, porque `onDestroy` no vuelve a correr. Ese
	 *  temporizador se reprograma solo y pide token para siempre. Es alcanzable: guardar limpia el
	 *  dirty (el guard de salida ya no pregunta) y deja un `refreshCanvas` pidiendo token por red. */
	test('desmontar con una petición de token en vuelo no deja NADA pidiendo tokens detrás', async () => {
		const pending: ((response: Response) => void)[] = [];
		const fetchMock = vi.fn(
			() => new Promise<Response>((resolve) => pending.push(resolve)) as Promise<Response>
		);
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();
		// Token del montaje NORMAL (una hora), a propósito: uno que caduque enseguida dispararía la
		// renovación DENTRO de la ventana de rebote, y esa renovación cancela el rebote y se lleva por
		// delante el refresco que este test quiere dejar en vuelo.
		pending.shift()!(jsonResponse(tokenBody()));
		await flush();
		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }], true);

		await saveHeading(mounted.target, 'Hero editado');
		await flushRefreshDebounce();
		expect(pending).toHaveLength(1);

		const local = mounted;
		mounted = null;
		await unmount(local.instance);
		local.target.remove();

		// Resuelve DESPUÉS del desmontaje. Sin invalidar la generación, esta continuación seguiría
		// adelante: el puente ya está parado, así que `refresh()` devuelve `false` y cae a
		// `requestPreview()`, que pide OTRO token — la tercera petición que este test prohíbe.
		pending.shift()!(jsonResponse(tokenBody()));
		await flush();
		await new Promise((resolve) => setTimeout(resolve, 200));
		await flush();

		// Dos peticiones y ni una más: la del montaje y la del refresco. Nada pidió token después.
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(pending).toHaveLength(0);
	});
});

// ————— El acabado (tarea "el acabado: tamaños de pantalla, zoom, atajos y estado de guardado")
// — tamaño de pantalla + zoom (`viewport.ts`, cubierto aparte en `viewport.test.ts`; aquí solo el
// DOM: el escenario escalado, el ancho de layout del iframe), atajos de teclado a nivel de
// PANTALLA, las tres ramas del estado de guardado en la barra, y las migas. -----

describe('VisualEditorScreen.svelte — el acabado (tamaños, zoom, atajos, estado de guardado)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		stubMatchMedia(false);
		stubResizeObserver();
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

	/** Mismo camino que `saveHeading` de la describe de refresco en vivo (no accesible desde aquí,
	 *  otro closure): selecciona la primera fila y escribe en su campo `heading`, SIN guardar. */
	async function editHeading(target: HTMLElement, value: string): Promise<void> {
		target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();
		const headingInput = target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.value = value;
		headingInput.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
	}

	// ————— Escenario escalado (zoom): el overlay vive DENTRO, el iframe conserva su ancho —————

	test('el overlay vive DENTRO del escenario escalado, junto al iframe', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		const stage = mounted.target.querySelector('.vega-visual-stage');
		expect(stage).not.toBeNull();
		// Los dos, DENTRO del mismo escenario — es lo único que garantiza que compartan el factor
		// de escala (ver cabecera de `VisualEditorScreen.svelte`, "El punto CENTRAL").
		expect(stage!.querySelector('.vega-visual-frame')).not.toBeNull();
		expect(stage!.querySelector('.vega-visual-overlay-root')).not.toBeNull();
	});

	test('cambiar el zoom escala el escenario con `transform`, sin tocar el ancho de LAYOUT del iframe', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		const resize = stubResizeObserver();
		mounted = mountScreen(ctx, type);
		await flush();

		// Escritorio (preset de partida): el ancho de layout es el MEDIDO del lienzo, nunca uno
		// inventado — se fuerza una medida controlada y se dispara el aviso a mano (ver cabecera de
		// `stubResizeObserver`).
		const canvasEl = mounted.target.querySelector('.vega-visual-canvas')!;
		vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
			width: 700,
			height: 500,
			top: 0,
			left: 0,
			right: 700,
			bottom: 500,
			x: 0,
			y: 0,
			toJSON: () => ({})
		} as DOMRect);
		resize.triggerResize();
		await tick();

		const stage = mounted.target.querySelector<HTMLElement>('.vega-visual-stage')!;
		expect(stage.style.width).toBe('700px');
		expect(stage.style.transform).toBe('scale(1)'); // 100% de partida

		const zoom50 = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-zoom-btn')
		).find(
			(btn) =>
				btn.textContent?.trim() === translate('es', 'editor.visual.zoom.level', { percent: 50 })
		)!;
		zoom50.click();
		await tick();

		// El ancho de LAYOUT no se movió ni un píxel: solo cambió `transform`. Es la landmine
		// central de la tarea (ver cabecera del componente) — si esto fallara, el overlay se
		// despegaría del iframe.
		expect(stage.style.width).toBe('700px');
		expect(stage.style.transform).toBe('scale(0.5)');
		expect(zoom50.getAttribute('aria-pressed')).toBe('true');
	});

	test('conmutador de tamaño: móvil/tableta fijan el ancho del iframe SIN mirar el lienzo', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		const stage = mounted.target.querySelector<HTMLElement>('.vega-visual-stage')!;
		const screenBtn = (label: string) =>
			Array.from(
				mounted!.target.querySelectorAll<HTMLButtonElement>('.vega-visual-screen-btn')
			).find((btn) => btn.textContent?.trim() === label)!;

		screenBtn(translate('es', 'editor.visual.screen.mobile')).click();
		await tick();
		expect(stage.style.width).toBe('390px');
		expect(mounted.target.querySelector('.vega-visual-screen-width')?.textContent).toContain('390');

		screenBtn(translate('es', 'editor.visual.screen.tablet')).click();
		await tick();
		expect(stage.style.width).toBe('834px');
	});

	// ————— Atajos de teclado —————

	test('Esc deselecciona el bloque', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();
		expect(mounted.target.querySelector('.vega-tree-row--selected')).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();

		expect(mounted.target.querySelector('.vega-tree-row--selected')).toBeNull();
	});

	test('Alt+↓ mueve el bloque seleccionado hacia abajo y persiste el nuevo orden', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })
		);
		await flush();

		const rows = await port.list('post_block', {
			sort: [{ field: 'sort', dir: 'asc' }],
			perPage: 50
		});
		expect(rows.items.map((r) => r.values.heading)).toEqual(['Features', 'Hero']);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // pidió vista previa nueva
	});

	test('mover por teclado se congela mientras haya CUALQUIER bloque con cambios sin guardar', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenBody()));
		vi.stubGlobal('fetch', fetchMock);
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);
		// b1 queda con un borrador sin guardar (mismo guard que el botón de mover del overlay/árbol).
		await editHeading(mounted.target, 'Hero a medias');
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })
		);
		await flush();

		const rows = await port.list('post_block', {
			sort: [{ field: 'sort', dir: 'asc' }],
			perPage: 50
		});
		expect(rows.items.map((r) => r.values.heading)).toEqual(['Hero', 'Features']); // sin cambios
	});

	test('Supr pide el borrado del seleccionado: abre el diálogo, NO borra a pelo', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type, port } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
		await tick();

		expect(mounted.target.querySelector('.vega-delete-confirm')).not.toBeNull();
		expect((await port.list('post_block', { perPage: 50 })).totalItems).toBe(2); // aún no borrado

		mounted.target.querySelector<HTMLButtonElement>('.vega-delete-confirm')!.click();
		await flush();
		expect((await port.list('post_block', { perPage: 50 })).totalItems).toBe(1);
	});

	test('ninguno de los atajos de una sola tecla dispara con el foco en un campo de texto', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();
		await connectBridge(mounted.target, [
			{ id: 'b1', type: 'hero' },
			{ id: 'b2', type: 'gallery' }
		]);
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		const headingInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.focus();

		// `Esc`: dispatchado SOBRE el campo enfocado (mismo `target` que un navegador real), no
		// sobre `window` — el escuchador vive en `window`, pero lo que decide `isEditableTarget` es
		// el `target` del evento, no dónde escucha.
		headingInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('.vega-tree-row--selected')).not.toBeNull(); // sigue

		headingInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('.vega-delete-confirm')).toBeNull(); // nada se abrió

		headingInput.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('[role="dialog"]')).toBeNull(); // tampoco el panel
	});

	test('⌘S SÍ guarda con el foco DENTRO de un campo de texto (la única excepción)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type, port } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		await editHeading(mounted.target, 'Hero por atajo');
		expect(mounted.target.querySelector('.vega-visual-dirty')).not.toBeNull();

		const headingInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body:not([hidden]) input[type="text"]'
		)!;
		headingInput.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true })
		);
		await flush();

		expect(mounted.target.querySelector('.vega-visual-dirty')).toBeNull();
		expect((await port.get('post_block', 'b1')).values.heading).toBe('Hero por atajo');
	});

	test('sin bloque seleccionado, ⌘S no revienta (no-op)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true }));
		await flush();

		expect(mounted.target.querySelector('.vega-visual-dirty')).toBeNull();
	});

	test('? abre el panel de ayuda con el foco atrapado; Esc lo cierra y devuelve el foco a su disparador', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		const helpToggle = mounted.target.querySelector<HTMLButtonElement>('.vega-visual-help-toggle')!;
		helpToggle.focus();
		helpToggle.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
		await tick();

		const dialog = mounted.target.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(document.activeElement?.classList.contains('vega-visual-help-close')).toBe(true);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();

		expect(mounted.target.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(helpToggle);
	});

	// ————— Estado de guardado en la barra: las TRES ramas —————

	test('estado de guardado: sin guardar → guardando → hora del último guardado', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type, port } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		// Antes de tocar nada: ninguna de las tres ramas.
		expect(mounted.target.querySelector('.vega-visual-dirty')).toBeNull();
		expect(mounted.target.querySelector('.vega-visual-saved-at')).toBeNull();

		// 1) Sin guardar.
		await editHeading(mounted.target, 'Hero editado');
		expect(mounted.target.querySelector('.vega-visual-dirty')).not.toBeNull();

		// 2) Guardando… — se congela el `port.update` real a mano para poder observar el estado
		// intermedio (mismo criterio que cualquier test de "en vuelo" de este fichero).
		let releaseSave!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseSave = resolve;
		});
		const originalUpdate = port.update.bind(port);
		vi.spyOn(port, 'update').mockImplementation(async (...args: Parameters<typeof port.update>) => {
			await gate;
			return originalUpdate(...args);
		});

		mounted.target
			.querySelector<HTMLButtonElement>(
				'.vega-inspector-body:not([hidden]) .vega-block-save-button'
			)!
			.click();
		await tick();

		expect(mounted.target.querySelector('.vega-visual-saved-at--saving')?.textContent).toContain(
			translate('es', 'editor.saving')
		);
		expect(mounted.target.querySelector('.vega-visual-dirty')).toBeNull(); // guardando gana

		// 3) Hora del último guardado.
		releaseSave();
		await flush();

		expect(mounted.target.querySelector('.vega-visual-saved-at--saving')).toBeNull();
		const savedAtEl = mounted.target.querySelector('.vega-visual-saved-at');
		expect(savedAtEl).not.toBeNull();
		expect(savedAtEl!.textContent).not.toBe('');
	});

	// ————— Migas —————

	test('migas: colección › documento, y el bloque seleccionado si lo hay (nunca un guion)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
		const { ctx, type } = await setup([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		const crumbs = () =>
			Array.from(mounted!.target.querySelectorAll('.vega-visual-breadcrumbs li')).map(
				(li) => li.textContent
			);
		expect(crumbs()).toEqual([type.label, 'Hola mundo']);

		await connectBridge(mounted.target, [{ id: 'b1', type: 'hero' }]);
		sendSiteMessage({ vega: 'vega-visual-1', type: 'select', blockId: 'b1' });
		await tick();

		expect(crumbs()).toEqual([type.label, 'Hola mundo', 'Hero']);
	});
});
