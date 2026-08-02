/**
 * `e2e/visual-site.ts` — un sitio de mentira que habla `vega-visual-1` (§"Visual editing bridge"
 * de `docs/PROJECT-CONTRACT-v1.md`, línea 297 en adelante). Existe para que
 * `e2e/visual-editor.spec.ts` pueda ejercer la MITAD de Vega del protocolo de punta a punta
 * contra un `<iframe>` de OTRO ORIGEN de verdad — ver la cabecera de ese fichero para el alcance
 * exacto de lo que esa suite compra y lo que NO.
 *
 * **Escrito leyendo el contrato, no `$lib/visual/bridge-client.ts`.** Copiar el cliente de Vega
 * aquí comprobaría que Vega se entiende consigo misma, que es justo lo que este doble viene a
 * evitar. Todo lo que sigue (el script embebido en `renderDocument`) es una implementación
 * INDEPENDIENTE del lado del SITIO, escrita contra la tabla de mensajes del contrato.
 *
 * ## Diseño
 * - Sirve TODO desde un origen fijo (`SITE_ORIGIN`, `.example`, RFC 2606 — nunca resuelve DNS de
 *   verdad) interceptado con `page.route()`: el test es determinista sin montar un servidor
 *   aparte y sin que Chromium intente una conexión real.
 * - `POST {previewApiUrl}/token` (forma de `$lib/backend/preview-client.ts#PreviewToken`) siempre
 *   devuelve la MISMA `url` (`${SITE_ORIGIN}${PREVIEW_PAGE_PATH}`): quien quiera distinguir una
 *   recarga completa de una sustitución en caliente no puede mirar si la URL cambió (aquí nunca
 *   cambia), tiene que mirar qué TIPO de petición pidió esa URL — de ahí `requestCounts()`.
 * - `GET/POST {previewPageUrl}` renderiza el HTML ACTUAL de `state` (mutable, en closure de
 *   Node): el propio bridge del sitio lo vuelve a pedir con `fetch()` en cada `refresh` en vivo
 *   (petición `resourceType() === 'fetch'`), y el `<iframe>` lo vuelve a pedir por navegación en
 *   cada recarga completa (`resourceType() === 'document'`). Los dos casos comparten un único
 *   generador de HTML; lo único que distingue un camino del otro es CÓMO llegó la petición, así
 *   que `requestCounts()` los cuenta por separado.
 * - `setBlocks()`/`setLiveRefresh()` mutan `state` desde el test: simulan que "el backend ya
 *   guardó el campo que se acaba de editar" en el momento justo (antes de disparar el guardado en
 *   la UI), igual que en producción el endpoint de preview real leería PocketBase ya actualizado.
 *   `goDown()` simula el sitio caído a mitad de sesión: toda petición posterior a este origen
 *   (token o documento) se aborta como un fallo de conexión de verdad.
 *
 * ## Lo que NO hace este doble (documentado para que nadie se fíe de más)
 * - No valida el token (`postToken`/`token` de la petición de refresco): siempre sirve el HTML
 *   actual, sin comprobar que el ciphertext sea el que Vega mandó. El contrato de confidencialidad
 *   del token es cosa de la extensión Go real (`vegapreview`), fuera del alcance de esta suite.
 * - No reproduce el allowlist de orígenes del sitio (§"Security" del contrato): valida un único
 *   origen fijo (`APP_ORIGIN`, más abajo) en vez de leer una lista configurable, porque aquí solo
 *   hay un padre posible.
 */
import type { Page, Route } from '@playwright/test';

/** Dominio reservado para documentación/pruebas (RFC 2606): nunca resuelve DNS de verdad, y
 *  `page.route()` lo intercepta antes de que Chromium intente averiguarlo. */
export const SITE_ORIGIN = 'https://vega-visual-site.example';

/** Origen de la app bajo prueba (`playwright.config.ts`, `PORT = 4173`). Playwright corre en un
 *  runtime Node aparte de Vite y no resuelve el alias `$lib`, así que se duplica aquí a
 *  propósito — mismo criterio que `e2e/fixtures.ts` con las credenciales de demo. */
