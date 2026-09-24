/**
 * Formato de siembra del adaptador `memory` (§7 del contrato). El esquema y los registros
 * están ya en vocabulario Vega (los mismos `ContentType`/`Field`/`FieldValue` del puerto):
 * NO es un formato PB. Este es el formato que P8 usará para los datos de demo.
 */

import type {
	BackupFile,
	ContentType,
	FieldValue,
	FileRef,
	RecordId,
	ScheduledPublishingState
} from '../../types';

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
	/**
	 * Cuentas de la colección de editores (`vega_editors`, sección `administration` del puerto).
	 * Presente, aunque sea `[]` ⇒ la colección existe desde el arranque. Ausente ⇒ no existe hasta
	 * que `ensureCollections` la cree, igual que en un PocketBase sin sembrar. Estas cuentas NO
	 * sirven para `login()`: eso sigue siendo cosa de `users`.
	 */
	editors?: Array<{ id: string; email: string; verified: boolean; created: string | null }>;
	/** Lo que responde `administration.mailEnabled()`. Default `false`: `memory` no envía correo. */
	mailEnabled?: boolean;
	/** Copias de seguridad ya guardadas al arrancar. */
	backups?: BackupFile[];
	/** Cuánto tarda `administration.createBackup()`, en ms (la demo lo usa para que se vea la
	 *  copia en curso). Default `0`. */
	backupDurationMs?: number;
	/** Lo que responde `scheduledPublishing()`. Default `'inactive'`: `memory` no tiene cron que
	 *  publique nada, y fingirlo enseñaría «Programada» en una demo donde nunca se publica. */
	scheduledPublishing?: ScheduledPublishingState;
}
