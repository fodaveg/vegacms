/**
 * Diff puro entre dos juegos de valores de un mismo registro (`#lote-integridad`, Fase B §9):
 * usado para comparar una revisión (`kind:'update'`, la PRE-IMAGEN) contra la versión VIVA del
 * registro (`port.get`) — nunca revisión↔revisión, ver el corolario del §2 del contrato ("la
 * versión viva NUNCA está en `vega_revisions`").
 *
 * Módulo puro (sin Svelte, sin el puerto): la UI (`RevisionDiff.svelte`) le pasa los dos objetos
 * de valores ya resueltos y pinta el resultado reutilizando `describeCell` (`$lib/list/cell.ts`,
 * §9 del contrato: "no inventes un segundo formateador de valores").
 */

import type { Field, FieldValue } from '$lib/backend/types';

export type FieldDiffStatus = 'added' | 'removed' | 'changed' | 'same';

export interface FieldDiff {
	field: string;
	status: FieldDiffStatus;
	/** `undefined` ⟺ el campo no estaba presente en ese lado (§9: "presente en uno y ausente en
	 *  el otro es `added`/`removed`, no `changed`") — distinto de `null`, que es un valor válido. */
	before: FieldValue | undefined;
	after: FieldValue | undefined;
}

function hasOwn(obj: Record<string, FieldValue>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Igualdad estructural de dos `FieldValue` (§9): arrays comparados POSICIÓN A POSICIÓN (relación/
 * select múltiple — reordenar cuenta como cambio, es dato que el usuario puede reordenar) y
 * objetos (campos `json`) por claves/valores profundos, sin mirar el orden de inserción (el orden
 * de claves de un JSON no es dato de dominio). Mismo criterio que `structuralEqual`
 * (`form/dirty.ts`) — duplicado aquí a propósito: ese módulo vive bajo `form/` (P5, con su propio
 * vocabulario `FieldInputValue`/`File`) y este es puro `FieldValue` de solo-lectura, sin motivo
 * para acoplar los dos.
 */
function valuesEqual(a: FieldValue, b: FieldValue): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return (
			a.length === b.length &&
			a.every((item, i) => valuesEqual(item as FieldValue, b[i] as FieldValue))
		);
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		return (
			keysA.length === keysB.length &&
			keysA.every((key) => key in b && valuesEqual(a[key] as FieldValue, b[key] as FieldValue))
		);
	}
	return false;
}

/**
 * Diff campo a campo de `before`/`after` sobre el orden de `fields` (el orden efectivo del
 * formulario, típicamente `type.fields.map(f => f.schema)`). Los campos `readonly` se EXCLUYEN
 * (§9: "cambian siempre y son ruido puro" — autodate `created`/`updated`, etc.). Un campo ausente
 * en los DOS lados no produce entrada (nada que mostrar, ni siquiera `'same'`).
 */
export function diffRecordValues(
	fields: readonly Field[],
	before: Record<string, FieldValue>,
	after: Record<string, FieldValue>
): FieldDiff[] {
	const result: FieldDiff[] = [];

	for (const field of fields) {
		if (field.readonly) continue;

		const hasBefore = hasOwn(before, field.name);
		const hasAfter = hasOwn(after, field.name);
		if (!hasBefore && !hasAfter) continue;

		const beforeValue = hasBefore ? before[field.name] : undefined;
		const afterValue = hasAfter ? after[field.name] : undefined;

		let status: FieldDiffStatus;
		if (!hasBefore && hasAfter) status = 'added';
		else if (hasBefore && !hasAfter) status = 'removed';
		else
			status = valuesEqual(beforeValue as FieldValue, afterValue as FieldValue)
				? 'same'
				: 'changed';

		result.push({ field: field.name, status, before: beforeValue, after: afterValue });
	}

	return result;
}
