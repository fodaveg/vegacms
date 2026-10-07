import type { VegaConflictError } from '$lib/backend/errors';
import type { ResolvedContentType } from '$lib/model/types';
import { threeWayDiff, toComparableValues } from './conflict';
import type { FormInputValues } from './dirty';
import { buildFormModel, type FormValues } from './form-model';

/** Filas del aviso de concurrencia en el orden de campos del tipo. */
export function recordConflictRows(
	type: ResolvedContentType,
	baseline: FormValues,
	current: FormInputValues,
	conflict: VegaConflictError | null
) {
	if (!conflict) return [];
	return threeWayDiff(
		type.fields.map((field) => field.schema),
		baseline,
		toComparableValues(current),
		buildFormModel(type, conflict.serverRecord).baseline
	);
}
