/**
 * Suite de `shrinkImage` (Lote 13): cada regla de reducir al subir, con las dependencias del
 * navegador sustituidas (sin canvas real). La prueba con navegador real vive aparte (sonda y
 * Playwright suelto del lote).
 */
import { describe, expect, test, vi } from 'vitest';
import {
	SHRINK_MAX_SIDE,
	SHRINK_QUALITY,
	shrinkImage,
	type DecodedImage,
	type ShrinkDeps
} from './shrink-image';

const MB = 1024 * 1024;

function file(type: string, size: number, name = 'foto.jpg'): File {
	return new File([new Uint8Array(size)], name, { type });
}

/** Deps falsas: imagen de `w`×`h` y exportación que devuelve `blob` (o lo que diga `encode`). */
function fakeDeps(w: number, h: number, encode?: ShrinkDeps['encode']) {
	const close = vi.fn();
	const image: DecodedImage = { width: w, height: h, close };
	const enc = vi.fn(
		encode ??
			(async (_i, _w, _h, type) => new Blob([new Uint8Array(200_000)], { type }) as Blob | null)
	);
	const decode = vi.fn(async () => image);
	return { deps: { decode, encode: enc } as ShrinkDeps, close, enc, decode };
}

describe('shrinkImage', () => {
	test.each(['image/gif', 'image/svg+xml', 'application/pdf', 'video/mp4'])(
		'%s no se toca ni se decodifica',
		async (type) => {
			const { deps, decode } = fakeDeps(8000, 6000);
			const out = await shrinkImage(file(type, 30 * MB), deps, { maxBytes: 10 * MB });
			expect(out).toEqual({ kind: 'untouched' });
			expect(decode).not.toHaveBeenCalled();
		}
	);

	test('una imagen pequeña que cabe se sube tal cual (y se libera el bitmap)', async () => {
		const { deps, enc, close } = fakeDeps(1600, 1200);
		const out = await shrinkImage(file('image/jpeg', 2 * MB), deps, { maxBytes: 10 * MB });
		expect(out).toEqual({ kind: 'untouched' });
		expect(enc).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(1);
	});

	test('una foto grande se reduce a 2560 de lado largo, calidad 0,85, mismo tipo y nombre', async () => {
		const { deps, enc, close } = fakeDeps(8000, 6000);
		const original = file('image/jpeg', 24 * MB, 'IMG_0001.jpg');
		const out = await shrinkImage(original, deps, { maxBytes: 10 * MB });
		expect(out.kind).toBe('shrunk');
		if (out.kind !== 'shrunk') return;
		expect(enc).toHaveBeenCalledWith(expect.anything(), 2560, 1920, 'image/jpeg', SHRINK_QUALITY);
		expect(SHRINK_QUALITY).toBe(0.85);
		expect(out.file.name).toBe('IMG_0001.jpg');
		expect(out.file.type).toBe('image/jpeg');
		expect(out.fromBytes).toBe(24 * MB);
		expect(out.toBytes).toBe(200_000);
		expect(close).toHaveBeenCalledTimes(1);
	});

	test('vertical: el lado largo es el alto', async () => {
		const { deps, enc } = fakeDeps(3000, 6000);
		await shrinkImage(file('image/jpeg', 8 * MB), deps);
		expect(enc).toHaveBeenCalledWith(expect.anything(), 1280, SHRINK_MAX_SIDE, 'image/jpeg', 0.85);
	});

	test('cabe en 2560 pero pasa el tope: se recomprime a las mismas dimensiones', async () => {
		const { deps, enc } = fakeDeps(2000, 1500);
		const out = await shrinkImage(file('image/png', 12 * MB, 'a.png'), deps, { maxBytes: 10 * MB });
		expect(out.kind).toBe('shrunk');
		expect(enc).toHaveBeenCalledWith(expect.anything(), 2000, 1500, 'image/png', 0.85);
	});

	test('sin tope (undefined) solo cuenta el lado largo', async () => {
		const { deps } = fakeDeps(2000, 1500);
		expect(await shrinkImage(file('image/png', 50 * MB), deps)).toEqual({ kind: 'untouched' });
	});

	test('el resultado no pesa menos: se queda el original', async () => {
		const { deps } = fakeDeps(
			4000,
			3000,
			async (_i, _w, _h, type) => new Blob([new Uint8Array(3 * MB)], { type })
		);
		const out = await shrinkImage(file('image/png', 3 * MB, 'a.png'), deps);
		expect(out).toEqual({ kind: 'kept-original', reason: 'not-smaller' });
	});

	test('toBlob devuelve un tipo distinto del pedido (WebKit y WebP): original', async () => {
		const { deps } = fakeDeps(
			4000,
			3000,
			async () => new Blob([new Uint8Array(100_000)], { type: 'image/png' })
		);
		const out = await shrinkImage(file('image/webp', 5 * MB, 'a.webp'), deps);
		expect(out).toEqual({ kind: 'kept-original', reason: 'wrong-type' });
	});

	test('toBlob devuelve null: original', async () => {
		const { deps } = fakeDeps(4000, 3000, async () => null);
		const out = await shrinkImage(file('image/jpeg', 5 * MB), deps);
		expect(out).toEqual({ kind: 'kept-original', reason: 'no-blob' });
	});

	test('dimensiones 0: original', async () => {
		const { deps, enc } = fakeDeps(0, 0);
		const out = await shrinkImage(file('image/jpeg', 20 * MB), deps, { maxBytes: 10 * MB });
		expect(out).toEqual({ kind: 'kept-original', reason: 'empty' });
		expect(enc).not.toHaveBeenCalled();
	});

	test('lienzo en blanco (blob ridículo para sus dimensiones): original', async () => {
		const { deps } = fakeDeps(
			8000,
			6000,
			async (_i, _w, _h, type) => new Blob([new Uint8Array(300)], { type })
		);
		const out = await shrinkImage(file('image/jpeg', 24 * MB), deps);
		expect(out).toEqual({ kind: 'kept-original', reason: 'blank' });
	});

	test('si decodificar lanza: original, sin propagar', async () => {
		const deps: ShrinkDeps = {
			decode: async () => {
				throw new Error('sin memoria');
			},
			encode: async () => null
		};
		const out = await shrinkImage(file('image/jpeg', 24 * MB), deps);
		expect(out).toEqual({ kind: 'kept-original', reason: 'error' });
	});

	test('si exportar lanza: original, y el bitmap se libera igual', async () => {
		const { deps, close } = fakeDeps(8000, 6000, async () => {
			throw new Error('canvas demasiado grande');
		});
		const out = await shrinkImage(file('image/jpeg', 24 * MB), deps);
		expect(out).toEqual({ kind: 'kept-original', reason: 'error' });
		expect(close).toHaveBeenCalledTimes(1);
	});

	test('si close() lanza no tumba el resultado', async () => {
		const { deps, close } = fakeDeps(8000, 6000);
		close.mockImplementation(() => {
			throw new Error('ya cerrado');
		});
		const out = await shrinkImage(file('image/jpeg', 24 * MB), deps);
		expect(out.kind).toBe('shrunk');
	});
});