const APP_ORIGIN = 'http://localhost:4173';

const PREVIEW_API_PATH = '/api/vega-preview';
const PREVIEW_PAGE_PATH = '/preview';

export interface VisualSiteBlock {
	id: string;
	type: string;
	text: string;
}

export interface VisualSiteOptions {
	/** Colección/id del registro PADRE que esta sesión edita (`ready`, §contrato) — NO el de los
	 *  bloques. `bridge-client.ts` contrasta el `ready` contra `{collection: type.name, id:
	 *  record.id}` de la pantalla (`VisualEditorScreen.svelte#ensureBridgeClient`), así que esto
	 *  tiene que ser la página (`paginas`/su id), nunca `secciones`. */
	collection: string;
	id: string;
	blocks: VisualSiteBlock[];
	/** `ready.liveRefresh` (§"Live refresh" del contrato). Ausente = `false`, mismo criterio de
	 *  degradación que el propio contrato. */
	liveRefresh?: boolean;
}

interface SiteState {
	collection: string;
	id: string;
	blocks: VisualSiteBlock[];
	liveRefresh: boolean;
	/** Ver `goDown()`: `true` ⇒ toda petición a este origen falla como una conexión caída de
	 *  verdad, no como un 404 — es la diferencia entre "el sitio no tiene esta ruta" y "el sitio no
	 *  contesta". */
	down: boolean;
}

export interface RequestCounts {
	/** Peticiones al DOCUMENTO de `{previewPageUrl}` (`resourceType() === 'document'`): una
	 *  recarga completa del `<iframe>`, la que provoca el flicker que el QA de David va a mirar. */
	documents: number;
	/** Peticiones al MISMO `{previewPageUrl}` hechas por el propio `fetch()` del sitio durante un
	 *  refresco en vivo (`resourceType() !== 'document'`, normalmente `'fetch'`): sustitución en
	 *  caliente de `data-vega-blocks-root`, sin recargar el marco. */
	fetches: number;
}

export interface VisualSite {
	/** Para fijar en `window.__VEGA_PREVIEW_API_URL__` (ver cabecera de `session/backend.ts`). */
	readonly previewApiUrl: string;
	/** Instala la interceptación en ESTA página. Llamar antes de `page.goto()`/`loginAsDemo()`, o
	 *  la primera petición real (que no debería llegar nunca) escaparía a la red de verdad. */
	install(page: Page): Promise<void>;
	/** Sustituye los bloques que sirven las PRÓXIMAS peticiones (token nuevo, documento del
	 *  `<iframe>`, o el `fetch()` interno de un refresco en vivo). */
	setBlocks(blocks: VisualSiteBlock[]): void;
	setLiveRefresh(liveRefresh: boolean): void;
	/** El sitio deja de responder a partir de ahora (ver `SiteState.down`). No hay "volver a
	 *  subir": el caso límite que existe para ejercitar es justo que no cure solo. */
	goDown(): void;
	/** Cuántas veces se pidió `POST {previewApiUrl}/token`, para comprobar que Vega SÍ pidió un
	 *  token nuevo tras guardar (y no se quedó enseñando el de antes). */
	tokenRequestCount(): number;
	/** Ver `RequestCounts`: cuenta separada de recarga completa vs. refresco en vivo del documento
	 *  del `<iframe>`. */
	requestCounts(): RequestCounts;
}

/** Tipos que este sitio de mentira SÍ sabe pintar. Cualquier otro tipo cae en el marcado de "no
 *  sé pintar esto" (§contrato: "A block whose type is broken is precisely the one an author wants
 *  to open, so it stays selectable like any other" — sigue anotado con sus atributos `data-vega-*`
 *  y su `rect`, solo cambia lo que hay DENTRO). */
const KNOWN_TYPES = new Set(['seccion']);

