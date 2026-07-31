/**
 * Suite de `bridge-client.ts` (lote del editor visual, §"Visual editing bridge" del contrato de
 * proyecto): `parseSiteMessage` (sobre, forma y descarte por bloque) y
 * `createVisualBridgeClient` (saludo repetido, validación de origen y las CINCO degradaciones
 * que son el motivo del módulo: sin puente, origen ajeno, versión desconocida, error del propio
 * puente y marco pintando otro registro), más el reenganche tras cualquiera de ellas.
 *
 * Sin PocketBase y sin DOM: el cliente recibe mensajes por `handleMessage()` y escribe por un
 * `MessagePoster` de mentira, así que aquí se ejerce el protocolo entero con temporizadores
 * falsos. Mismo criterio de tests que `backend/preview-client.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	createVisualBridgeClient,
	parseSiteMessage,
	VISUAL_PROTOCOL_VERSION,
	type MessagePoster,
	type VisualBlock,
	type VisualBridgeState
} from './bridge-client';

const ORIGIN = 'https://sitio.test';
const PREVIEW_URL = `${ORIGIN}/editor-mode/preview/pages/abc123?token=firmado`;

const RECT = { top: 10, left: 0, width: 320, height: 200 };
const BLOCK: VisualBlock = { id: 'blk1', type: 'hero', rect: RECT };

function envelope(body: Record<string, unknown>): Record<string, unknown> {
	return { vega: VISUAL_PROTOCOL_VERSION, ...body };
}

const READY = envelope({ type: 'ready', collection: 'pages', id: 'abc123', blocks: [BLOCK] });

describe('parseSiteMessage', () => {
	test('acepta los cuatro mensajes del sitio con su forma del contrato', () => {
		expect(parseSiteMessage(READY)).toEqual({
			status: 'ok',
			message: { type: 'ready', collection: 'pages', id: 'abc123', blocks: [BLOCK], skipped: 0 }
		});
		expect(parseSiteMessage(envelope({ type: 'layout', blocks: [BLOCK] }))).toEqual({
			status: 'ok',
			message: { type: 'layout', blocks: [BLOCK], skipped: 0 }
		});
		expect(parseSiteMessage(envelope({ type: 'select', blockId: 'blk1' }))).toEqual({
			status: 'ok',
			message: { type: 'select', blockId: 'blk1' }
		});
		expect(
			parseSiteMessage(envelope({ type: 'error', code: 'no-allowlist', message: 'vacía' }))
		).toEqual({
			status: 'ok',
			message: { type: 'error', code: 'no-allowlist', detail: 'vacía' }
		});
	});

	test('sin sobre "vega" es ruido ajeno, no un puente hablando mal', () => {
		// Una ventana recibe mensajes de extensiones, del HMR y de cualquier cosa embebida: eso
		// tiene que salir por una puerta distinta de la de un mensaje nuestro mal formado.
		expect(parseSiteMessage({ type: 'ready' })).toEqual({ status: 'foreign' });
		expect(parseSiteMessage('webpackHotUpdate')).toEqual({ status: 'foreign' });
		expect(parseSiteMessage(null)).toEqual({ status: 'foreign' });
		expect(parseSiteMessage({ vega: 1, type: 'ready' })).toEqual({ status: 'foreign' });
	});

	test('otra versión del protocolo se reporta con SU versión, sin interpretar el cuerpo', () => {
		expect(parseSiteMessage({ vega: 'vega-visual-2', type: 'ready', blocks: [] })).toEqual({
			status: 'version',
			version: 'vega-visual-2'
		});
	});

	test('sobre bueno y cuerpo sin forma → malformed (nunca se acepta a medias)', () => {
		expect(parseSiteMessage(envelope({ type: 'saluda' })).status).toBe('malformed');
		// Un `ready` sin identidad de registro no sirve de saludo.
		expect(parseSiteMessage(envelope({ type: 'ready', id: 'abc', blocks: [] })).status).toBe(
			'malformed'
		);
		expect(
			parseSiteMessage(envelope({ type: 'ready', collection: 'pages', id: 'abc' })).status
		).toBe('malformed');
		expect(parseSiteMessage(envelope({ type: 'layout', blocks: {} })).status).toBe('malformed');
		expect(parseSiteMessage(envelope({ type: 'select', blockId: '' })).status).toBe('malformed');
		expect(parseSiteMessage(envelope({ type: 'error', message: 'sin código' })).status).toBe(
			'malformed'
		);
	});

	test('un bloque roto se descarta y se CUENTA; los demás siguen colocándose', () => {
		const parsed = parseSiteMessage(
			envelope({
				type: 'layout',
				blocks: [
					BLOCK,
					{ id: 'sin-tipo', rect: RECT },
					{ id: 'sin-rect', type: 'text' },
					{ id: 'alto-negativo', type: 'text', rect: { ...RECT, height: -1 } },
					{ id: 'no-finito', type: 'text', rect: { ...RECT, top: Number.NaN } },
					'ni siquiera es un objeto'
				]
			})
		);
		expect(parsed).toEqual({
			status: 'ok',
			message: { type: 'layout', blocks: [BLOCK], skipped: 5 }
		});
	});

	test('un bloque colapsado (0×0) SÍ vale: existe en la secuencia y su ficha se puede abrir', () => {
		const zero = { id: 'blk2', type: 'text', rect: { top: 0, left: 0, width: 0, height: 0 } };
		expect(parseSiteMessage(envelope({ type: 'layout', blocks: [zero] }))).toEqual({
			status: 'ok',
			message: { type: 'layout', blocks: [zero], skipped: 0 }
		});
	});

	test('el texto libre de un "error" se recorta antes de guardarlo', () => {
		const parsed = parseSiteMessage(
			envelope({ type: 'error', code: 'boom', message: 'x'.repeat(500) })
		);
		expect(parsed).toMatchObject({ status: 'ok' });
		const message = parsed.status === 'ok' ? parsed.message : null;
		expect(message).toEqual({ type: 'error', code: 'boom', detail: 'x'.repeat(200) });
	});
});

describe('createVisualBridgeClient', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function harness(overrides: { previewUrl?: string; documentUrl?: string } = {}) {
		const posted: unknown[] = [];
		const frame: MessagePoster = { postMessage: (data) => void posted.push(data) };
		const states: VisualBridgeState[] = [];
		const selected: string[] = [];
		const client = createVisualBridgeClient({
			record: { collection: 'pages', id: 'abc123' },
			previewUrl: overrides.previewUrl ?? PREVIEW_URL,
			documentUrl: overrides.documentUrl,
			frame: () => frame,
			helloAttempts: 3,
			helloIntervalMs: 100,
			onState: (state) => void states.push(state),
			onSelect: (blockId) => void selected.push(blockId)
		});
		return { client, frame, posted, states, selected };
	}

	test('saluda al arrancar y repite un número acotado de veces hasta que llega "ready"', () => {
		const { client, posted } = harness();
		client.start();
		expect(posted).toEqual([{ vega: VISUAL_PROTOCOL_VERSION, type: 'hello' }]);
		expect(client.state).toEqual({ status: 'connecting', attempts: 1 });

		vi.advanceTimersByTime(100);
		expect(posted).toHaveLength(2);

		client.handleMessage({ origin: ORIGIN, data: READY });
		expect(client.state).toEqual({
			status: 'connected',
			collection: 'pages',
			id: 'abc123',
			blocks: [BLOCK],
			skippedBlocks: 0
		});

		// Y deja de saludar: el temporizador se cancela con el saludo contestado.
		vi.advanceTimersByTime(1000);
		expect(posted).toHaveLength(2);
	});

	test('start() es idempotente: llamarlo dos veces no duplica los saludos', () => {
		const { client, posted } = harness();
		client.start();
		client.start();
		expect(posted).toHaveLength(1);
	});

	test('DEGRADACIÓN 1 — nadie contesta en el plazo → error "no-bridge"', () => {
		const { client, posted, states } = harness();
		client.start();
		vi.advanceTimersByTime(300);
		expect(posted).toHaveLength(3);
		expect(client.state).toEqual({ status: 'error', kind: 'no-bridge' });
		// Y no sigue intentándolo después de rendirse.
		vi.advanceTimersByTime(1000);
		expect(posted).toHaveLength(3);
		expect(states.at(-1)).toEqual({ status: 'error', kind: 'no-bridge' });
	});

	test('DEGRADACIÓN 2 — un origen que no casa se descarta EN SILENCIO y no cuenta como respuesta', () => {
		const { client, states } = harness();
		client.start();
		const before = states.length;

		expect(client.handleMessage({ origin: 'https://atacante.test', data: READY })).toBe(
			'foreign-origin'
		);
		expect(states).toHaveLength(before);
		expect(client.state).toEqual({ status: 'connecting', attempts: 1 });

		// Y tampoco puede tumbar la sesión mandando un "error" desde fuera: la comprobación de
		// origen va ANTES de mirar el tipo de mensaje.
		expect(
			client.handleMessage({
				origin: 'https://atacante.test',
				data: envelope({ type: 'error', code: 'boom', message: 'te tumbo' })
			})
		).toBe('foreign-origin');
		expect(client.state).toEqual({ status: 'connecting', attempts: 1 });

		// No ha adelantado el saludo: el plazo sigue corriendo y acaba en "no-bridge".
		vi.advanceTimersByTime(300);
		expect(client.state).toEqual({ status: 'error', kind: 'no-bridge' });
	});

	test('DEGRADACIÓN 2b — el mismo origen pero OTRA ventana tampoco entra', () => {
		const { client, frame } = harness();
		client.start();
		const otraVentana: MessagePoster = { postMessage: () => {} };
		expect(client.handleMessage({ origin: ORIGIN, data: READY, source: otraVentana })).toBe(
			'foreign-source'
		);
		expect(client.state).toEqual({ status: 'connecting', attempts: 1 });
		expect(client.handleMessage({ origin: ORIGIN, data: READY, source: frame })).toBe('accepted');
		expect(client.state.status).toBe('connected');
	});

	test('DEGRADACIÓN 3 — versión desconocida: se nombra la recibida y no se interpreta el cuerpo', () => {
		const { client, selected } = harness();
		client.start();
		const verdict = client.handleMessage({
			origin: ORIGIN,
			data: { vega: 'vega-visual-9', type: 'select', blockId: 'blk1' }
		});
		expect(verdict).toBe('version');
		expect(client.state).toEqual({
			status: 'error',
			kind: 'protocol-version',
			version: 'vega-visual-9'
		});
		// El cuerpo NO se interpretó: nadie seleccionó nada.
		expect(selected).toEqual([]);
	});

	test('DEGRADACIÓN 4 — el puente avisa de que no puede trabajar', () => {
		const { client } = harness();
		client.start();
		client.handleMessage({ origin: ORIGIN, data: READY });
		const verdict = client.handleMessage({
			origin: ORIGIN,
			data: envelope({ type: 'error', code: 'empty-allowlist', message: 'sin orígenes' })
		});
		expect(verdict).toBe('accepted');
		expect(client.state).toEqual({
			status: 'error',
			kind: 'site-error',
			code: 'empty-allowlist',
			detail: 'sin orígenes'
		});
	});

	test('DEGRADACIÓN 5 — el marco saluda pintando OTRO registro: se dice, no se edita a ciegas', () => {
		const { client } = harness();
		client.start();
		const verdict = client.handleMessage({
			origin: ORIGIN,
			data: envelope({ type: 'ready', collection: 'pages', id: 'otro', blocks: [BLOCK] })
		});
		expect(verdict).toBe('record-mismatch');
		expect(client.state).toEqual({
			status: 'error',
			kind: 'record-mismatch',
			found: { collection: 'pages', id: 'otro' }
		});
		// La colección también cuenta: mismo id en otra colección es otro registro.
		client.start();
		client.handleMessage({
			origin: ORIGIN,
			data: envelope({ type: 'ready', collection: 'posts', id: 'abc123', blocks: [BLOCK] })
		});
		expect(client.state).toMatchObject({
			kind: 'record-mismatch',
			found: { collection: 'posts', id: 'abc123' }
		});
	});

	test('un error NO deja el cliente sordo: un "ready" tardío lo cura', () => {
		// El plazo es una suposición sobre un sitio lento, no un hecho: negarse a atender la
		// respuesta que llega un instante tarde dejaría al autor con un mensaje falso delante.
		const { client } = harness();
		client.start();
		vi.advanceTimersByTime(300);
		expect(client.state).toEqual({ status: 'error', kind: 'no-bridge' });

		expect(client.handleMessage({ origin: ORIGIN, data: READY })).toBe('accepted');
		expect(client.state).toMatchObject({ status: 'connected', collection: 'pages', id: 'abc123' });
	});

	test('start() REENGANCHA tras un error (el marco recargado, o un botón de reintentar)', () => {
		const { client, posted } = harness();
		client.start();
		vi.advanceTimersByTime(300);
		expect(posted).toHaveLength(3);
		expect(client.state).toEqual({ status: 'error', kind: 'no-bridge' });

		// Sin esto, `start()` sería un no-op silencioso justo cuando hace falta: el contrato
		// recarga el marco entero si falla la sustitución en caliente, y eso dispara otro `load`.
		client.start();
		expect(client.state).toEqual({ status: 'connecting', attempts: 1 });
		expect(posted).toHaveLength(4);
		client.handleMessage({ origin: ORIGIN, data: READY });
		expect(client.state).toMatchObject({ status: 'connected' });
	});

	test('estando conectado, start() no vuelve a saludar', () => {
		const { client, posted } = harness();
		client.start();
		client.handleMessage({ origin: ORIGIN, data: READY });
		client.start();
		expect(posted).toHaveLength(1);
		expect(client.state).toMatchObject({ status: 'connected' });
	});

	test('una URL de vista previa sin origen utilizable falla CERRADO: ni escucha ni escribe', () => {
		for (const previewUrl of ['/preview/pages/abc', 'data:text/html,<p>hola', 'no es una url']) {
			const { client, posted, states } = harness({ previewUrl });
			client.start();
			expect(client.expectedOrigin).toBeNull();
			expect(client.state).toEqual({ status: 'error', kind: 'bad-preview-url' });
			expect(posted).toEqual([]);
			expect(client.handleMessage({ origin: ORIGIN, data: READY })).toBe('inactive');
			// Reintentar no puede arreglarlo (la URL se fija al crear el cliente), así que tampoco
			// se vuelve a anunciar el mismo estado: es la única rama de error que NO reengancha.
			client.start();
			expect(states).toHaveLength(1);
		}
	});

	test('una URL relativa SÍ vale si se le da la del documento (el contrato no exige absoluta)', () => {
		const { client } = harness({
			previewUrl: '/editor-mode/preview/pages/abc',
			documentUrl: `${ORIGIN}/admin/`
		});
		expect(client.expectedOrigin).toBe(ORIGIN);
	});

	test('el mensaje ajeno o mal formado no cambia el estado ni tumba la sesión', () => {
		const { client } = harness();
		client.start();
		client.handleMessage({ origin: ORIGIN, data: READY });

		expect(client.handleMessage({ origin: ORIGIN, data: { type: 'ruido' } })).toBe('ignored');
		expect(client.handleMessage({ origin: ORIGIN, data: envelope({ type: 'nope' }) })).toBe(
			'malformed'
		);
		expect(client.state.status).toBe('connected');
	});

	test('"layout" actualiza la geometría, y antes del saludo se queda fuera de orden', () => {
		const { client } = harness();
		client.start();
		const layout = envelope({ type: 'layout', blocks: [BLOCK] });
		expect(client.handleMessage({ origin: ORIGIN, data: layout })).toBe('out-of-order');

		client.handleMessage({ origin: ORIGIN, data: READY });
		const movido = { ...BLOCK, rect: { ...RECT, top: 999 } };
		expect(
			client.handleMessage({ origin: ORIGIN, data: envelope({ type: 'layout', blocks: [movido] }) })
		).toBe('accepted');
		expect(client.state).toEqual({
			status: 'connected',
			collection: 'pages',
			id: 'abc123',
			blocks: [movido],
			skippedBlocks: 0
		});
	});

	test('"ready" repetido es idempotente: refresca lo que describe y no reinicia el saludo', () => {
		const { client, posted } = harness();
		client.start();
		client.handleMessage({ origin: ORIGIN, data: READY });
		const otro = envelope({
			type: 'ready',
			collection: 'pages',
			id: 'abc123',
			blocks: [BLOCK, { id: 'blk2', type: 'text', rect: RECT }]
		});
		client.handleMessage({ origin: ORIGIN, data: otro });
		expect(client.state).toMatchObject({ status: 'connected', skippedBlocks: 0 });
		expect(client.state.status === 'connected' && client.state.blocks).toHaveLength(2);
		vi.advanceTimersByTime(1000);
		expect(posted).toHaveLength(1);
	});

	test('"select" llega a quien lleva la selección, que no es este módulo', () => {
		const { client, selected } = harness();
		client.start();
		client.handleMessage({ origin: ORIGIN, data: READY });
		client.handleMessage({ origin: ORIGIN, data: envelope({ type: 'select', blockId: 'blk1' }) });
		expect(selected).toEqual(['blk1']);
		expect(client.state).toMatchObject({ status: 'connected' });
	});

	test('highlight/scroll-to solo se mandan estando conectado, y NUNCA a "*"', () => {
		const targets: string[] = [];
		const frame: MessagePoster = { postMessage: (_data, target) => void targets.push(target) };
		const client = createVisualBridgeClient({
			record: { collection: 'pages', id: 'abc123' },
			previewUrl: PREVIEW_URL,
			frame: () => frame,
			helloAttempts: 3,
			helloIntervalMs: 100
		});

		client.highlight('blk1');
		client.scrollTo('blk1');
		expect(targets).toEqual([]);

		client.start();
		client.handleMessage({ origin: ORIGIN, data: READY });
		client.highlight('blk1');
		client.scrollTo('blk1');
		expect(targets).toEqual([ORIGIN, ORIGIN, ORIGIN]);
	});

	test('stop() cancela el temporizador pendiente y deja de aceptar mensajes', () => {
		const { client, posted } = harness();
		client.start();
		client.stop();
		expect(client.state).toEqual({ status: 'idle' });
		vi.advanceTimersByTime(1000);
		expect(posted).toHaveLength(1);
		expect(client.handleMessage({ origin: ORIGIN, data: READY })).toBe('inactive');
	});

	test('un marco que ya no existe no rompe el saludo: se acaba en el plazo de siempre', () => {
		const client = createVisualBridgeClient({
			record: { collection: 'pages', id: 'abc123' },
			previewUrl: PREVIEW_URL,
			frame: () => null,
			helloAttempts: 2,
			helloIntervalMs: 100
		});
		client.start();
		expect(client.state).toEqual({ status: 'connecting', attempts: 1 });
		vi.advanceTimersByTime(200);
		expect(client.state).toEqual({ status: 'error', kind: 'no-bridge' });
	});

	test('un marco que LANZA al postear tampoco propaga el fallo', () => {
		const frame: MessagePoster = {
			postMessage: () => {
				throw new Error('marco desmontado');
			}
		};
		const client = createVisualBridgeClient({
			record: { collection: 'pages', id: 'abc123' },
			previewUrl: PREVIEW_URL,
			frame: () => frame,
			helloAttempts: 2,
			helloIntervalMs: 100
		});
		expect(() => client.start()).not.toThrow();
		vi.advanceTimersByTime(200);
		expect(client.state).toEqual({ status: 'error', kind: 'no-bridge' });
	});
});
