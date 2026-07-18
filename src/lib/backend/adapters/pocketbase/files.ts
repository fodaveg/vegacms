/**
 * Ficheros del adaptador `pocketbase` (§4.4): `fileUrl`/thumbs vía `pb.files.getURL`, y el
 * modelo de escritura "estado final deseado" compilado a las convenciones multipart reales de
 * PB (verificadas en Fase 2 contra 0.39.6, no documentadas al detalle en el contrato):
 *
 * - Campo `file` NO múltiple: la clave plana (`campo`) reemplaza (con un `File`) o limpia
 *   (con `null`); si el valor es el mismo `FileRef` que ya tenía, no se envía la clave (no se
 *   toca — PB no ofrece una forma de "confirmar sin cambiar" un campo `file` single).
 * - Campo `file` múltiple: la clave plana REEMPLAZA el array entero (no es lo que queremos
 *   para "conservar+añadir+quitar"). PB expone dos sufijos: `campo+` (añade uno o varios
 *   `File` nuevos) y `campo-` (quita, por nombre, uno o varios ficheros ya existentes). El
 *   diff de estado-final se compila a esos dos sufijos; nunca a un reemplazo completo.
 */

import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import type { FieldInputValue, FieldValue, FileRef, ThumbSpec, VegaRecord } from '../../types';
import type { FileField } from '../../file-guards';

/** `fileUrl` síncrona (§4.4): construye la URL de descarga/preview, con thumb best-effort. */
export function resolveFileUrl(
	pb: PocketBase,
	record: Pick<VegaRecord, 'type' | 'id'>,
	field: string,
	file: FileRef,
	opts?: { thumb?: ThumbSpec }
): string {
	const recordForUrl = { id: record.id, collectionId: record.type, collectionName: record.type };
	const queryParams = opts?.thumb ? { thumb: compileThumbSpec(opts.thumb) } : undefined;
	return pb.files.getURL(recordForUrl as RecordModel, file, queryParams);
}

/**
 * Compila `ThumbSpec` (libre, del puerto) a la sintaxis `WxH`/`WxHf` de PB (§4.4): la sintaxis
 * de PB NUNCA sube al puerto. `fit: 'crop'` (default de PB) o `'contain'` (sufijo `f`, "fit
 * dentro de la caja sin recortar"). Sin ancho/alto, se usa `0` (PB permite `0xH`/`Wx0`).
 */
function compileThumbSpec(spec: ThumbSpec): string {
	const width = spec.width ?? 0;
	const height = spec.height ?? 0;
	const suffix = spec.fit === 'contain' ? 'f' : '';
	return `${width}x${height}${suffix}`;
}

/**
 * Compila el diff de estado-final de un campo `file` (ya validado con `validateFileFieldInput`
 * del puerto) a las entradas que hay que fusionar en el body de `create`/`update`.
 */
export function planFileFieldWrite(
	field: FileField,
	existing: FieldValue | undefined,
	input: FieldInputValue
): Record<string, unknown> {
	const isCreate = existing === undefined;

	if (!field.multiple) {
		if (input === null) return { [field.name]: null };
		if (typeof input === 'string') return {}; // conserva la misma ref: no se toca
		return { [field.name]: input }; // File nuevo: reemplaza
	}

	const items = (Array.isArray(input) ? input : []) as (File | FileRef)[];
	const newFiles = items.filter((item): item is File => typeof item !== 'string');

	if (isCreate) {
		// Nada que conservar todavía (cualquier FileRef ya se rechazó en la validación).
		return newFiles.length > 0 ? { [field.name]: newFiles } : {};
	}

	const keepRefs = new Set(items.filter((item): item is FileRef => typeof item === 'string'));
	const existingRefs = Array.isArray(existing) ? (existing as FileRef[]) : [];
	const toRemove = existingRefs.filter((ref) => !keepRefs.has(ref));

	const body: Record<string, unknown> = {};
	if (newFiles.length > 0) body[`${field.name}+`] = newFiles;
	if (toRemove.length > 0) body[`${field.name}-`] = toRemove;
	return body;
}
