/**
 * Modelo de formulario → `RecordInput` (Fase F5-a, L-P5.3/§4.3 del contrato P1).
 *
 * Traduce el estado editable del formulario al payload parcial que consumirá `port.create()`/
 * `port.update()`. Incluye SOLO los campos que cambiaron (`dirty.ts`) Y son escribibles: excluye
 * `schema.readonly` y los de widget/tipo `'unsupported'` — así se PREVIENE en origen el rechazo
 * de `checkUnwritableFields` (`write-guards.ts`, §4.3) en vez de dejar que el puerto lo devuelva
 * como error de validación evitable. En `/new` esto equivale a "solo campos no-default y
 * escribibles" (lo que no se toca ya vale su default en el backend); en edición, "solo lo dirty".
 *
 * Los valores se reenvían TAL CUAL (pass-through, sin tocar el puerto): un `File` de un campo
 * `file` viaja como subida nueva, y un `FileRef` existente (o una mezcla `FileRef`+`File` en un
 * campo múltiple) se reenvía para conservarlo — la subida real la hace el adaptador (L-P5.10);
 * este módulo solo decide QUÉ entra en el payload, no CÓMO se sube.
 */

import type { ResolvedContentType } from '$lib/model/types';
import type { RecordInput } from '$lib/backend/types';
import type { FormValues } from './form-model';
import { dirtyFields, type FormInputValues } from './dirty';

/**
 * Construye el `RecordInput` a partir del `baseline` y el estado editable `current`, para el
 * `type` dado. Itera `type.fields` (no las claves de `current`): así un campo ajeno al tipo que
 * se hubiera colado en `current` por error nunca llega al payload.
 */
export function toRecordInput(
	type: ResolvedContentType,
	baseline: FormValues,
	current: FormInputValues
): RecordInput {
	const dirty = dirtyFields(baseline, current);
	const input: RecordInput = {};

	for (const field of type.fields) {
		if (!dirty.has(field.name)) continue;
		if (field.schema.readonly) continue;
		// Defensa en profundidad: comprobar tanto el widget resuelto (L8) como el `schema.type`
		// real (§2.2), por si algún día divergieran.
		if (field.widget === 'unsupported' || field.schema.type === 'unsupported') continue;
		input[field.name] = toPlainValue(current[field.name]);
	}

	return input;
}

/**
 * Desproxifica un valor de `current` antes de que cruce al puerto (fix de F5-b, widget `json`).
 * `current` es un `$state` de Svelte 5 con reactividad PROFUNDA: asignar un objeto/array a una de
 * sus propiedades (el valor de un campo `json`, o un array de `select`/`chips` múltiple) lo
 * envuelve en un Proxy reactivo. Eso no molesta mientras el valor se queda en memoria del shell,
 * pero el adaptador `memory` normaliza `json` con `structuredClone` (§2.1 del contrato de backend,
 * `normalize.ts`) — y `structuredClone` de un Proxy de Svelte 5 lanza `DataCloneError` (sus
 * trampas internas no son "clonables" por el algoritmo nativo del navegador).
 *
 * La forma correcta de cruzar esta frontera (estado reactivo del shell → payload de red) es
 * reconstruir un objeto/array PLANO recorriendo sus claves reales: cada acceso ya atraviesa la
 * trampa `get` del Proxy, así que el resultado son datos de verdad, sin envoltorio — el mismo
 * principio que el rune `$state.snapshot()` de Svelte, reimplementado aquí sin depender de él
 * (este módulo es TypeScript puro, sin Svelte, por convención del repo — L1 del contrato). `File`
 * se conserva TAL CUAL (Svelte nunca lo proxifica — no es un objeto/array "plano" — y clonarlo
 * cambiaría su identidad sin ganar nada; el resto de widgets solo emiten `string[]`/`FieldValue`
 * primitivos, que ya viajan bien sin pasar por aquí, pero aplicarlo a todos los campos por
 * uniformidad no tiene coste).
 */
function toPlainValue<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	if (typeof File !== 'undefined' && value instanceof File) return value;
	if (Array.isArray(value)) return value.map((item) => toPlainValue(item)) as unknown as T;
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(value as Record<string, unknown>)) {
		out[key] = toPlainValue((value as Record<string, unknown>)[key]);
	}
	return out as T;
}
