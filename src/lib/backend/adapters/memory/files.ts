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
		const base64 = arrayBufferToBase64(buffer);
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

	/**
	 * Registra un fichero YA resuelto bajo una `FileRef` exacta, sin pasar por `store()` (P6·6b,
	 * `MemorySeed.files`): permite que una semilla (p.ej. la de e2e de `vega_media`) declare un
	 * `FileRef` en un `values.file` y que `fileUrl` lo resuelva de verdad, sin fabricar una subida
	 * real. Si `ref` ya existe, la sobrescribe (mismo criterio no-defensivo que el resto de la
	 * semilla: es responsabilidad de quien la escribe no repetir claves).
	 */
	preload(ref: FileRef, name: string, mime: string, dataUri: string): void {
		this.files.set(ref, { name, mime, dataUri });
	}
}

function generateFileRef(originalName: string): FileRef {
	const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
	return `${token}_${originalName}`;
}

/**
 * Codifica un `ArrayBuffer` a base64 SIN `Buffer` (fix F5-f: `Buffer` es global de Node y NO
 * existe en el navegador — donde este código realmente corre desde que el widget `file` sube
 * ficheros reales desde un `<input type="file">`; el bug era invisible antes porque ningún test
 * anterior subía un `File` de verdad a través de un navegador, solo en los tests unitarios de
 * Node del propio adaptador). Recorre en BLOQUES de `CHUNK_SIZE` en vez de
 * `String.fromCharCode(...bytes)` de una vez: con un array grande, el spread revienta con
 * "Maximum call stack size exceeded" (límite de argumentos de una llamada de función). `btoa` SÍ
 * es global en ambos entornos (navegador y Node 18+).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const CHUNK_SIZE = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
	}
	return btoa(binary);
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
