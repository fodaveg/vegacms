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
 *  nuevos (árbol/inspector), no en los heredados (que ya la tenían inline). */
async function connectBridge(
	target: HTMLElement,
	blocks: { id: string; type: string }[]
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
		}))
	});
	await tick();
}

describe('VisualEditorScreen.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

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
		const setNarrow = stubMatchMedia(true);

		const { ctx, type } = await setup();
		mounted = mountScreen(ctx, type);
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
