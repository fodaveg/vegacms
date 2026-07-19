/**
 * Resolución thumb-vs-full de un asset de `vega_media` (Fase P6·6b, L-P6.4/D-P6.4): módulo puro
 * respecto a Svelte (recibe el `BackendPort` inyectado, nunca lo instancia) que decide si pide
 * una miniatura o degrada a la `fileUrl` completa — SOLO según `port.capabilities.thumbs`, nunca
 * asumiendo qué adaptador hay detrás (ley de capabilities, §5 del contrato de backend). Mismo
 * criterio que `previewSrcFor` del widget `file` de P5 (`FileInput.svelte`), con dos diferencias
 * deliberadas:
 * - El grid SIEMPRE pide una miniatura si `thumbs` lo permite (300×300 crop, D-P6.4); el detalle
 *   SIEMPRE pide la imagen completa (nunca un `thumb`, aunque el adaptador lo soporte) — es la
 *   vista de "editar metadatos", no una celda de listado.
 * - `memory` tiene `capabilities.thumbs: false` (§7 del contrato de backend): estas funciones
 *   DEBEN tomar la rama de degradación con ese adaptador — si algún día asumieran lo contrario,
 *   reventarían la demo/los tests (ver la suite de este módulo).
 */

import type { BackendPort } from '$lib/backend/port';
import type { Capabilities, ThumbSpec } from '$lib/backend/types';
import { MEDIA_FILE_FIELD, type MediaItemView } from './media-item';

/** `300×300 crop` (D-P6.4): la única miniatura que pide el grid de medios. */
export const MEDIA_GRID_THUMB_SPEC: ThumbSpec = { width: 300, height: 300, fit: 'crop' };

/** Subconjunto de `BackendPort` que necesita este módulo (evita arrastrar la interfaz entera a
 *  los tests, que solo necesitan poder simular `fileUrl`/`capabilities`). */
export type FileUrlPort = Pick<BackendPort, 'fileUrl' | 'capabilities'>;

/** `opts` de `fileUrl` para el GRID: pide `MEDIA_GRID_THUMB_SPEC` si `capabilities.thumbs`,
 *  `undefined` (degradación a la imagen completa, L-P6.4) en caso contrario. NUNCA construye
 *  sintaxis de miniatura propia — el `ThumbSpec` es libre/best-effort (§4.4) y cada adaptador lo
 *  compila a su propia sintaxis por su cuenta. */
export function mediaGridThumbOpts(capabilities: Capabilities): { thumb: ThumbSpec } | undefined {
	return capabilities.thumbs ? { thumb: MEDIA_GRID_THUMB_SPEC } : undefined;
}

/** `src` de la celda del grid para `item`: `null` si no es una imagen o no tiene `fileRef` (el
 *  llamador degrada al icono por tipo, nunca a un `<img>` roto). */
export function resolveMediaGridSrc(port: FileUrlPort, item: MediaItemView): string | null {
	if (item.kind !== 'image' || item.fileRef === null) return null;
	return port.fileUrl(
		{ type: 'vega_media', id: item.id },
		MEDIA_FILE_FIELD,
		item.fileRef,
		mediaGridThumbOpts(port.capabilities)
	);
}

/** `src` de la imagen COMPLETA del panel de detalle: sin `opts` (nunca pide `thumb`, ver
 *  cabecera). `null` en el mismo caso que `resolveMediaGridSrc`. */
export function resolveMediaFullSrc(
	port: Pick<BackendPort, 'fileUrl'>,
	item: MediaItemView
): string | null {
	if (item.kind !== 'image' || item.fileRef === null) return null;
	return port.fileUrl({ type: 'vega_media', id: item.id }, MEDIA_FILE_FIELD, item.fileRef);
}
