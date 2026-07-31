/**
 * Cliente del puente de EDICIÓN VISUAL: la mitad que vive en Vega del protocolo
 * `vega-visual-1` (§"Visual editing bridge" de `docs/PROJECT-CONTRACT-v1.md`). Puro transporte
 * y máquina de estados — mismo reparto que `backend/preview-client.ts`: aquí no hay PocketBase,
 * ni campos, ni selección; eso vive en la pantalla que lo consume.
 *
 * **Por qué existe**: el iframe de la vista previa es de OTRO origen, así que Vega no puede leer
 * ni un nodo de su DOM (política del navegador, y motivo explícito de la cabecera de
 * `form/PreviewPanel.svelte`). Todo lo que Vega sabe del lienzo se lo dice el sitio por
 * `postMessage`. No hay camino de reserva que meta la mano en el marco, porque no puede haberlo.
 *
 * **Lo que decide la capacidad es el SALUDO, no el anuncio.** `session/project-discovery.ts` lee
 * `preview.visualEditing`, pero un discovery sobrevive perfectamente al código que decía
 * describir: un sitio que lo anuncia tras quitar el puente dejaría a Vega esperando para siempre.
 * Por eso este módulo trata el anuncio como una promesa y el `ready` como la prueba.
 *
 * **La degradación es la mitad del módulo, no su apéndice** — es donde se cae este tipo de
 * función. Los cuatro caminos, todos con test propio:
 * 1. Nadie contesta al saludo dentro del plazo → `error/no-bridge`. Quien lo consume ofrece la
 *    vista previa de siempre, que sí funciona. Nunca un lienzo mudo.
 * 2. Mensaje de un origen que no casa → se descarta EN SILENCIO y no cuenta como respuesta: no
 *    adelanta el saludo, no cambia el estado y no puede tumbar la sesión.
 * 3. Sobre `vega` con una versión que no implementamos → `error/protocol-version` NOMBRANDO la
 *    versión recibida y la esperada, sin interpretar el mensaje ni a medias. El contrato dice
 *    "ignored" en el sentido de «no se interpreta»; callarse del todo mandaría al autor al
 *    plazo del punto 1, que le diría que el sitio no tiene puente cuando sí lo tiene y habla
 *    otro idioma. Se ignora el CONTENIDO y se reporta la CAUSA.
 * 4. El propio puente avisa de que no puede trabajar (`error`) → `error/site-error` con su
 *    código.
 *
 * **El texto de la interfaz NO vive aquí**: el estado expone un `kind` cerrado y la pantalla lo
 * traduce por `i18n`. Este módulo no importa Svelte, no toca `window` y no registra ningún
 * escuchador: recibe los mensajes por `handleMessage()` y escribe por el `MessagePoster` que le
 * inyectan. Así se prueba entero sin DOM, y el cableado (un `window.addEventListener('message')`
 * con su limpieza) queda en un solo sitio, el componente del lienzo.
 */

/** Versión del protocolo que implementa este cliente. Viaja DENTRO de cada mensaje (§contrato):
 *  el sobre es lo que distingue un mensaje del puente del ruido que cualquier extensión, el HMR
 *  de Vite o un anuncio embebido postean a la misma ventana. */
export const VISUAL_PROTOCOL_VERSION = 'vega-visual-1';

/** Nº de saludos antes de darse por vencido, y separación entre ellos. El arranque es una
 *  carrera en los dos sentidos (el sitio no sabe cuándo montó Vega y Vega no sabe cuándo
 *  terminó de evaluar sus scripts el documento), así que los dos hablan primero y los dos
 *  toleran repetición. Plazo total = `attempts × interval`. */
const DEFAULT_HELLO_ATTEMPTS = 5;
const DEFAULT_HELLO_INTERVAL_MS = 400;

/** Tope del texto libre que llega en un `error` del puente. La ruta de vista previa renderiza
 *  contenido sin publicar, así que ese texto puede acabar dependiendo de datos editoriales: se
 *  recorta antes de guardarlo para que no pueda desbordar la pantalla que lo pinte. */
