/**
 * Almacén de ficheros en memoria y semántica de escritura "estado final deseado" (§4.4).
 *
 * `memory` guarda el contenido como data-URI (portable entre Node —tests— y navegador —demo—,
 * a diferencia de un object-URL de `Blob`, que no existe de forma fiable fuera del DOM).
 */

import type { FieldInputValue, FieldValue, FileRef } from '../../types';
import { VegaError } from '../../errors';
import type { FileField } from '../../file-guards';
export { validateFileFieldInput } from '../../file-guards';

interface StoredFile {
	name: string;
	mime: string;
	dataUri: string;
}

/** Registro de ficheros del backend (uno por instancia de `createMemoryBackend`). */
export class MemoryFileStore {
	private files = new Map<FileRef, StoredFile>();

	/** Lee `file` a un data-URI y lo guarda bajo una `FileRef` generada. */
	async store(file: File): Promise<FileRef> {
		const ref = generateFileRef(file.name);
		const buffer = await file.arrayBuffer();
		const base64 = Buffer.from(buffer).toString('base64');
		const mime = file.type || 'application/octet-stream';
		this.files.set(ref, { name: file.name, mime, dataUri: `data:${mime};base64,${base64}` });
		return ref;
	}

	get(ref: FileRef): StoredFile | undefined {
		return this.files.get(ref);
	}

	delete(ref: FileRef): void {
		this.files.delete(ref);
	}
}

function generateFileRef(originalName: string): FileRef {
	const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
	return `${token}_${originalName}`;
}

/** Construye la `fileUrl` síncrona (§4.4). `thumb` se ignora siempre: `capabilities.thumbs: false`. */
export function resolveFileUrl(store: MemoryFileStore, ref: FileRef): string {
	const stored = store.get(ref);
	if (!stored) throw VegaError.notFound(`Fichero "${ref}" no encontrado`);
	return stored.dataUri;
}

/**
 * Aplica el diff de estado-final (§4.4): conserva las `FileRef` presentes, sube los `File`
 * nuevos y libera del almacén los ficheros que ya no aparecen. Se llama SOLO tras
 * `validateFileFieldInput` (para no dejar ficheros huérfanos si la validación falla).
 */
export async function materializeFileField(
	store: MemoryFileStore,
	field: FileField,
	existing: FieldValue | undefined,
	input: FieldInputValue
): Promise<FieldValue> {
	if (field.multiple) {
		const items = (Array.isArray(input) ? input : []) as (File | FileRef)[];
		const existingRefs = new Set(Array.isArray(existing) ? (existing as FileRef[]) : []);
		const finalRefs: FileRef[] = [];
		for (const item of items) {
			finalRefs.push(typeof item === 'string' ? item : await store.store(item));
		}
		for (const ref of existingRefs) {
			if (!finalRefs.includes(ref)) store.delete(ref);
		}
		return finalRefs;
	}

	if (input === null || input === undefined) {
		if (typeof existing === 'string') store.delete(existing);
		return null;
	}
	if (typeof input === 'string') return input;

	if (typeof existing === 'string') store.delete(existing);
	return await store.store(input as File);
}
