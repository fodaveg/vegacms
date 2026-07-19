/**
 * Suite de `fileFromMediaAsset` (Fase P6·6e): `fetch` mockeado (nunca red real) — cubre el caso
 * `data:` URI (el adaptador `memory` en producción/tests, `fetch` lo resuelve sin red de verdad),
 * el fallo HTTP no-ok, el fallo de red/CORS (audit H4) y el asset sin `fileRef`.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileFromMediaAsset, MediaFileFetchError } from './media-file-from-url';
import type { BackendPort } from '$lib/backend/port';

const TINY_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

function fakePort(fileUrl: string): Pick<BackendPort, 'fileUrl'> {
	return { fileUrl: vi.fn().mockReturnValue(fileUrl) };
}

describe('fileFromMediaAsset', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('un `data:` URI (adaptador memory) resuelve un File real, con el mime del propio URI', async () => {
		const port = fakePort(DATA_URI);
		const file = await fileFromMediaAsset(port, { id: 'media_2', fileRef: 'foto.png' });

		expect(file).toBeInstanceOf(File);
		expect(file.name).toBe('foto.png');
		expect(file.type).toBe('image/png');
		expect(file.size).toBeGreaterThan(0);
		expect(port.fileUrl).toHaveBeenCalledWith(
			{ type: 'vega_media', id: 'media_2' },
			'file',
			'foto.png'
		);
	});

	test('sin `fileRef` (defensivo, no debería darse: D-P6.1 exige `file` required) → MediaFileFetchError, sin llamar a fetch', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const port = fakePort(DATA_URI);

		await expect(fileFromMediaAsset(port, { id: 'media_1', fileRef: null })).rejects.toBeInstanceOf(
			MediaFileFetchError
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('respuesta HTTP no-ok → MediaFileFetchError con el status en el mensaje', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' }))
		);
		const port = fakePort('https://pb.example/api/files/vega_media/media_1/manual.pdf');

		await expect(
			fileFromMediaAsset(port, { id: 'media_1', fileRef: 'manual.pdf' })
		).rejects.toThrow(/404/);
	});

	test('fallo de `fetch` (red/CORS, audit H4) → MediaFileFetchError con mensaje claro, nunca el TypeError crudo', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		const port = fakePort('https://otro-origen.example/api/files/vega_media/media_1/foto.png');

		try {
			await fileFromMediaAsset(port, { id: 'media_1', fileRef: 'foto.png' });
			expect.unreachable('debía lanzar');
		} catch (err) {
			expect(err).toBeInstanceOf(MediaFileFetchError);
			expect((err as MediaFileFetchError).message).toContain('foto.png');
			expect((err as MediaFileFetchError).message).not.toBe('Failed to fetch');
			expect((err as Error & { cause?: unknown }).cause).toBeInstanceOf(TypeError);
		}
	});
});