const DETAIL_MAX_LENGTH = 200;

// ————— Vocabulario del protocolo (§"Handshake and message envelope" del contrato) —————

/** Rectángulo de un bloque en píxeles CSS, relativo al VIEWPORT DEL PROPIO MARCO. El
 *  desplazamiento del marco y el zoom del lienzo los aplica Vega; el puente no sabe que lo están
 *  escalando. */
export interface BlockRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

/** Un bloque tal y como lo describe el sitio: su identificador (`data-vega-block-id`), su tipo
 *  (`data-vega-block-type`) y dónde está. */
export interface VisualBlock {
	id: string;
	type: string;
	rect: BlockRect;
}

/** Mensajes del SITIO a Vega, ya validados. `skipped` no viaja por el cable: lo cuenta el
 *  parseo (ver `parseBlocks`). */
export type SiteMessage =
	| { type: 'ready'; collection: string; id: string; blocks: VisualBlock[]; skipped: number }
	| { type: 'layout'; blocks: VisualBlock[]; skipped: number }
	| { type: 'select'; blockId: string }
	| { type: 'error'; code: string; detail: string | null };

/** Veredicto del parseo. `foreign` es el caso ABUNDANTE (una ventana recibe mensajes de todo el
 *  mundo) y por eso se distingue de `malformed`, que sí es un puente hablando mal. */
export type ParsedSiteMessage =
	| { status: 'ok'; message: SiteMessage }
	| { status: 'foreign' }
	| { status: 'version'; version: string }
	| { status: 'malformed' };

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseRect(raw: unknown): BlockRect | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const record = raw as Record<string, unknown>;
	const top = finiteNumber(record.top);
	const left = finiteNumber(record.left);
	const width = finiteNumber(record.width);
	const height = finiteNumber(record.height);
	if (top === null || left === null || width === null || height === null) return null;
	// Un ancho o alto negativo no es un bloque estrecho, es un dato roto: no se puede dibujar
	// contorno con él. Cero SÍ se acepta (un bloque colapsado u oculto sigue existiendo en la
	// secuencia y su ficha se tiene que poder abrir).
	if (width < 0 || height < 0) return null;
	return { top, left, width, height };
}

/**
 * Valida la lista de bloques descartando los ROTOS uno a uno, no el mensaje entero.
 *
 * A diferencia de `parsePreviewToken` (`backend/preview-client.ts`), que es todo-o-nada porque
 * sin `url` no queda nada que embeber, aquí invalidar el documento entero por un rectángulo malo
 * sería peor por los dos lados: ese bloque se pierde igual (sin `rect` no hay nada que dibujar)
 * y ADEMÁS los demás se quedarían congelados en una posición vieja mientras la página se mueve.
 * Se descarta el bloque y se CUENTA, para que el lienzo pueda decirlo en vez de que desaparezca
 * en silencio.
 */
function parseBlocks(raw: unknown): { blocks: VisualBlock[]; skipped: number } | null {
	if (!Array.isArray(raw)) return null;
	const blocks: VisualBlock[] = [];
	let skipped = 0;
	for (const entry of raw) {
		if (typeof entry !== 'object' || entry === null) {
			skipped++;
			continue;
		}
		const record = entry as Record<string, unknown>;
		const id = nonEmptyString(record.id);
		const type = nonEmptyString(record.type);
		const rect = parseRect(record.rect);
		if (!id || !type || !rect) {
			skipped++;
			continue;
		}
		blocks.push({ id, type, rect });
	}
	return { blocks, skipped };
}

/**
 * Valida un mensaje recibido del marco. NO mira el origen (eso es del cliente, que es quien sabe
 * contra qué URL contrastarlo): aquí solo se decide si el sobre es nuestro y si el cuerpo tiene
 * forma.
 */
