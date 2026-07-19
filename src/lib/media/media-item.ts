/**
 * Mapeo de un `VegaRecord` de `vega_media` a un modelo de vista (Fase P6·6b): módulo puro
 * consumido por `MediaGrid.svelte`/`MediaDetail.svelte`/`+page.svelte`, sin Svelte ni el puerto.
 *
 * **Clasificación imagen-vs-otro por EXTENSIÓN**: mismo criterio que `classifyFileRef` del
 * widget `file` de P5 (`$lib/form/widgets/file-value.ts`, Audit Finding 4 de F5-f) — el puerto no
 * expone el mime de una `FileRef` ya almacenada (§4.4), así que se aproxima por la extensión del
 * nombre. Se DUPLICA aquí en vez de importar de `form/widgets` (mismo criterio deliberado que
 * `collectionFieldSpecToPbImportField` en `media-collection.ts`: cada área compila/clasifica con
 * su propia copia, para que `media/` no dependa de la superficie interna del widget `file` de
 * P5 — que trae consigo validación de subida/`maxSelect`/rechazos que `media/` no necesita).
 */

import type { FieldValue, FileRef, RecordId, VegaRecord } from '$lib/backend/types';

/** Nombre del único campo `file` de `vega_media` (D-P6.1). Constante única para no repetir el
 *  string mágico en cada llamada a `port.fileUrl`. */
export const MEDIA_FILE_FIELD = 'file';

export type MediaFileKind = 'image' | 'other';

/** Vista de un asset de `vega_media`, ya desnormalizada a los tipos que consume la UI (nunca
 *  `FieldValue`/`JsonValue` crudo fuera de este módulo). */
export interface MediaItemView {
	id: RecordId;
	/** `null` solo por defensa: `file` es `required` en el esquema (D-P6.1), así que un registro
	 *  real siempre lo trae — pero el mapeo no debe reventar si algún día no fuera así. */
	fileRef: FileRef | null;
	/** El propio `FileRef` (memory: incluye el nombre original) como fallback de nombre a mostrar
	 *  cuando `alt`/`title` están vacíos — mismo criterio que `itemDisplayName` de F5-f. */
	fileName: string;
	kind: MediaFileKind;
	alt: string;
	title: string;
	tags: string[];
	/** ISO 8601 UTC del campo `created` (autodate), o `null` si el registro no lo trae todavía
	 *  (defensivo: en la práctica el backend siempre lo rellena al crear). */
	created: string | null;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']);

/** Clasifica una `FileRef` ya almacenada por la extensión de su nombre (ver cabecera). */
export function classifyMediaFile(ref: FileRef): MediaFileKind {
	const ext = ref.split('.').pop()?.toLowerCase() ?? '';
	return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'other';
}

/** Coacciona el valor crudo de `tags` (campo `json`, tipado `JsonValue` arbitrario en el puerto)
 *  a `string[]`: cualquier forma inesperada (no-array, elementos no-string) se descarta en vez
 *  de reventar — un `json` es, por contrato, "lo que sea que haya", nunca validado por tipo. */
export function normalizeMediaTags(value: FieldValue): string[] {
	if (!Array.isArray(value)) return [];
	const tags: string[] = [];
	for (const entry of value as unknown[]) {
		if (typeof entry === 'string') tags.push(entry);
	}
	return tags;
}

/** Mapea un `VegaRecord` de `vega_media` a `MediaItemView`. Puro: no toca el puerto (la
 *  resolución de `src` — thumb-vs-full — vive en `media-thumb.ts`, que SÍ necesita el puerto). */
export function toMediaItemView(record: VegaRecord): MediaItemView {
	const fileRaw = record.values[MEDIA_FILE_FIELD];
	const fileRef = typeof fileRaw === 'string' && fileRaw !== '' ? fileRaw : null;
	const altRaw = record.values.alt;
	const titleRaw = record.values.title;
	const createdRaw = record.values.created;

	return {
		id: record.id,
		fileRef,
		fileName: fileRef ?? '',
		kind: fileRef ? classifyMediaFile(fileRef) : 'other',
		alt: typeof altRaw === 'string' ? altRaw : '',
		title: typeof titleRaw === 'string' ? titleRaw : '',
		tags: normalizeMediaTags(record.values.tags),
		created: typeof createdRaw === 'string' ? createdRaw : null
	};
}

/** Nombre a mostrar de un asset cuando no hay `title`/`alt` (leyenda de celda del grid, `alt` de
 *  respaldo del `<img>`…): el `title` gana, luego `alt`, luego el nombre de fichero crudo. */
export function mediaDisplayName(item: Pick<MediaItemView, 'title' | 'alt' | 'fileName'>): string {
	if (item.title !== '') return item.title;
	if (item.alt !== '') return item.alt;
	return item.fileName;
}

/** `alt` REAL del `<img>` de un asset (contrato P6 §6b): el `alt` del propio asset, o el nombre
 *  de fichero si está vacío — a propósito NUNCA cae a `title` (a diferencia de
 *  `mediaDisplayName`): el `alt` de una imagen es una descripción de lo que se VE, no un título
 *  editorial: mezclar ambos degradaría la semántica de a11y de la imagen en sí. */
export function mediaImgAlt(item: Pick<MediaItemView, 'alt' | 'fileName'>): string {
	return item.alt !== '' ? item.alt : item.fileName;
}
