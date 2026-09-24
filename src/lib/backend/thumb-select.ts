/**
 * Elige el `ThumbSpec` que de verdad hay que pedir para un campo `file` (hallazgo p2, lote
 * "formularios y medios"): el tamaño deseado SOLO si el propio campo lo declaró en PB
 * (`Field.thumbs`, ver su cabecera en `types.ts`, sintaxis `WxH`/`WxHf` ya compilada por
 * `compileThumbSpec`) — cualquier otro tamaño, PocketBase (`apis/file.go`) devuelve el ORIGINAL
 * completo en silencio (200, sin `<img>` roto), así que pedirlo a ciegas no falla pero gasta el
 * ancho de banda del fichero entero en cada celda/preview.
 *
 * `100x100` es la ÚNICA excepción: PB la sirve SIEMPRE, declarada o no (verificado contra
 * 0.39.6) — el fallback universal de este módulo cuando el tamaño pedido no está declarado.
 *
 * Puro (sin `BackendPort`, sin Svelte): lo consumen `RecordTable.svelte` (28×28) y
 * `FileInput.svelte` (120×120), ninguno de los cuales puede asumir que la colección del campo
 * declaró esos tamaños — a diferencia de `vega_media` (`media-collection.ts`), un campo `file`
 * de bloque (`block-schema.ts`) o de un tipo de contenido cualquiera puede no declarar nada.
 */

import { compileThumbSpec } from './adapters/pocketbase/files';
import type { ThumbSpec } from './types';

/** Tamaño que PB sirve SIEMPRE, declarado o no (ver cabecera): fallback universal. */
export const FALLBACK_THUMB_SPEC: ThumbSpec = { width: 100, height: 100, fit: 'crop' };

/**
 * `requested` tal cual si `declaredThumbs` incluye su forma compilada; si no, `FALLBACK_THUMB_
 * SPEC`. `declaredThumbs` es `Field['thumbs']` del campo concreto — `undefined` (campo sin
 * declarar ninguno) se trata igual que "no incluido".
 */
export function selectThumbSpec(
	requested: ThumbSpec,
	declaredThumbs: readonly string[] | undefined
): ThumbSpec {
	return declaredThumbs?.includes(compileThumbSpec(requested)) ? requested : FALLBACK_THUMB_SPEC;
}