export function parseSiteMessage(raw: unknown): ParsedSiteMessage {
	if (typeof raw !== 'object' || raw === null) return { status: 'foreign' };
	const record = raw as Record<string, unknown>;
	const envelope = record.vega;
	if (typeof envelope !== 'string') return { status: 'foreign' };
	if (envelope !== VISUAL_PROTOCOL_VERSION) return { status: 'version', version: envelope };

	switch (record.type) {
		case 'ready': {
			const collection = nonEmptyString(record.collection);
			const id = nonEmptyString(record.id);
			const parsed = parseBlocks(record.blocks);
			// Un `ready` sin identidad de registro no sirve de saludo: el lienzo no sabría contra
			// qué registro está trabajando, y aceptarlo daría por bueno un puente que no puede
			// contestar a lo que se le va a preguntar.
			if (!collection || !id || !parsed) return { status: 'malformed' };
			return {
				status: 'ok',
				message: { type: 'ready', collection, id, ...parsed }
			};
		}
		case 'layout': {
			const parsed = parseBlocks(record.blocks);
			if (!parsed) return { status: 'malformed' };
			return { status: 'ok', message: { type: 'layout', ...parsed } };
		}
		case 'select': {
			const blockId = nonEmptyString(record.blockId);
			if (!blockId) return { status: 'malformed' };
			return { status: 'ok', message: { type: 'select', blockId } };
		}
		case 'error': {
			const code = nonEmptyString(record.code);
			if (!code) return { status: 'malformed' };
			const detail = nonEmptyString(record.message);
			return {
				status: 'ok',
				message: { type: 'error', code, detail: detail ? detail.slice(0, DETAIL_MAX_LENGTH) : null }
			};
		}
		default:
			return { status: 'malformed' };
	}
}

// ————— Estado que ve el lienzo —————

/** Causas por las que el puente no está disponible. Cerrada a propósito: la pantalla traduce
 *  cada una a su texto por `i18n`, y añadir una obliga a escribir qué se le dice al autor. */
export type VisualBridgeErrorKind =
	/** El endpoint devolvió una URL de la que no se puede sacar un origen con el que validar. Se
	 *  falla CERRADO: sin origen esperado no se acepta ningún mensaje ni se manda ninguno. */
	| 'bad-preview-url'
	/** Nadie contestó al saludo dentro del plazo. */
	| 'no-bridge'
	/** El puente habla otra versión del protocolo. */
	| 'protocol-version'
	/** El puente avisó de que no puede hacer su trabajo. */
	| 'site-error';

export type VisualBridgeState =
	| { status: 'idle' }
	/** `attempts` = saludos ya enviados, para que la pantalla pueda decir que sigue intentándolo. */
	| { status: 'connecting'; attempts: number }
	| {
			status: 'connected';
			collection: string;
			id: string;
			blocks: VisualBlock[];
			/** Bloques que el sitio describió mal y no se pueden dibujar (ver `parseBlocks`). */
			skippedBlocks: number;
	  }
	| {
			status: 'error';
			kind: VisualBridgeErrorKind;
			/** Solo en `protocol-version`: la versión que dijo el otro lado. */
			version?: string;
			/** Solo en `site-error`: el código del puente y su texto, ya recortado. */
			code?: string;
			detail?: string | null;
	  };

/** Lo mínimo de una ventana para poder escribirle. Se inyecta como función porque el
 *  `contentWindow` del iframe cambia con cada navegación y no existe hasta que monta. */
export interface MessagePoster {
	postMessage(data: unknown, targetOrigin: string): void;
}

/** Lo mínimo de un `MessageEvent` que este cliente mira. */
export interface MessageEventLike {
	origin: string;
	data: unknown;
	source?: unknown;
}

/** Qué se hizo con un mensaje. Se devuelve para poder afirmarlo en tests y para que el lienzo
 *  pueda contar los descartes sin que este módulo decida cómo se registran. */
