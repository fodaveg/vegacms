/**
 * Formato de siembra del adaptador `memory` (§7 del contrato). El esquema y los registros
 * están ya en vocabulario Vega (los mismos `ContentType`/`Field`/`FieldValue` del puerto):
 * NO es un formato PB. Este es el formato que P8 usará para los datos de demo.
 */

import type { ContentType, FieldValue, FileRef, RecordId } from '../../types';

export interface MemorySeed {
	/** Credenciales que login acepta. Default demo (sin seed): admin@vega.test / cualquier password no vacía. */
	users: { email: string; password: string }[];
	/** Esquema en vocabulario Vega (los mismos ContentType/Field del puerto — NO un formato PB). */
	contentTypes: ContentType[];
	/** Registros iniciales por tipo. */
	records: Record<string, Array<{ id: RecordId; values: Record<string, FieldValue> }>>;
	/** Vida de sesión en ms (para testear expiración). Default: sin expiración. */
	sessionTtlMs?: number;
	/**
	 * Ficheros PRE-CARGADOS en el `MemoryFileStore` (P6·6b), clave = la `FileRef` EXACTA que
	 * aparece en `records` para un campo `file`. Ausente/sin entrada = comportamiento previo: una
	 * `FileRef` sembrada sin fichero real "existe" en el registro pero `fileUrl` lanza `notFound`
	 * si alguien la resuelve (caso ya cubierto por `posts.sourceFile` de `demo-seed.ts`, que nunca
	 * llama a `fileUrl`). Sirve para que un asset de imagen sembrado en `vega_media` resuelva de
	 * verdad su miniatura/preview sin fabricar una subida real.
	 */
	files?: Record<FileRef, { name: string; mime: string; dataUri: string }>;
}
