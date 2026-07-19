/**
 * `record-context.ts` (F5-f, contrato P5): resuelve la costura "el widget `file` necesita la
 * identidad del registro (`{type, id}`) para `ctx.port.fileUrl(record, field, ref, opts)`, pero
 * `WidgetProps` NO la lleva" (D-P5.1 fija la interfaz de widget SIN props extra, ver
 * `widgets/types.ts`).
 *
 * Solución: `RecordForm.svelte` publica la identidad del registro por contexto de Svelte
 * (`setRecordIdentity`), y el widget `file` la lee con `getRecordIdentity()` — el ÚNICO
 * consumidor hoy. En modo `/new` el `id` es `null` (nada que previsualizar todavía: todo son
 * `File` nuevos); en edición es `model.recordId`.
 *
 * Reactividad: `RecordForm` publica un OBJETO `$state` estable (nunca lo reemplaza) y muta sus
 * campos cuando `model` cambia (deep-link a otro registro reutilizando la misma instancia de
 * ruta, ver la cabecera de `RecordForm.svelte`) — así el widget, que lee el context UNA vez al
 * montar, sigue viendo la identidad al día sin volver a montarse.
 *
 * Degradado: un widget montado fuera de un `RecordForm` (no debería pasar en producción, pero
 * `getRecordIdentity()` no lanza) recibe `null` — `FileInput.svelte` en ese caso solo previsualiza
 * `File` nuevos (`URL.createObjectURL`), sin `fileUrl` para `FileRef` existentes.
 */

import { getContext, setContext } from 'svelte';
import type { RecordId } from '$lib/backend/types';

/** Identidad mínima que necesita `ctx.port.fileUrl` (§4.4 del contrato de backend). */
export interface RecordIdentity {
	type: string;
	id: RecordId | null;
}

const RECORD_IDENTITY_KEY = Symbol('vega-record-identity');

/** Publica `identity` para que los widgets descendientes (hoy solo `file`) la lean. */
export function setRecordIdentity(identity: RecordIdentity): void {
	setContext(RECORD_IDENTITY_KEY, identity);
}

/** Lee la identidad publicada por un `RecordForm` ancestro, o `null` si no hay ninguno (ver
 *  cabecera: degradación explícita, nunca lanza). */
export function getRecordIdentity(): RecordIdentity | null {
	return getContext<RecordIdentity | undefined>(RECORD_IDENTITY_KEY) ?? null;
}