export type MessageVerdict =
	| 'accepted'
	/** El cliente no está escuchando (parado, o nunca arrancó). */
	| 'inactive'
	/** Origen distinto del de la vista previa. Silencioso a propósito. */
	| 'foreign-origin'
	/** Origen bueno pero otra ventana del mismo sitio. */
	| 'foreign-source'
	/** Sin sobre `vega`: ruido de terceros. */
	| 'ignored'
	/** Sobre `vega` con otra versión. */
	| 'version'
	/** Sobre bueno, cuerpo sin forma. */
	| 'malformed'
	/** Válido, pero no aplicable al estado actual (geometría antes del saludo). */
	| 'out-of-order';

export interface VisualBridgeClientOptions {
	/** La `url` que devolvió `POST {apiBasePath}/token` (`backend/preview-client.ts`). Es opaca
	 *  para Vega salvo por esto: su ORIGEN es el único que se acepta y el único al que se
	 *  escribe. */
	previewUrl: string;
	/** Base para resolver una `previewUrl` relativa (normalmente `location.href`). El contrato no
	 *  obliga a que la URL sea absoluta: se embebe tal cual en el `<iframe src>`. */
	documentUrl?: string;
	/** Ventana del iframe, resuelta en cada uso: al montar todavía no existe y tras navegar es
	 *  otra. Devolver `null` es normal, no un error. */
	frame: () => MessagePoster | null;
	helloAttempts?: number;
	helloIntervalMs?: number;
	/** Se llama en CADA cambio de estado (incluido el inicial de `start()`). */
	onState?: (state: VisualBridgeState) => void;
	/** El autor hizo clic dentro de ese bloque. La selección la lleva la pantalla, no este
	 *  módulo: un segundo dueño del bloque seleccionado es la vía a que las dos mitades enseñen
	 *  cosas distintas. */
	onSelect?: (blockId: string) => void;
}

export interface VisualBridgeClient {
	readonly state: VisualBridgeState;
	/** Origen contra el que se valida y al que se escribe; `null` si la URL no daba ninguno. */
	readonly expectedOrigin: string | null;
	/** Se llama cuando el iframe dispara `load` (§contrato). Idempotente: llamarlo dos veces sin
	 *  `stop()` no duplica los saludos. */
	start(): void;
	/** Desmontaje: cancela el temporizador pendiente y deja de aceptar mensajes. */
	stop(): void;
	handleMessage(event: MessageEventLike): MessageVerdict;
	/** El puntero está sobre ese bloque en la lista de contornos de Vega. */
	highlight(blockId: string): void;
	/** Trae ese bloque a la vista dentro del marco. */
	scrollTo(blockId: string): void;
}

/** Saca el origen de la URL de vista previa. `origin` puede salir como la cadena `'null'` (un
 *  `data:`/`blob:`, un origen opaco): eso NO es un origen con el que validar nada, así que se
 *  trata igual que una URL ilegible. */
function originOf(previewUrl: string, documentUrl?: string): string | null {
	try {
		const origin = new URL(previewUrl, documentUrl).origin;
		return origin && origin !== 'null' ? origin : null;
	} catch {
		return null;
	}
}

/**
 * Crea el cliente contra un iframe concreto. No arranca solo: la pantalla llama a `start()`
 * cuando el marco dispara `load`, porque antes no hay nadie escuchando al otro lado.
 */