function escapeHtml(raw: string): string {
	return raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderBlock(block: VisualSiteBlock): string {
	const body = KNOWN_TYPES.has(block.type)
		? `<h2>${escapeHtml(block.text)}</h2>`
		: `<p class="unknown">No sé pintar el tipo «${escapeHtml(block.type)}». Contenido: ${escapeHtml(
				block.text
			)}</p>`;
	return `<section data-vega-block-id="${escapeHtml(block.id)}" data-vega-block-type="${escapeHtml(
		block.type
	)}" class="block">${body}</section>`;
}

/**
 * Genera el documento HTML entero, con el script del puente embebido — implementación
 * INDEPENDIENTE de `bridge-client.ts` (ver cabecera del módulo), escrita contra la tabla de
 * mensajes del contrato. `parentOrigin` es el ÚNICO origen al que este script escribe y del que
 * acepta un mensaje (§"Security" del contrato: "requires an explicit origin allowlist" — aquí,
 * fijo en vez de configurable, ver "Lo que NO hace este doble").
 *
 * El script:
 * - Mide cada bloque con `getBoundingClientRect()` de verdad (nunca un número inventado): así el
 *   test puede distinguir un lienzo bien colocado de uno mal colocado.
 * - Postea `ready` al iniciar y en respuesta a cada `hello` (idempotente, §contrato).
 * - Postea `select` cuando el clic cae dentro de un bloque.
 * - Postea `layout` (como mucho una vez por frame de animación) cuando la ventana cambia de
 *   tamaño — el único disparador de geometría que un doble sin más interacción necesita.
 * - Responde a `refresh {url, postToken}` pidiendo esa URL él mismo (GET sin `postToken`, POST con
 *   el campo de formulario `token` si lo hay, tal cual el contrato) y sustituyendo el `innerHTML`
 *   de `data-vega-blocks-root` por el de la respuesta, después vuelve a anunciarse con `ready`
 *   (nunca `layout`, §contrato). Si la petición falla, contesta `error {code: 'refresh-failed'}`.
 */
function renderDocument(state: SiteState, parentOrigin: string): string {
	const config = {
		vega: 'vega-visual-1',
		collection: state.collection,
		id: state.id,
		liveRefresh: state.liveRefresh,
		parentOrigin
	};
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Sitio de mentira (vega-visual-1)</title>
<style>
  body { font-family: sans-serif; margin: 0; padding: 1rem; background: #fff; color: #111; }
  .block { border: 1px dashed #999; margin: 0 0 1rem; padding: 1rem; }
  .unknown { color: #b00020; }
</style>
</head>
<body>
<main data-vega-blocks-root>
${state.blocks.map(renderBlock).join('\n')}
</main>
<script>
(function () {
  var CONFIG = ${JSON.stringify(config)};

  function collectBlocks() {
    var root = document.querySelector('[data-vega-blocks-root]');
    var nodes = root ? root.querySelectorAll('[data-vega-block-id]') : [];
    var blocks = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var rect = el.getBoundingClientRect();
      blocks.push({
        id: el.getAttribute('data-vega-block-id'),
        type: el.getAttribute('data-vega-block-type'),
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      });
    }
    return blocks;
  }

  function post(message) {
    var envelope = Object.assign({ vega: 'vega-visual-1' }, message);
    window.parent.postMessage(envelope, CONFIG.parentOrigin);
  }

  function sendReady() {
    post({
      type: 'ready',
      collection: CONFIG.collection,
      id: CONFIG.id,
      blocks: collectBlocks(),
      liveRefresh: CONFIG.liveRefresh
    });
  }

  var layoutScheduled = false;
  window.addEventListener('resize', function () {
    if (layoutScheduled) return;
    layoutScheduled = true;
    window.requestAnimationFrame(function () {
      layoutScheduled = false;
      post({ type: 'layout', blocks: collectBlocks() });
    });
  });

  document.addEventListener('click', function (event) {
    var el = event.target.closest ? event.target.closest('[data-vega-block-id]') : null;
    if (!el) return;
    post({ type: 'select', blockId: el.getAttribute('data-vega-block-id') });
  });

  function handleRefresh(url, postToken) {
    var options = postToken
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'token=' + encodeURIComponent(postToken)
        }
      : { method: 'GET' };
    fetch(url, options)
      .then(function (response) {
        if (!response.ok) throw new Error('estado ' + response.status);
        return response.text();
      })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        var newRoot = doc.querySelector('[data-vega-blocks-root]');
        var root = document.querySelector('[data-vega-blocks-root]');
        if (!newRoot || !root) throw new Error('respuesta sin data-vega-blocks-root');
        root.innerHTML = newRoot.innerHTML;
        sendReady();
      })
      .catch(function () {
        post({ type: 'error', code: 'refresh-failed', message: 'no se pudo refrescar en caliente' });
      });
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== CONFIG.parentOrigin) return;
    var data = event.data;
    if (!data || data.vega !== 'vega-visual-1') return;
    if (data.type === 'hello') sendReady();
    else if (data.type === 'refresh') handleRefresh(data.url, data.postToken);
    // 'highlight'/'scroll-to': este doble no necesita reaccionar visualmente para los tests.
  });

  sendReady();
})();
</script>
</body>
</html>`;
}

export function createVisualSite(options: VisualSiteOptions): VisualSite {
	const state: SiteState = {
		collection: options.collection,
		id: options.id,
		blocks: options.blocks,
		liveRefresh: options.liveRefresh ?? false,
		down: false
	};
	let tokenRequests = 0;
	const counts: RequestCounts = { documents: 0, fetches: 0 };

	const previewApiUrl = `${SITE_ORIGIN}${PREVIEW_API_PATH}`;
	const previewPageUrl = `${SITE_ORIGIN}${PREVIEW_PAGE_PATH}`;

	async function handleRoute(route: Route): Promise<void> {
		const request = route.request();
		const url = new URL(request.url());

		// Preflight de CORS: `preview-client.ts` manda `Content-Type: application/json` +
		// `Authorization`, las dos "no simples" para el navegador, así que un POST cross-origin de
		// verdad (la app vive en `APP_ORIGIN`, este sitio en `SITE_ORIGIN`) dispara un `OPTIONS`
		// antes. Sin esto el `fetch()` de `preview-client.ts` fallaría por CORS antes de que la
		// interceptación de más abajo llegara a importar.
		if (request.method() === 'OPTIONS') {
			await route.fulfill({
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': APP_ORIGIN,
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
				},
				body: ''
			});
			return;
		}

		if (state.down) {
			await route.abort('connectionfailed');
			return;
		}

		if (url.pathname === `${PREVIEW_API_PATH}/token` && request.method() === 'POST') {
			tokenRequests++;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				headers: { 'Access-Control-Allow-Origin': APP_ORIGIN },
				body: JSON.stringify({
					url: previewPageUrl,
					expiresAt: new Date(Date.now() + 60_000).toISOString()
				})
			});
			return;
		}

		if (url.pathname === PREVIEW_PAGE_PATH) {
			// Ver cabecera "Diseño": el TIPO de la petición (navegación de documento vs. `fetch()`
			// del propio bridge) es la única forma de distinguir una recarga completa de un
			// refresco en vivo, porque las dos piden EXACTAMENTE la misma URL.
			if (request.resourceType() === 'document') counts.documents++;
			else counts.fetches++;
			await route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: renderDocument(state, APP_ORIGIN)
			});
			return;
		}

		await route.fulfill({ status: 404, contentType: 'text/plain', body: 'no encontrado' });
	}

	return {
		previewApiUrl,

		async install(page) {
			await page.route(`${SITE_ORIGIN}/**`, (route) => handleRoute(route));
		},

		setBlocks(blocks) {
			state.blocks = blocks;
		},

		setLiveRefresh(liveRefresh) {
			state.liveRefresh = liveRefresh;
		},

		goDown() {
			state.down = true;
		},

		tokenRequestCount() {
			return tokenRequests;
		},

		requestCounts() {
			return { ...counts };
		}
	};
}
