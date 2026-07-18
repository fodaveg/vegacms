/**
 * Estado inicial del formulario de edición (Fase F5-a, L-P5.6/D-P5.11 del contrato P5).
 *
 * `buildFormModel` es el único punto que decide "qué ve el formulario al abrir": defaults de
 * creación o valores de un registro existente. El resultado incluye un `baseline` INMUTABLE (no
 * se muta nunca; el shell posterior clona `baseline` para su estado editable `$state` y mide
 * cambios contra este snapshot con `dirty.ts`). Módulo PURO (ley del contrato P5): sin Svelte,
 * sin el puerto, sin `pocketbase`.
 */

import type { ResolvedContentType } from '$lib/model/types';
import type { FieldValue, RecordId, VegaRecord } from '$lib/backend/types';
import { normalizeFieldValue } from '$lib/backend/normalize';

/**
 * Valores de formulario por nombre de campo. En el `baseline` NUNCA hay un `File`: solo puede
 * aparecer en el estado editable posterior del shell (`FormInputValues`, ver `dirty.ts`), cuando
 * el usuario selecciona un fichero nuevo.
 */
export type FormValues = Record<string, FieldValue>;

export type FormMode = 'create' | 'edit';

/** Estado inicial completo de un formulario de edición/creación (D-P5.11). */
export interface FormModel {
	/** El `ResolvedContentType` INTACTO: el shell lo recorre para decidir widgets/grupos/orden;
	 *  este módulo no lo copia ni lo transforma. */
	type: ResolvedContentType;
	/** `'create'` ⟺ se llamó a `buildFormModel` con `record === null` (ruta `/new`). */
	mode: FormMode;
	/** `null` en creación; el id del registro que se está editando en modo `'edit'`. */
	recordId: RecordId | null;
	/**
	 * Snapshot inmutable contra el que `dirty.ts` mide cambios. Cubre TODOS los campos de
	 * `type.fields`, en el mismo orden y con el mismo cardinal (§4.9) — ni de más ni de menos,
	 * para que el shell pueda iterar `type.fields` y encontrar siempre una entrada aquí.
	 */
	baseline: FormValues;
}

/**
 * Construye el `FormModel` inicial para `type`.
 *
 * - `record === null` (ruta `/new`, L-P5.6): cada campo recibe el valor "vacío" de su tipo,
 *   reusando `normalizeFieldValue(field.schema, undefined)` — la MISMA tabla §2.1 del contrato de
 *   backend que ya define "cómo se ve un vacío" para cada `Field.type` (`''`/`false`/`null`/`[]`
 *   según el tipo). Es deliberado: un `raw` `undefined` normaliza exactamente al default de
 *   creación de ese tipo, así que reusar `normalizeFieldValue` evita reimplementar esa tabla aquí
 *   (y garantiza que un default nuevo en §2.1 se propague solo, sin tocar este fichero).
 * - `record` presente (edición): el valor de `record.values[field.name]`, CLONADO en profundidad
 *   (`structuredClone`, ya viene normalizado por el adaptador) — nunca la misma referencia que
 *   `record.values`, para que "baseline inmutable" sea cierto por construcción incluso si el
 *   shell clona superficialmente (`{ ...baseline }`, idiomático en Svelte 5) al crear su `$state`
 *   editable: una mutación in-place sobre `current` (p.ej. `current.tags.push(...)`) NUNCA debe
 *   alcanzar a `baseline`. Incluye los campos `readonly`/autodate — se MUESTRAN (el shell los
 *   pintará no-editables) pero forman parte del baseline como cualquier otro campo, porque son
 *   `dirty.ts`/`to-record-input.ts` quienes los excluyen de la escritura por su propia cuenta, no
 *   una ausencia en el modelo.
 * - Si `record.values` no trae un campo del tipo (no debería pasar — P1 garantiza el mismo
 *   cardinal — pero L11 manda degradar sin crashear), se usa el mismo default de creación.
 */
export function buildFormModel(type: ResolvedContentType, record: VegaRecord | null): FormModel {
	const baseline: FormValues = {};

	for (const field of type.fields) {
		const defaultValue = normalizeFieldValue(field.schema, undefined);
		if (record === null) {
			baseline[field.name] = defaultValue;
			continue;
		}
		const hasValue = Object.prototype.hasOwnProperty.call(record.values, field.name);
		// structuredClone: sin esto, `baseline[field.name]` para un campo objeto/array (json,
		// select/relation/file múltiples, unsupported con payload objeto) COMPARTE REFERENCIA con
		// `record.values[field.name]`. El shell hace `let current = $state({ ...baseline })`
		// (spread superficial, idiomático en Svelte 5): `current[campo]` seguiría apuntando al
		// MISMO array/objeto, y una mutación in-place (`current.tags.push(...)`, editar una clave
		// de un `json`) mutaría también el "baseline inmutable" → `structuralEqual` nunca
		// detectaría el cambio (dirty roto en silencio). Coherente con la rama de creación, que ya
		// clona en profundidad vía `normalizeFieldValue` (json/unsupported usan `structuredClone`).
		baseline[field.name] = hasValue ? structuredClone(record.values[field.name]) : defaultValue;
	}

	return {
		type,
		mode: record === null ? 'create' : 'edit',
		recordId: record === null ? null : record.id,
		baseline
	};
}
