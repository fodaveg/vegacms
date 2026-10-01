/**
 * Implementación de navegador de `ShrinkDeps` (ver `shrink-image.ts`). Sin lógica de decisión: solo
 * decodifica, dibuja y exporta. Medido en Chromium 149 y WebKit 26.5 (sonda del 1 oct 2026);
 * Safari de iOS NO está medido (límite de área de canvas).
 *
 * - Decodifica con `createImageBitmap(file, { imageOrientation: 'from-image' })`; si falla o no
 *   existe, cae a `<img>` + `decode()`, que también aplica la orientación EXIF.
 * - El lienzo se encoge a 0×0 al acabar para soltar su memoria; el bitmap se cierra en `close()`.
 */

import type { DecodedImage, ShrinkDeps } from './shrink-image';

interface BrowserImage extends DecodedImage {
	source: CanvasImageSource;
}

async function decodeWithImg(file: File): Promise<BrowserImage> {
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return {
			source: img,
			width: img.naturalWidth,
			height: img.naturalHeight,
			close() {
				img.src = '';
			}
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function decode(file: File): Promise<BrowserImage> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
			return {
				source: bitmap,
				width: bitmap.width,
				height: bitmap.height,
				close: () => bitmap.close()
			};
		} catch {
			// Respaldo abajo.
		}
	}
	return decodeWithImg(file);
}

async function encode(
	image: DecodedImage,
	width: number,
	height: number,
	type: string,
	quality: number
): Promise<Blob | null> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	try {
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.drawImage((image as BrowserImage).source, 0, 0, width, height);
		return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

export const browserShrinkDeps: ShrinkDeps = { decode, encode };
