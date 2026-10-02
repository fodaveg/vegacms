/**
 * `focus-request.ts` (lote 13, revisión antes de publicar): la petición «abre el formulario con
 * ESTE campo enfocado» que el editor visual deja al navegar a `/c/[type]/[id]` desde un aviso de
 * SEO («Abrir Descripción en el formulario»). Las dos pantallas no comparten árbol de componentes
 * ni montan a la vez, así que el encargo viaja por este módulo y no por props ni por la URL
 * (una query en la URL sobreviviría a recargas y marcadores, y la petición solo vale UNA vez).
 *
 * `takeFieldFocus(type, id)` la consume y la borra: si quien llega es otro registro, no es suya y
 * se descarta en vez de enfocar un campo de otra página.
 */

import type { RecordId } from '$lib/backend/types';

export interface FieldFocusRequest {
	type: string;
	id: RecordId;
	field: string;
}

let pending: FieldFocusRequest | null = null;

/** Deja la petición para el siguiente `RecordForm` de `type`/`id` que se monte. */
export function requestFieldFocus(request: FieldFocusRequest): void {
	pending = request;
}

/** El campo pendiente para `type`/`id`, o `null`. Consume la petición en cualquier caso. */
export function takeFieldFocus(type: string, id: RecordId): string | null {
	const request = pending;
	pending = null;
	return request && request.type === type && request.id === id ? request.field : null;
}
