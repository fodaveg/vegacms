/**
 * Subida de UN fichero a `vega_media` (lote 12, lámina 5): el único camino por el que un `File`
 * entra en la biblioteca. Lo recorren el lote de `/media` (`media-upload-state.svelte.ts`, un
 * fichero tras otro) y la copia que hace el widget `file` al guardar un registro
 * (`FileInput.svelte`), para que una imagen subida desde un campo pase por lo MISMO que una
 * subida en Medios: reducir si procede, validar contra el esquema DESCUBIERTO y crear el
 * registro.
 *
 * Módulo puro: sin Svelte y sin el navegador. La función que reduce (`ShrinkFn`) se inyecta,
 * así que se prueba sin canvas; `null` significa «no reducir» («Subir el original» en `/media`).
 *
 * Qué devuelve y qué lanza:
 * - `done` con el registro creado y, si se intentó reducir, el resultado de ese paso.
 * - `rejected` si el fichero no pasa el esquema (tipo no admitido, o tamaño tras reducir):
 *   NUNCA llega a `port.create`.
 * - Propaga el `VegaError` de `port.create` tal cual: quien llama decide si corta un lote
 *   (`network`/`forbidden`), si avisa al feedback global (`auth-expired`) o si lo pinta en su
 *   fila. Cualquier otra excepción se envuelve en un `VegaError` `backend`.
 */

import { VegaError } from '$lib/backend/errors';
import type { BackendPort } from '$lib/backend/port';
import type { RecordInput, VegaRecord } from '$lib/backend/types';
import { MEDIA_FILE_FIELD } from './media-item';
import {
	validateMediaFile,
	type MediaFileFieldSchema,
	type MediaFileRejectionReason
} from './media-upload';
import { isShrinkableType, type ShrinkKeptReason, type ShrinkOutcome } from './shrink-image';

/** Colección de la biblioteca de medios (D-P6.1). */
const MEDIA_COLLECTION = 'vega_media';

/** Función que reduce una imagen (inyectable en tests; en el navegador, `shrink-image-browser`). */
export type ShrinkFn = (file: File, options: { maxBytes?: number }) => Promise<ShrinkOutcome>;

/** Qué pasó con el paso de reducir (solo se rellena si se redujo o se intentó). */
export type MediaUploadShrink =
	| { kind: 'shrunk'; fromBytes: number; toBytes: number }
	| { kind: 'original'; why: ShrinkKeptReason };

interface MediaUploadFileOptions {
	/** Reduce la imagen antes de validar y subir; `null` la sube tal cual. */
	shrink: ShrinkFn | null;
	/** Texto alternativo que se guarda en la ficha (`alt`). Vacío o ausente = sin texto. */
	alt?: string;
}

type MediaUploadFileResult =
	| { kind: 'done'; record: VegaRecord; shrink?: MediaUploadShrink }
	| { kind: 'rejected'; reason: MediaFileRejectionReason; shrink?: MediaUploadShrink };

/** Mensaje legible de un `VegaError` de `create()`: el de validación del propio campo `file`
 *  (`fieldErrors.file`) si lo trae, si no el `message` general del error. */
export function mediaUploadErrorMessage(err: VegaError): string {
	return err.fieldErrors?.[MEDIA_FILE_FIELD]?.message ?? err.message;
}

/**
 * Sube `file` a `vega_media` (ver cabecera). El tope de tamaño de una imagen reducible se valida
 * DESPUÉS de reducirla (una foto de 23 MB que reducida pesa 1 MB debe subirse); el MIME, antes.
 */
export async function uploadMediaFile(
	port: Pick<BackendPort, 'create'>,
	schema: MediaFileFieldSchema,
	file: File,
	options: MediaUploadFileOptions
): Promise<MediaUploadFileResult> {
	const shrinkable = options.shrink !== null && isShrinkableType(file.type);
	const early = validateMediaFile(schema, file, { ignoreSize: shrinkable });
	if (early !== null) return { kind: 'rejected', reason: early };

	let toUpload = file;
	let shrink: MediaUploadShrink | undefined;
	if (shrinkable && options.shrink) {
		// `shrinkImage` no lanza: ante cualquier duda devuelve el original con su motivo.
		const outcome = await options.shrink(file, { maxBytes: schema.maxSizeBytes });
		if (outcome.kind === 'shrunk') {
			toUpload = outcome.file;
			shrink = { kind: 'shrunk', fromBytes: outcome.fromBytes, toBytes: outcome.toBytes };
		} else if (outcome.kind === 'kept-original') {
			shrink = { kind: 'original', why: outcome.reason };
		}
	}

	// Validación definitiva sobre lo que de verdad se sube (tope tras reducir).
	const rejection = validateMediaFile(schema, toUpload);
	if (rejection !== null) return { kind: 'rejected', reason: rejection, shrink };

	const input: RecordInput = { [MEDIA_FILE_FIELD]: toUpload };
	const alt = options.alt?.trim() ?? '';
	if (alt !== '') input.alt = alt;

	try {
		const record = await port.create(MEDIA_COLLECTION, input);
		return { kind: 'done', record, shrink };
	} catch (err) {
		throw err instanceof VegaError ? err : VegaError.backend('Error al subir el fichero', err);
	}
}
