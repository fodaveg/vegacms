/**
 * Suite de `media-metrics.ts`: tamaño de un asset desde un data-URI (adaptador `memory`) y desde un
 * `HEAD` real (`Content-Length`), con el `fetch` inyectado — nunca red de verdad. Cubre sobre todo
 * la promesa que hace el módulo: TODO lo que puede salir mal devuelve `null`, jamás lanza.
 */
import { describe, expect, test, vi } from 'vitest';
import { dataUrlByteLength, fetchAssetByteSize } from './media-metrics';

/** `Response` mínima: lo único que consume el módulo es `ok` + `headers.get`. */
function headResponse(headers: Record<string, string>, ok = true): Response {
	return { ok, headers: new Headers(headers) } as Response;
}

describe('dataUrlByteLength', () => {
	test('base64 sin relleno: 3 bytes por cada 4 caracteres', () => {
		// "abcdef" (6 bytes) → "YWJjZGVm" (8 caracteres, sin `=`).
		expect(dataUrlByteLength('data:text/plain;base64,YWJjZGVm')).toBe(6);
	});

	test('descuenta el relleno "=" y "=="', () => {
		expect(dataUrlByteLength('data:text/plain;base64,YQ==')).toBe(1); // "a"
		expect(dataUrlByteLength('data:text/plain;base64,YWI=')).toBe(2); // "ab"
	});

	test('el PNG 1×1 de la semilla de demo mide lo que ocupa de verdad', () => {
		const base64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
		const expected = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).length;
		expect(dataUrlByteLength(`data:image/png;base64,${base64}`)).toBe(expected);
	});

	test('data-URI vacío → 0 bytes', () => {
		expect(dataUrlByteLength('data:image/png;base64,')).toBe(0);
	});

	test('lo que no es un data-URI base64 → null (nunca un número inventado)', () => {
		expect(dataUrlByteLength('https://example.test/f.png')).toBeNull();
		expect(dataUrlByteLength('data:text/plain,hola')).toBeNull(); // texto plano, no base64
		expect(dataUrlByteLength('data:sin-coma')).toBeNull();
	});
});

describe('fetchAssetByteSize', () => {
	test('data-URI: ni toca fetch (memory no tiene red que consultar)', async () => {
		const fetchImpl = vi.fn();
		await expect(
			fetchAssetByteSize('data:text/plain;base64,YWJjZGVm', { fetch: fetchImpl })
		).resolves.toBe(6);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	test('URL normal: HEAD (nunca GET) y Content-Length', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(headResponse({ 'content-length': '412000' }));

		await expect(
			fetchAssetByteSize('https://pb.test/api/files/x/y/foto.jpg', { fetch: fetchImpl })
		).resolves.toBe(412000);
		expect(fetchImpl).toHaveBeenCalledWith('https://pb.test/api/files/x/y/foto.jpg', {
			method: 'HEAD',
			signal: undefined
		});
	});

	test('propaga el AbortSignal recibido (cancelación del lote)', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(headResponse({ 'content-length': '1' }));
		const controller = new AbortController();

		await fetchAssetByteSize('https://pb.test/f.png', {
			fetch: fetchImpl,
			signal: controller.signal
		});

		expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
	});

	test.each([
		['respuesta no-ok', headResponse({ 'content-length': '10' }, false)],
		['sin Content-Length', headResponse({})],
		['Content-Length vacío', headResponse({ 'content-length': ' ' })],
		['Content-Length no numérico', headResponse({ 'content-length': 'mucho' })]
	])('%s → null', async (_label, response) => {
		const fetchImpl = vi.fn().mockResolvedValue(response);
		await expect(
			fetchAssetByteSize('https://pb.test/f.png', { fetch: fetchImpl })
		).resolves.toBeNull();
	});

	test('un fetch que REVIENTA (red/CORS/abort) → null en silencio, nunca propaga', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
		await expect(
			fetchAssetByteSize('https://pb.test/f.png', { fetch: fetchImpl })
		).resolves.toBeNull();

		const boom = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(fetchAssetByteSize('https://pb.test/f.png', { fetch: boom })).resolves.toBeNull();
	});
});
