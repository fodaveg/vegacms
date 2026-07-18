/**
 * Formato de siembra del adaptador `memory` (§7 del contrato). El esquema y los registros
 * están ya en vocabulario Vega (los mismos `ContentType`/`Field`/`FieldValue` del puerto):
 * NO es un formato PB. Este es el formato que P8 usará para los datos de demo.
 */

import type { ContentType, FieldValue, RecordId } from '../../types';

export interface MemorySeed {
	/** Credenciales que login acepta. Default demo (sin seed): admin@vega.test / cualquier password no vacía. */
	users: { email: string; password: string }[];
	/** Esquema en vocabulario Vega (los mismos ContentType/Field del puerto — NO un formato PB). */
	contentTypes: ContentType[];
	/** Registros iniciales por tipo. */
	records: Record<string, Array<{ id: RecordId; values: Record<string, FieldValue> }>>;
	/** Vida de sesión en ms (para testear expiración). Default: sin expiración. */
	sessionTtlMs?: number;
}
