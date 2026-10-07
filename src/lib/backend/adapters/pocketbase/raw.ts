/** Vista tipada de los campos dinámicos de un registro del SDK de PocketBase. */

import type { RecordModel } from 'pocketbase';

/** `RecordModel` hereda un índice `any`; en la frontera del adaptador se trata como `unknown`. */
export function asRaw(record: RecordModel): Record<string, unknown> {
	return record;
}
