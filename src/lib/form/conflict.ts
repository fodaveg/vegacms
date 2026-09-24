/**
 * Cálculos PUROS del aviso de edición concurrente (`ConflictNotice.svelte`): el diff a tres bandas
 * y lo que envía «Guardar igualmente». Sin Svelte ni puerto, para poder probarlos sin montar nada.
 *
 * **Tres bandas, reutilizando `diffRecordValues`** (`revisions/diff.ts`, el mismo diff del
 * historial): `base` es lo que se leyó al abrir el formulario, `mine` lo que hay ahora en él y
 * `server` lo que el adaptador releyó al fallar el guardado (`VegaConflictError.serverRecord`).
 * Se llama dos veces —base→mío y base→servidor— y una tercera, servidor→mío, solo para descartar
 * los campos en los que los dos llegasteis al MISMO valor (no hay nada que decidir ahí).
 *
 * Cada fila dice cómo quedará el campo si se guarda igualmente, con `after` siempre como el valor
 * final:
 *   - `both` («Lo cambiasteis los dos»): del valor del servidor al tuyo — lo del otro se pierde;
 *   - `server` («Solo cambió en el servidor»): del valor que viste al del servidor — se CONSERVA,
 *     porque «Guardar igualmente» solo envía lo que tú tocaste (decisión de David, lámina p1);
 *   - `mine` («Solo tú»): del valor de antes (el mismo en los dos lados) al tuyo.
 */

import type { Field, FieldInputValue, FieldValue, FileRef } from '$lib/backend/types';
import { diffRecordValues } from '$lib/revisions/diff';
import type { BlockDataValues } from '$lib/model/block-data-form';
import type { FormValues } from './form-model';
import { dirtyFields, type FormInputValues } from './dirty';

export type ConflictScope = 'both' | 'server' | 'mine';

export interface ConflictRow {
	field: string;
	scope: ConflictScope;
	before: FieldValue | undefined;
	after: FieldValue | undefined;
}

function isFile(value: unknown): value is File {
	return typeof File !== 'undefined' && value instanceof File;
}

/**
 * Valor del formulario → `FieldValue` comparable y pintable: una subida pendiente (`File`) se
 * representa por su NOMBRE, que es lo que `describeCell` sabe enseñar en un campo `file` (una
 * `FileRef` también es un nombre). Sin esto, dos `File` distintos parecerían iguales a
 * `diffRecordValues` (objetos sin claves propias) y el diff los pintaría como `[object File]`.
 */
function toComparable(value: FieldInputValue): FieldValue {
	if (isFile(value)) return value.name;
	if (Array.isArray(value)) {
		return (value as (File | FileRef)[]).map((item) => (isFile(item) ? item.name : item));
	}
	return value as FieldValue;
}

export function toComparableValues(values: FormInputValues): Record<string, FieldValue> {
	const out: Record<string, FieldValue> = {};
	for (const [name, value] of Object.entries(values)) out[name] = toComparable(value);
	return out;
}

/**
 * Diff a tres bandas sobre `fields` (en su orden; los `readonly` quedan fuera, como en el
 * historial). Solo devuelve campos en los que ALGUIEN cambió algo y el resultado no es ya el mismo.
 */
export function threeWayDiff(
	fields: readonly Field[],
	base: Record<string, FieldValue>,
	mine: Record<string, FieldValue>,
	server: Record<string, FieldValue>
): ConflictRow[] {
	const mineDiffs = new Map(diffRecordValues(fields, base, mine).map((d) => [d.field, d]));
	const serverDiffs = new Map(diffRecordValues(fields, base, server).map((d) => [d.field, d]));
	const converged = new Set(
		diffRecordValues(fields, server, mine)
			.filter((d) => d.status === 'same')
			.map((d) => d.field)
	);

	const rows: ConflictRow[] = [];
	for (const field of fields) {
		const mineChanged = (mineDiffs.get(field.name)?.status ?? 'same') !== 'same';
		const serverChanged = (serverDiffs.get(field.name)?.status ?? 'same') !== 'same';
		if (!mineChanged && !serverChanged) continue;
		if (mineChanged && serverChanged) {
			if (converged.has(field.name)) continue;
			rows.push({
				field: field.name,
				scope: 'both',
				before: server[field.name],
				after: mine[field.name]
			});
		} else if (serverChanged) {
			rows.push({
				field: field.name,
				scope: 'server',
				before: base[field.name],
				after: server[field.name]
			});
		} else {
			rows.push({
				field: field.name,
				scope: 'mine',
				before: base[field.name],
				after: mine[field.name]
			});
		}
	}
	return rows;
}

/**
 * Las claves de `data` (bloque tipado) que tocó quien guarda: el subconjunto de `current` cuyas
 * claves difieren de `baseline`, con el mismo criterio de "sucio" que el resto del formulario
 * (`dirty.ts`). Es lo que «Guardar igualmente» mezcla sobre el `data` DEL SERVIDOR
 * (`writeBlockData(blockType, serverData, touched)`), para no devolver a su valor viejo las claves
 * que cambió el otro y tú no.
 */
export function touchedBlockData(
	baseline: BlockDataValues,
	current: BlockDataValues
): BlockDataValues {
	const touched: BlockDataValues = {};
	for (const name of dirtyFields(baseline as FormValues, current as FormInputValues)) {
		touched[name] = current[name];
	}
	return touched;
}
