/**
 * Punto focal de una imagen de `vega_media` (audit del 23 sep, tarea 2): módulo PURO — sin Svelte,
 * sin el puerto —, consumido por `media-item.ts` (lectura del registro) y `MediaDetail.svelte`
 * (el gesto de ponerlo).
 *
 * **Forma**: el campo `focal` es `json` con `{ x, y }` en `0..1`, medidos desde la esquina
 * superior izquierda de la imagen ORIGINAL (no de la miniatura, que PocketBase recorta al centro).
 * Vacío (`null`) = centro: es el valor de todos los registros anteriores al campo y el de «Centrar».
 * El sitio lo traduce a `object-position` (`focalObjectPosition` de `@vega/astro`).
 *
 * **Lectura tolerante** (`normalizeMediaFocal`): un `json` es, por contrato, «lo que sea que haya»
 * (mismo criterio que `normalizeMediaTags`). Una forma inesperada se lee como centro, nunca rompe
 * la ficha; un número fuera de rango se acota a `0..1` en vez de descartarse, porque la intención
 * («arriba del todo») sigue siendo legible.
 */

import type { FieldValue } from '$lib/backend/types';

/** Punto focal en fracciones de la imagen: `x` de izquierda a derecha, `y` de arriba abajo. */
export interface MediaFocalPoint {
	x: number;
	y: number;
}

/** El centro, que es lo que significa un `focal` vacío. */
export const MEDIA_FOCAL_CENTER: Readonly<MediaFocalPoint> = Object.freeze({ x: 0.5, y: 0.5 });

/** Paso de las flechas del teclado: 5 % de la imagen; con Mayúsculas, 1 % para afinar. */
export const MEDIA_FOCAL_STEP = 0.05;
export const MEDIA_FOCAL_FINE_STEP = 0.01;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/** Redondea a 4 decimales: una centésima de píxel en una imagen de 10 000 px, y evita guardar
 *  `0.30000000000000004` tras sumar pasos de teclado. */
function round(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

/** Construye un punto acotado a `0..1` y redondeado (ver `round`). */
export function mediaFocalPoint(x: number, y: number): MediaFocalPoint {
	return { x: round(clamp01(x)), y: round(clamp01(y)) };
}

/** Lee el valor crudo del campo `focal` (ver cabecera): `null` = centro. */
export function normalizeMediaFocal(value: FieldValue | undefined): MediaFocalPoint | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const { x, y } = value as { x?: unknown; y?: unknown };
	if (typeof x !== 'number' || typeof y !== 'number') return null;
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	return mediaFocalPoint(x, y);
}

/** `true` si los dos puntos son el mismo; `null` y el centro exacto cuentan como iguales. */
export function mediaFocalEquals(a: MediaFocalPoint | null, b: MediaFocalPoint | null): boolean {
	const left = a ?? MEDIA_FOCAL_CENTER;
	const right = b ?? MEDIA_FOCAL_CENTER;
	return left.x === right.x && left.y === right.y;
}

/** Lo que se guarda: el centro exacto se guarda como `null` (vacío), igual que «Centrar», para
 *  que no haya dos formas de decir lo mismo en la base de datos. */
export function mediaFocalToFieldValue(focal: MediaFocalPoint | null): FieldValue {
	if (focal === null || mediaFocalEquals(focal, null)) return null;
	// Objeto plano nuevo: el borrador de Svelte es un Proxy y no cruza al puerto tal cual.
	return { x: focal.x, y: focal.y };
}

/**
 * Punto bajo el puntero, relativo a la caja de la imagen pintada (`rect`, su
 * `getBoundingClientRect()`). La vista previa pinta la imagen entera (`object-fit: contain` sin
 * bandas: la caja abraza a la imagen), así que la fracción de la caja ES la fracción de la imagen.
 * `null` con una caja sin área (imagen aún sin cargar).
 */
export function mediaFocalFromPointer(
	clientX: number,
	clientY: number,
	rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): MediaFocalPoint | null {
	if (rect.width <= 0 || rect.height <= 0) return null;
	return mediaFocalPoint((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
}

/** Flecha del teclado → desplazamiento `[dx, dy]` en pasos, o `null` si la tecla no mueve. */
function arrowDelta(key: string): [number, number] | null {
	switch (key) {
		case 'ArrowLeft':
			return [-1, 0];
		case 'ArrowRight':
			return [1, 0];
		case 'ArrowUp':
			return [0, -1];
		case 'ArrowDown':
			return [0, 1];
		default:
			return null;
	}
}

/**
 * Mueve `from` (vacío = centro) con una flecha; `null` si `key` no es una flecha. `fine` (con
 * Mayúsculas) usa el paso fino. Acotado a los bordes: pulsar más allá no hace nada.
 */
export function moveMediaFocal(
	from: MediaFocalPoint | null,
	key: string,
	fine = false
): MediaFocalPoint | null {
	const delta = arrowDelta(key);
	if (!delta) return null;
	const step = fine ? MEDIA_FOCAL_FINE_STEP : MEDIA_FOCAL_STEP;
	const start = from ?? MEDIA_FOCAL_CENTER;
	return mediaFocalPoint(start.x + delta[0] * step, start.y + delta[1] * step);
}

/** Porcentajes enteros para leer en voz alta o en pantalla («30 % · 45 %»); centro = 50/50. */
export function mediaFocalPercent(focal: MediaFocalPoint | null): { x: number; y: number } {
	const point = focal ?? MEDIA_FOCAL_CENTER;
	return { x: Math.round(point.x * 100), y: Math.round(point.y * 100) };
}
