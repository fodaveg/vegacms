/**
 * Tests unitarios de `fetchTransferFile` (§4.4 del contrato, ver la cabecera de `import-media.ts`):
 * las guardas de honestidad del fix de code-review (commit `e4dd164`) — HTML de 200, cuerpo vacío,
 * timeout, límite de tamaño — más la concurrencia acotada. `fetch` SIEMPRE mockeado (`vi.stubGlobal`,
 * mismo patrón que `media-file-from-url.test.ts`), nunca red real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransferFileValue } from './record-serializer';
import { fetchTransferFile } from './import-media';

const FILE_REF: TransferFileValue = { file: 'foto.png', url: 'https://origin.test/foto.png' };

describe('fetchTransferFile', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('camino feliz: content-type real, cuerpo no vacío → File con el nombre original', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { 'content-type': 'image/png' }
				})
			)
		);

		const file = await fetchTransferFile(FILE_REF);

		expect(file).toBeInstanceOf(File);
		expect(file?.name).toBe('foto.png');
		expect(file?.type).toBe('image/png');
		expect(file?.size).toBe(3);
	});

	it('HTTP no-ok (404, etc.) → null, mismo desenlace que el resto de fallos', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

		expect(await fetchTransferFile(FILE_REF)).toBeNull();
	});

	it('un 200 con HTML (fallback de SPA/login/error de proxy servido como éxito) → null, NUNCA se acepta como el fichero (bug real corregido, ver cabecera)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response('<!doctype html><html><body>Inicia sesión</body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html; charset=utf-8' }
				})
			)
		);

		expect(await fetchTransferFile(FILE_REF)).toBeNull();
	});

	it('un 200 con application/xhtml+xml (variante de HTML) también se rechaza', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response('<html/>', {
					status: 200,
					headers: { 'content-type': 'application/xhtml+xml' }
				})
			)
		);

		expect(await fetchTransferFile(FILE_REF)).toBeNull();
	});

	it('cuerpo vacío (200, content-type real, 0 bytes) → null', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'image/png' } })
				)
		);

		expect(await fetchTransferFile(FILE_REF)).toBeNull();
	});

	it('un fetch que NUNCA resuelve expira por timeout en vez de colgar el import para siempre', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {})) // nunca se asienta, a propósito
		);

		// `timeoutMs` bajo: si esto colgara, el propio test lo delataría por su timeout de Vitest —
		// aquí se comprueba que `fetchTransferFile` resuelve MUCHO antes de eso, por su cuenta.
		const result = await fetchTransferFile(FILE_REF, { timeoutMs: 50 });

		expect(result).toBeNull();
	});

	it('content-length declarado por encima del límite corta ANTES de leer nada del cuerpo', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(new Uint8Array(10), {
				status: 200,
				headers: { 'content-type': 'image/png', 'content-length': '999999' }
			})
		);
		vi.stubGlobal('fetch', fetchSpy);

		expect(await fetchTransferFile(FILE_REF, { maxBytes: 100 })).toBeNull();
	});

	it('un cuerpo real mayor que el límite (sin content-length declarado) se corta durante la lectura', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(new Uint8Array(1000), {
					status: 200,
					headers: { 'content-type': 'image/png' }
				})
			)
		);

		expect(await fetchTransferFile(FILE_REF, { maxBytes: 100 })).toBeNull();
	});

	it('un cuerpo dentro del límite se acepta entero', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(new Uint8Array(50), {
					status: 200,
					headers: { 'content-type': 'image/png' }
				})
			)
		);

		const file = await fetchTransferFile(FILE_REF, { maxBytes: 100 });

		expect(file?.size).toBe(50);
	});

	// Segunda barrera (revisión de seguridad del 30 sep 2026): la `url` viene del fichero importado,
	// que es un dato de fuera. Solo se pide por `http:`/`https:`; lo demás ni llega a `fetch`.
	it.each([
		['file:', 'file:///etc/passwd'],
		['data:', 'data:image/png;base64,iVBORw0KGgo='],
		['blob:', 'blob:https://origin.test/3f1c2b7e-0000-4000-8000-000000000000'],
		['javascript:', 'javascript:alert(1)'],
		['ftp:', 'ftp://origin.test/foto.png'],
		['esquema con mayúsculas y espacios', '  JavaScript:alert(1)'],
		['relativa (sin esquema)', '/api/files/posts/p1/foto.png'],
		['relativa al protocolo', '//origin.test/foto.png'],
		['no parseable', 'http://'],
		['cadena vacía', '']
	])('url %s → null y SIN llamar a fetch', async (_caso, url) => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { 'content-type': 'image/png' }
			})
		);
		vi.stubGlobal('fetch', fetchSpy);

		expect(await fetchTransferFile({ file: 'foto.png', url })).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('una url que no es un string (fichero importado manipulado) → null y SIN llamar a fetch', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const tampered = { file: 'foto.png', url: { href: 'https://origin.test/foto.png' } };

		expect(await fetchTransferFile(tampered as unknown as TransferFileValue)).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('http: también se acepta (un origen en la red local sin TLS)', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { 'content-type': 'image/png' }
			})
		);
		vi.stubGlobal('fetch', fetchSpy);

		const file = await fetchTransferFile({ file: 'foto.png', url: 'http://127.0.0.1:8090/f.png' });

		expect(file?.size).toBe(3);
		expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:8090/f.png', expect.anything());
	});

	it('un rechazo por esquema no consume hueco de la cola de concurrencia', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } })
			)
		);
		const rejected = await Promise.all(
			Array.from({ length: 12 }, () => fetchTransferFile({ file: 'x.png', url: 'file:///x.png' }))
		);
		expect(rejected.every((f) => f === null)).toBe(true);

		expect(await fetchTransferFile(FILE_REF)).toBeInstanceOf(File);
	});

	it('concurrencia acotada: nunca más de 4 fetch en vuelo a la vez, aunque se pidan 10 de golpe', async () => {
		let active = 0;
		let peak = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise((resolve) => setTimeout(resolve, 20));
				active -= 1;
				return new Response(new Uint8Array([1]), {
					status: 200,
					headers: { 'content-type': 'image/png' }
				});
			})
		);

		const refs: TransferFileValue[] = Array.from({ length: 10 }, (_, i) => ({
			file: `f${i}.png`,
			url: `https://origin.test/f${i}.png`
		}));
		const results = await Promise.all(refs.map((ref) => fetchTransferFile(ref)));

		expect(results.every((f) => f instanceof File)).toBe(true);
		expect(peak).toBeLessThanOrEqual(4);
	});
});
