/**
 * `file-library-copy.ts` (lote 12, lámina 5): la parte pura de «una imagen subida desde un campo
 * `file` pide su texto alternativo y, al guardar el registro, se copia a Medios con él». Sin DOM,
 * sin Svelte, sin el puerto; `FileInput.svelte` es el único consumidor.
 *
 * Decisiones (David, 1 y 2 oct 2026):
 * - El texto alternativo vive en la ficha de Medios (`vega_media.alt`), no en el campo: el campo
 *   `file` de un registro no tiene dónde guardarlo (L-P6.8, [SUP-5]). Una imagen usada en dos
 *   sitios comparte el mismo texto.
 * - Se avisa si falta, sin impedir guardar. Un texto obligatorio acaba siendo «imagen» o el nombre
 *   del fichero, y eso es peor que ninguno.
 * - La copia no se pregunta: sin casilla de «guardar también en Medios».
 * - Sin biblioteca (la colección no existe) o sin permiso de crear en ella: todo como hoy, ni
 *   texto ni copia. Un texto que no se puede guardar en ningún sitio no se pide.
 * - Un fichero que no es imagen también se copia, sin pedir texto; uno que la biblioteca no admite
 *   por tipo no se copia (no es un error del usuario: ese campo lo admitía).
 * - Lo que llega de la biblioteca («Elegir de la biblioteca») ya está en Medios: ni se pregunta ni
 *   se vuelve a copiar.
 */

import type { FieldValue, FileRef } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { findMediaFileFieldSchema, validateMediaFile } from '$lib/media/media-upload';
import type { MediaFileFieldSchema } from '$lib/media/media-upload';
import { classifyFile, isNewFile, type FileItem } from './file-value';

/**
 * El campo `file` de `vega_media` si la biblioteca existe en el modelo resuelto Y la sesión puede
 * crear en ella; `null` en cualquier otro caso (ver cabecera). Lee `ctx.model.types`, que P1
 * descubre entero (`vega_*` incluidas, ocultas): una biblioteca creada en ESTA sesión desde
 * `/media` no aparece hasta recargar el modelo, igual que para el resto de la app.
 */
export function libraryCopyTarget(
	types: readonly ResolvedContentType[]
): MediaFileFieldSchema | null {
	const media = types.find((t) => t.name === 'vega_media');
	if (!media || !media.permissions.create) return null;
	return findMediaFileFieldSchema([media.schema]);
}

/** `true` si `file` debe copiarse a la biblioteca: su tipo es admitido allí. El tamaño no se mira
 *  aquí (una imagen grande se reduce antes de subir y el tope se valida entonces). */
export function shouldCopyToLibrary(schema: MediaFileFieldSchema, file: File): boolean {
	return validateMediaFile(schema, file, { ignoreSize: true }) !== 'invalidType';
}

/** `true` si a `file` hay que pedirle texto alternativo: es una imagen que se va a copiar. */
export function asksForAlt(schema: MediaFileFieldSchema, file: File): boolean {
	return classifyFile(file) === 'image' && shouldCopyToLibrary(schema, file);
}

/** `FileRef`s de un valor de campo `file` ya guardado (single o múltiple), en su orden. */
export function fileRefsOf(value: FieldValue | undefined): FileRef[] {
	if (typeof value === 'string') return value === '' ? [] : [value];
	if (!Array.isArray(value)) return [];
	return (value as unknown[]).filter((v): v is FileRef => typeof v === 'string' && v !== '');
}

/**
 * Casa cada `File` nuevo con la `FileRef` que el backend le dio al guardar: las refs del valor
 * guardado que NO estaban antes, en orden, frente a los `File` pendientes en el orden en que iban
 * en el valor. Los dos adaptadores conservan el orden del valor enviado (`memory`:
 * `materializeFileField`; PB: los ficheros nuevos se añaden en el orden de la petición), y el
 * nombre no sirve para casar porque los dos lo reescriben. Un `File` sin ref (no debería darse)
 * no entra en el mapa.
 */
export function matchSavedRefs(
	before: readonly FileItem[],
	savedValue: FieldValue | undefined
): Map<File, FileRef> {
	const previous = new Set(before.filter((item): item is FileRef => !isNewFile(item)));
	const added = fileRefsOf(savedValue).filter((ref) => !previous.has(ref));
	const pending = before.filter(isNewFile);
	const matched = new Map<File, FileRef>();
	pending.forEach((file, index) => {
		const ref = added[index];
		if (ref !== undefined) matched.set(file, ref);
	});
	return matched;
}
