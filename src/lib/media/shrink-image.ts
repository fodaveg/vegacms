/**
 * Reducir y recomprimir una imagen en el navegador ANTES de subirla a `vega_media` (Lote 13).
 *
 * Módulo puro: las dependencias del navegador (decodificar, dibujar y exportar) entran por
 * `ShrinkDeps`, así que se prueba sin canvas real. La implementación de navegador vive en
 * `shrink-image-browser.ts`.
 *
 * Reglas (decididas por David, 1 oct 2026; medidas en Chromium 149 y WebKit 26.5):
 * - Solo `image/jpeg`, `image/png` y `image/webp`. Un GIF animado saldría con un solo fotograma;
 *   SVG, PDF y vídeo no son ráster que se pueda redibujar.
 * - Solo se intenta si el lado largo supera `SHRINK_MAX_SIDE` O el fichero supera el tope de la
 *   colección (`maxBytes`, el descubierto, nunca un 10 MB escrito aquí). Lo que ya cabe no se toca.
 * - Nunca cambia de formato (un PNG con alfa pasado a JPEG sale con el fondo negro, sin error).
 *   Calidad `SHRINK_QUALITY` para JPEG y WebP; PNG no tiene calidad y casi siempre crece, de ahí
 *   la regla de abajo.
 * - Ante CUALQUIER duda se devuelve el original (`kept-original`, con su motivo): `toBlob` nulo,
 *   tipo distinto del pedido (WebKit no codifica WebP y devuelve PNG), resultado que no pesa menos,
 *   dimensiones 0, lienzo en blanco o una excepción. La validación del tope va DESPUÉS, en quien
 *   llama, sobre lo que de verdad se subirá.
 * - Se pierden EXIF (fecha, GPS, cámara) y el perfil Display P3 (queda sRGB). La orientación EXIF
 *   se aplica al decodificar, así que la imagen sale derecha.
 */

/** Lado largo máximo tras reducir (px). */
export const SHRINK_MAX_SIDE = 2560;
/** Calidad de exportación para JPEG y WebP. */
export const SHRINK_QUALITY = 0.85;
/** Por debajo de estos bytes por píxel el resultado se da por lienzo en blanco o roto. */
const MIN_BYTES_PER_PIXEL = 1 / 1000;

const SHRINKABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** `true` si `type` es un formato que este paso sabe reducir sin cambiarle el formato. */
export function isShrinkableType(type: string): boolean {
	return (SHRINKABLE_TYPES as readonly string[]).includes(type);
}

/** Imagen decodificada: solo lo que necesita la lógica pura. `close()` libera su memoria. */
export interface DecodedImage {
	width: number;
	height: number;
	close(): void;
}

export interface ShrinkDeps {
	/** Decodifica `file` aplicando la orientación EXIF. Lanza si no puede. */
	decode(file: File): Promise<DecodedImage>;
	/** Dibuja `image` a `width`×`height` y la exporta como `type`. Debe soltar el lienzo. `null` si
	 *  el navegador no pudo codificar. */
	encode(
		image: DecodedImage,
		width: number,
		height: number,
		type: string,
		quality: number
	): Promise<Blob | null>;
}

/** Por qué se sube el original aunque se intentó reducir. */
export type ShrinkKeptReason =
	'error' | 'no-blob' | 'wrong-type' | 'not-smaller' | 'empty' | 'blank';

export type ShrinkOutcome =
	/** No hacía falta (o no se puede): se sube el `File` tal cual. */
	| { kind: 'untouched' }
	| { kind: 'shrunk'; file: File; fromBytes: number; toBytes: number }
	| { kind: 'kept-original'; reason: ShrinkKeptReason };

interface ShrinkOptions {
	/** Tope de tamaño de la colección (`schema.maxSizeBytes`); `undefined` = sin tope. */
	maxBytes?: number;
}

/** Reduce `file` si hace falta y compensa (ver cabecera). Nunca lanza. */
export async function shrinkImage(
	file: File,
	deps: ShrinkDeps,
	options: ShrinkOptions = {}
): Promise<ShrinkOutcome> {
	if (!isShrinkableType(file.type)) return { kind: 'untouched' };

	let image: DecodedImage | null = null;
	try {
		image = await deps.decode(file);
		const { width, height } = image;
		if (!(width > 0) || !(height > 0)) return { kind: 'kept-original', reason: 'empty' };

		const longSide = Math.max(width, height);
		const overCap = options.maxBytes !== undefined && file.size > options.maxBytes;
		if (longSide <= SHRINK_MAX_SIDE && !overCap) return { kind: 'untouched' };

		const scale = Math.min(1, SHRINK_MAX_SIDE / longSide);
		const targetW = Math.max(1, Math.round(width * scale));
		const targetH = Math.max(1, Math.round(height * scale));

		const blob = await deps.encode(image, targetW, targetH, file.type, SHRINK_QUALITY);
		if (blob === null) return { kind: 'kept-original', reason: 'no-blob' };
		if (blob.type !== file.type) return { kind: 'kept-original', reason: 'wrong-type' };
		if (blob.size === 0) return { kind: 'kept-original', reason: 'empty' };
		if (blob.size < targetW * targetH * MIN_BYTES_PER_PIXEL) {
			return { kind: 'kept-original', reason: 'blank' };
		}
		if (blob.size >= file.size) return { kind: 'kept-original', reason: 'not-smaller' };

		const out = new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
		return { kind: 'shrunk', file: out, fromBytes: file.size, toBytes: out.size };
	} catch {
		return { kind: 'kept-original', reason: 'error' };
	} finally {
		try {
			image?.close();
		} catch {
			// Liberar es de mejor esfuerzo: nunca debe tumbar la subida.
		}
	}
}
