import type { FieldValue } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { dirtyFields, type FormInputValues } from './dirty';
import type { FieldErrorsView } from './field-errors';
import type { FormValues } from './form-model';

export type LocaleStatus = 'error' | 'dirty' | 'missing' | 'complete';

function isEmpty(value: FieldValue | undefined): boolean {
	return (
		value === undefined ||
		value === null ||
		value === '' ||
		(Array.isArray(value) && value.length === 0)
	);
}

/**
 * Resume el estado editorial de un idioma con una prioridad inequívoca para el indicador del tab:
 * error > cambios > traducción incompleta > completa.
 */
export function localeStatus(
	type: ResolvedContentType,
	locale: string,
	baseline: FormValues,
	current: FormInputValues,
	errors: FieldErrorsView
): LocaleStatus {
	const localization = type.localization;
	if (!localization) return 'complete';
	const names = localization.fields
		.map((logical) => logical.fields[locale])
		.filter((name): name is string => typeof name === 'string');
	if (names.some((name) => name in errors.byField)) return 'error';
	const dirty = dirtyFields(baseline, current);
	if (names.some((name) => dirty.has(name))) return 'dirty';
	if (names.some((name) => isEmpty(current[name] as FieldValue | undefined))) return 'missing';
	return 'complete';
}