export function createVisualBridgeClient(opts: VisualBridgeClientOptions): VisualBridgeClient {
	const expectedOrigin = originOf(opts.previewUrl, opts.documentUrl);
	const helloAttempts = opts.helloAttempts ?? DEFAULT_HELLO_ATTEMPTS;
	const helloIntervalMs = opts.helloIntervalMs ?? DEFAULT_HELLO_INTERVAL_MS;

	let state: VisualBridgeState = { status: 'idle' };
	let active = false;
	let sent = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function setState(next: VisualBridgeState): void {
		state = next;
		opts.onState?.(next);
	}

	function clearTimer(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	function post(message: Record<string, unknown>): void {
		if (!expectedOrigin) return;
		const frame = opts.frame();
		if (!frame) return;
		try {
			// Nunca `'*'`: si el marco navegó a otro sitio, escribir a cualquiera entregaría el
			// mensaje —y con él la existencia de la sesión de edición— a quien esté ahí ahora.
			frame.postMessage({ vega: VISUAL_PROTOCOL_VERSION, ...message }, expectedOrigin);
		} catch {
			// Un marco desmontado a media tanda de saludos no es un fallo del protocolo: si nadie
			// contesta, el plazo de `no-bridge` lo dirá con el texto que toca.
		}
	}

	function fail(
		kind: VisualBridgeErrorKind,
		extra?: { version?: string; code?: string; detail?: string | null }
	): void {
		clearTimer();
		setState({ status: 'error', kind, ...extra });
	}

	/** Saluda y se vuelve a programar. Tras el último saludo, un intervalo más de espera antes de
	 *  darse por vencido: el plazo total es `attempts × interval`. */
	function tick(): void {
		if (sent >= helloAttempts) {
			fail('no-bridge');
			return;
		}
		sent++;
		setState({ status: 'connecting', attempts: sent });
		post({ type: 'hello' });
		timer = setTimeout(tick, helloIntervalMs);
	}

	return {
		get state() {
			return state;
		},
		expectedOrigin,

		start() {
			if (active) return;
			if (!expectedOrigin) {
				// Sin origen esperado no hay validación posible, así que no se escucha ni se escribe.
				active = false;
				setState({ status: 'error', kind: 'bad-preview-url' });
				return;
			}
			active = true;
			sent = 0;
			tick();
		},

		stop() {
			active = false;
			clearTimer();
			setState({ status: 'idle' });
		},

		handleMessage(event) {
			if (!active) return 'inactive';
			if (event.origin !== expectedOrigin) return 'foreign-origin';
			// El origen solo dice de qué SITIO viene, no de qué ventana: otro marco del mismo
			// origen (un anuncio, un widget embebido dentro de la propia página de vista previa)
			// pasaría la comprobación anterior. Cuando las dos partes se pueden resolver, se exige
			// identidad; si el evento no trae `source`, el origen es lo único que hay.
			const frame = opts.frame();
			if (frame && event.source && event.source !== frame) return 'foreign-source';

			const parsed = parseSiteMessage(event.data);
			if (parsed.status === 'foreign') return 'ignored';
			if (parsed.status === 'malformed') return 'malformed';
			if (parsed.status === 'version') {
				fail('protocol-version', { version: parsed.version });
				return 'version';
			}

			const message = parsed.message;
			switch (message.type) {
				case 'ready':
					// Idempotente por contrato: un `ready` repetido (el puente contestando a un
					// `hello` tardío) no reinicia nada, solo refresca lo que describe.
					clearTimer();
					setState({
						status: 'connected',
						collection: message.collection,
						id: message.id,
						blocks: message.blocks,
						skippedBlocks: message.skipped
					});
					return 'accepted';
				case 'layout':
					// Geometría antes del saludo: el puente tiene que anunciarse primero, o el
					// lienzo estaría pintando contornos de un registro que no sabe cuál es.
					if (state.status !== 'connected') return 'out-of-order';
					setState({ ...state, blocks: message.blocks, skippedBlocks: message.skipped });
					return 'accepted';
				case 'select':
					if (state.status !== 'connected') return 'out-of-order';
					opts.onSelect?.(message.blockId);
					return 'accepted';
				case 'error':
					fail('site-error', { code: message.code, detail: message.detail });
					return 'accepted';
			}
		},

		highlight(blockId) {
			if (state.status !== 'connected') return;
			post({ type: 'highlight', blockId });
		},

		scrollTo(blockId) {
			if (state.status !== 'connected') return;
			post({ type: 'scroll-to', blockId });
		}
	};
}
