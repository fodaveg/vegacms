/**
 * `file-value.ts` (F5-f, widget `file`): lógica pura de validación cliente y edición del valor
 * "estado final deseado" (§4.4/D-P5.10 del contrato P5) — sin DOM, sin Svelte, sin el puerto (ley
 * del contrato P5: módulo puro, testeable sin montar nada). `FileInput.svelte` es el único
 * consumidor.
 *
 * - **Validación cliente (`validateNewFile`)**: SOLO UX — el backend re-valida de verdad
 *   (`file-guards.ts`, §9.9). Cubre `maxSizeBytes` y `mimeTypes`, este último con comodín
 *   `tipo/*` (igual semántica que el atributo HTML `accept`, que `acceptAttr` deriva del mismo
 *   `mimeTypes`).
 * - **`maxSelect` (múltiple) es la MISMA afordancia que `chips`/`relation`** (F5-b/e): el widget
 *   deja de aceptar ficheros nuevos al alcanzarlo. Aquí, además, `addFilesToMultiple` recorta
 *   cualquier exceso que llegue de golpe (varios ficheros elegidos/soltados a la vez que superan
 *   el hueco restante) reportándolo como el mismo tipo de rechazo (`'tooMany'`) que los demás, en
 *   vez de aceptarlos silenciosamente o reventar.
 * - **Clasificación imagen-vs-otro (Audit Finding 4, "no hay `WidgetId` `image`")**: un `File`
 *   nuevo se clasifica por su `type` real (`classifyFile`); una `FileRef` ya almacenada no trae
 *   mime por el puerto (§4.4), así que se aproxima por la EXTENSIÓN de su nombre
 *   (`classifyFileRef`) — el widget además degrada a un chip si el `<img>` resultante falla al
 *   cargar (`onerror`), cubriendo una extensión ambigua o incorrecta.
 */

import type { Field, FileRef } from '$lib/backend/types';

/** El sub-tipo `file` del vocabulario de campos (§2.2 del contrato de backend). */
export type FileFieldSchema = Extract<Field, { type: 'file' }>;

/** Un elemento del value de un campo `file`: una subida nueva pendiente, o una referencia ya
 *  almacenada que se conserva. */
export type FileItem = File | FileRef;

/** Motivo de rechazo de un fichero, SOLO-UX (§4.4): el backend es quien manda de verdad. */
export type FileRejectionReason = 'tooLarge' | 'invalidType' | 'tooMany';

export interface FileRejection {
	name: string;
	reason: FileRejectionReason;
}

/** Resultado de intentar añadir uno o más ficheros: el value resultante, y lo que se rechazó
 *  (vacío si todo entró). */
export interface FileAddOutcome<T> {
	value: T;
	rejections: FileRejection[];
}

/** `true` si `mime` matchea alguno de `patterns` (comodín `tipo/*`, como `accept`). */
function matchesMimePattern(mime: string, patterns: string[]): boolean {
	return patterns.some((pattern) =>
		pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : mime === pattern
	);
}

/** Valida `file` contra `field.schema.maxSizeBytes`/`mimeTypes` (solo UX). `null` = admitido. */
export function validateNewFile(field: FileFieldSchema, file: File): FileRejectionReason | null {
	if (field.maxSizeBytes !== undefined && file.size > field.maxSizeBytes) return 'tooLarge';
	if (
		field.mimeTypes &&
		field.mimeTypes.length > 0 &&
		!matchesMimePattern(file.type, field.mimeTypes)
	) {
		return 'invalidType';
	}
	return null;
}

/**
 * Añade `files` al value MÚLTIPLE actual (§4.4, "estado final deseado"): cada uno pasa por
 * `validateNewFile` y por el hueco restante de `maxSelect` (afordancia UX — la validación dura de
 * verdad es de `validation.ts`/backend, ver cabecera); los que no pasan quedan en `rejections`,
 * con su motivo. Nunca muta `current`.
 */
export function addFilesToMultiple(
	field: FileFieldSchema,
	current: FileItem[],
	files: File[]
): FileAddOutcome<FileItem[]> {
	const rejections: FileRejection[] = [];
	const accepted: FileItem[] = [...current];
	for (const file of files) {
		if (field.maxSelect !== undefined && accepted.length >= field.maxSelect) {
			rejections.push({ name: file.name, reason: 'tooMany' });
			continue;
		}
		const reason = validateNewFile(field, file);
		if (reason) {
			rejections.push({ name: file.name, reason });
			continue;
		}
		accepted.push(file);
	}
	return { value: accepted, rejections };
}

/** Sustituye el value ÚNICO (campo no múltiple) por `file`, o lo rechaza sin tocar `current`. */
export function setSingleFile(
	field: FileFieldSchema,
	current: FileItem | null,
	file: File
): FileAddOutcome<FileItem | null> {
	const reason = validateNewFile(field, file);
	if (reason) return { value: current, rejections: [{ name: file.name, reason }] };
	return { value: file, rejections: [] };
}

/** Quita `item` del value múltiple. Comparación por `===`: para un `File` es por REFERENCIA
 *  (nunca es igual a otro salvo ser el MISMO objeto, mismo criterio que `dirty.ts`), y para una
 *  `FileRef` (string) es por valor — ambos casos correctos con el mismo operador. */
export function removeFromMultiple(current: FileItem[], item: FileItem): FileItem[] {
	return current.filter((existing) => existing !== item);
}

export type FileKind = 'image' | 'other';

/** Clasifica un `File` nuevo por su mime REAL (Audit Finding 4). */
export function classifyFile(file: File): FileKind {
	return file.type.startsWith('image/') ? 'image' : 'other';
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']);

/** Aproxima la clase de una `FileRef` ya almacenada por la extensión de su nombre (ver cabecera:
 *  el puerto no expone el mime de un fichero ya guardado). */
export function classifyFileRef(ref: FileRef): FileKind {
	const ext = ref.split('.').pop()?.toLowerCase() ?? '';
	return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'other';
}

/** `true` si `item` es un `File` (subida pendiente) en vez de una `FileRef` ya almacenada. Mismo
 *  criterio defensivo que `dirty.ts` (`typeof File !== 'undefined'`, seguro en Node/SSR). */
export function isNewFile(item: FileItem): item is File {
	return typeof File !== 'undefined' && item instanceof File;
}

/** Clasifica cualquier `FileItem` (nuevo o ya almacenado), delegando en la función que aplique. */
export function classifyItem(item: FileItem): FileKind {
	return isNewFile(item) ? classifyFile(item) : classifyFileRef(item);
}

/** Deriva el `accept` del `<input type="file">` a partir de `mimeTypes` (§4.4/D-P5.10):
 *  `undefined` si el campo no restringe tipos (el navegador ofrece todos). */
export function acceptAttr(field: FileFieldSchema): string | undefined {
	return field.mimeTypes && field.mimeTypes.length > 0 ? field.mimeTypes.join(',') : undefined;
}

/** Nombre a mostrar para un `FileItem`: el `name` real de un `File` nuevo, o la `FileRef` tal
 *  cual (el puerto no promete más — ver cabecera). */
export function itemDisplayName(item: FileItem): string {
	return isNewFile(item) ? item.name : item;
}
