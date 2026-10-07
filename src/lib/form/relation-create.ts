import type { ResolvedContentType } from '$lib/model/types';
import type { RecordId } from '$lib/backend/types';
import { canCreateManually } from '$lib/model/creation';
import { buildFormModel, type FormModel } from './form-model';
import { slugWriteForTitleEdit } from './slug-from-title';
import { physicalFieldFor } from './form-sections';

/** Colecciones genéricas: no anuncia un editor especializado ni colecciones técnicas. */
export function canCreateRelationTarget(type: ResolvedContentType | null): boolean {
	return (
		!!type &&
		canCreateManually(type) &&
		!type.readonly &&
		!type.singleton &&
		type.name !== 'vega' &&
		!type.name.startsWith('vega_') &&
		!type.blocks &&
		!type.page
	);
}

/** Un requerido que el registry no permite completar impide una creación parcial. */
export function relationCreationUnavailable(type: ResolvedContentType): boolean {
	return type.fields.some(
		(field) =>
			field.schema.required &&
			!field.schema.readonly &&
			(field.widget === 'unsupported' || field.hidden)
	);
}

/** Prefijo inicial del título escribible; se usa como baseline para no confirmar un vacío. */
export function relationCreationModel(type: ResolvedContentType, term: string): FormModel {
	const model = buildFormModel(type, null);
	const name =
		type.titleField === null
			? null
			: physicalFieldFor(type, type.titleField, type.localization?.defaultLocale ?? '');
	const field = type.fields.find((field) => field.name === name);
	if (
		!field ||
		field.schema.readonly ||
		field.hidden ||
		(field.widget !== 'text' && field.widget !== 'textarea')
	)
		return model;
	model.baseline[field.name] = term.trim();
	const slug = slugWriteForTitleEdit(type, 'create', field.name, term.trim(), []);
	const slugField = type.fields.find((field) => field.name === slug?.field);
	if (
		slug &&
		slugField &&
		!slugField.schema.readonly &&
		!slugField.hidden &&
		(slugField.widget === 'text' || slugField.widget === 'textarea')
	)
		model.baseline[slug.field] = slug.value;
	return model;
}

/** Incorpora el destino confirmado sin togglearlo, conservando orden y cardinalidad. */
export function incorporateCreatedRelation(
	current: RecordId[],
	id: RecordId,
	multiple: boolean,
	maxSelect?: number
): RecordId[] | null {
	if (!multiple) return [id];
	if (current.includes(id)) return current;
	if (maxSelect !== undefined && current.length >= maxSelect) return null;
	return [...current, id];
}
