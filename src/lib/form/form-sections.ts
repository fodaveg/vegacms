/**
 * `buildFormSections` (Fase F5-a + §4.9b): agrupa `type.fields` según `type.fieldGroups` (P2) en
 * las SECCIONES que `RecordForm.svelte` pinta como fichas (`.vega-fsection`) — un `FormSection`
 * por grupo, en su orden efectivo, más una sección final SIN cabecera para cualquier campo
 * "huérfano" visible (su `group` no aparece en `fieldGroups`; no debería pasar, P2 lo garantiza, pero
 * L11 manda degradar sin desaparecer el campo en vez de crashear). Extraído a un módulo PURO
 * para poder testear la agrupación sin montar el componente — mismo patrón que
 * `dirty.ts`/`to-record-input.ts`/`first-error-field.ts` (ver cabecera de `RecordForm.svelte`).
 *
 * `columns` (§4.9b, la rejilla responsive bilingüe: `titleEs`|`titleEn` lado a lado) viaja tal
 * cual desde el `ResolvedFieldGroup` que ya resolvió P2 — 1 = apilado (el layout de siempre),
 * 2/3 = rejilla. La sección de huérfanos siempre es `columns: 1`: no hay grupo real (ni
 * `ResolvedFieldGroup`) del que heredarlo.
 */
import type { ResolvedContentType, ResolvedField, ResolvedLocalizedField } from '$lib/model/types';

export interface FormSection {
	/** Nombre del grupo, o `null` para el grupo anónimo/huérfanos (sin `<h2>` de cabecera). */
	group: string | null;
	/** Columnas de la rejilla del grupo (§4.9b): 1 = apilado, el layout de siempre. */
	columns: 1 | 2 | 3;
	fields: ResolvedField[];
}

function localizeVisibleFields(
	type: ResolvedContentType,
	activeLocale: string | undefined
): ResolvedField[] {
	const visibleFields = type.fields.filter((field) => !field.hidden);
	const localization = type.localization;
	if (!localization || !activeLocale) return visibleFields;

	const physicalToLogical = new Map<string, ResolvedLocalizedField>();
	for (const logical of localization.fields) {
		for (const physicalName of Object.values(logical.fields)) {
			physicalToLogical.set(physicalName, logical);
		}
	}
	const byName = new Map(visibleFields.map((field) => [field.name, field]));
	const result: ResolvedField[] = [];
	for (const field of visibleFields) {
		const logical = physicalToLogical.get(field.name);
		if (!logical) {
			result.push(field);
			continue;
		}
		const anchorName = logical.fields[localization.defaultLocale];
		if (field.name !== anchorName) continue;
		const localized = byName.get(logical.fields[activeLocale]);
		if (!localized) continue;
		// La posición/grupo pertenece al ancla del locale por defecto; widget/help/placeholder y
		// nombre pertenecen al campo físico activo. La etiqueta es la del concepto lógico.
		result.push({ ...localized, label: logical.label, group: field.group });
	}
	return result;
}

/** Locale al que pertenece un campo físico traducible, o `null` si es un campo compartido. */
export function localeForField(type: ResolvedContentType, fieldName: string): string | null {
	const localization = type.localization;
	if (!localization) return null;
	for (const logical of localization.fields) {
		for (const [locale, physicalName] of Object.entries(logical.fields)) {
			if (physicalName === fieldName) return locale;
		}
	}
	return null;
}

/**
 * API pública de este módulo. `activeLocale` es opcional para conservar exactamente el
 * comportamiento histórico en tipos que no declaran localización.
 */
export function buildFormSections(type: ResolvedContentType, activeLocale?: string): FormSection[] {
	// `hidden` es la decisión efectiva del resolver (schema + override del manifiesto). Esos campos
	// siguen presentes en el FormModel para conservar sus valores, pero no deben producir un widget.
	const visibleFields = localizeVisibleFields(type, activeLocale);

	// Objeto plano como acumulador LOCAL de esta pasada (descartado al terminar): idéntico al
	// que usaba el `$derived.by` de `RecordForm.svelte` antes de extraerse a este módulo.
	const placed: Record<string, true> = {};
	const sections: FormSection[] = type.fieldGroups.map((fieldGroup) => {
		const fields = visibleFields.filter((f) => f.group === fieldGroup.name);
		for (const f of fields) placed[f.name] = true;
		return { group: fieldGroup.name, columns: fieldGroup.columns, fields };
	});

	const leftover = visibleFields.filter((f) => !placed[f.name]);
	if (leftover.length > 0) sections.push({ group: null, columns: 1, fields: leftover });

	return sections;
}
