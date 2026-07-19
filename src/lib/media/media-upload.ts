/**
 * Validación pura MIME/tamaño de un fichero candidato a `vega_media` ANTES de subir (Fase P6·6c,
 * D-P6.3): sin Svelte, sin el puerto — mismo criterio "módulo puro consumido por Svelte" que
 * `media-item.ts`/`media-tags.ts`.
 *
 * **Fuente de verdad = el esquema DESCUBIERTO en runtime, NUNCA una constante hardcodeada**
 * (D-P6.3): `findMediaFileFieldSchema` lee el campo `file` del `ContentType` "vega_media" tal cual
 * lo devuelve `listContentTypes()` — el MISMO array que `/media/+page.svelte` ya mantiene para el
 * bootstrap (Fase 6a). El superuser puede haber afinado `maxSizeBytes`/`mimeTypes` en el Admin de
 * PocketBase DESPUÉS del bootstrap (p.ej. añadido `image/svg+xml` asumiendo el riesgo de XSS que
 * `VEGA_MEDIA_COLLECTION` excluye por defecto, ver `media-collection.ts` D-P6.3) — leer la
 * constante `VEGA_MEDIA_COLLECTION` en vez del campo real ignoraría ese cambio. `validateMediaFile`
 * es pura respecto al `Field` YA resuelto: nunca mira `ContentType[]` completo ni el nombre fijo
 * "vega_media" por su cuenta.
 *
 * **Duplica en vez de importar `validateNewFile` de `$lib/form/widgets/file-value.ts`** (mismo
 * criterio ya asentado en `media-item.ts` para `classifyMediaFile`/`classifyFileRef`, cabecera):
 * `media/` no depende de la superficie interna del widget `file` de P5, que además trae consigo
 * `maxSelect`/`tooMany` — un concepto de "varios ficheros compartiendo UN campo múltiple" que
 * `vega_media` no tiene (cada asset es SIEMPRE un registro nuevo con su propio campo `file`
 * single, D-P6.1).
 *
 * **Solo-UX (§4.4)**: el backend re-valida de verdad (`writeRecord`/`validateFileFieldInput` en
 * `memory`; PB rechaza igual en el adaptador real) — un rechazo aquí ahorra una subida que de
 * todos modos fallaría, nunca es la única barrera.
 */

import type { ContentType, Field } from '$lib/backend/types';
import { MEDIA_FILE_FIELD } from './media-item';

/** El sub-tipo `file` del vocabulario de campos (§2.2 del contrato de backend). */
export type MediaFileFieldSchema = Extract<Field, { type: 'file' }>;

/** Motivo de rechazo de la pre-validación cliente. `'tooMany'` de P5 no aplica aquí (ver
 *  cabecera): no hay un límite de "cuántos ficheros caben en este campo", cada fichero del lote
 *  de subida se convierte en su PROPIO registro. */
export type MediaFileRejectionReason = 'tooLarge' | 'invalidType';

/** `true` si `mime` matchea alguno de `patterns` (comodín `tipo/*`, mismo criterio que el
 *  atributo HTML `accept`/`matchesMimePattern` de P5). */
function matchesMimePattern(mime: string, patterns: string[]): boolean {
	return patterns.some((pattern) =>
		pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : mime === pattern
	);
}

/**
 * Busca el campo `file` (`MEDIA_FILE_FIELD`) de la colección `vega_media` en `types` — la
 * respuesta YA cacheada de `listContentTypes()` que `/media/+page.svelte` mantiene para el
 * bootstrap (Fase 6a). `null` si `vega_media` todavía no existe (estados `'creatable'`/`'manual'`,
 * donde la zona de subida ni se monta) o si, por algún motivo, no trae ese campo — defensivo, en
 * la práctica un `ContentType` "vega_media" real siempre lo trae (D-P6.1: `file` es `required`).
 */
export function findMediaFileFieldSchema(
	types: readonly ContentType[]
): MediaFileFieldSchema | null {
	const mediaType = types.find((t) => t.name === 'vega_media');
	const field = mediaType?.fields.find((f) => f.name === MEDIA_FILE_FIELD);
	return field && field.type === 'file' ? field : null;
}

/** Valida `file` contra las constraints DESCUBIERTAS en `schema` (ver cabecera). `null` =
 *  admitido. Sin `maxSizeBytes`/`mimeTypes` (o listas vacías) → sin restricción, igual semántica
 *  que `validateNewFile` de P5. */
export function validateMediaFile(
	schema: MediaFileFieldSchema,
	file: File
): MediaFileRejectionReason | null {
	if (schema.maxSizeBytes !== undefined && file.size > schema.maxSizeBytes) return 'tooLarge';
	if (
		schema.mimeTypes &&
		schema.mimeTypes.length > 0 &&
		!matchesMimePattern(file.type, schema.mimeTypes)
	) {
		return 'invalidType';
	}
	return null;
}
