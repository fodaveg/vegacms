/**
 * `buildFormSections` (Fase F5-a + §4.9b): agrupa `type.fields` según `type.fieldGroups` (P2) en
 * las SECCIONES que `RecordForm.svelte` pinta como fichas (`.vega-fsection`) — un `FormSection`
 * por grupo, en su orden efectivo, más una sección final SIN cabecera para cualquier campo
 * "huérfano" (su `group` no aparece en `fieldGroups`; no debería pasar, P2 lo garantiza, pero
 * L11 manda degradar sin desaparecer el campo en vez de crashear). Extraído a un módulo PURO
 * para poder testear la agrupación sin montar el componente — mismo patrón que
 * `dirty.ts`/`to-record-input.ts`/`first-error-field.ts` (ver cabecera de `RecordForm.svelte`).
 *
 * `columns` (§4.9b, la rejilla responsive bilingüe: `titleEs`|`titleEn` lado a lado) viaja tal
 * cual desde el `ResolvedFieldGroup` que ya resolvió P2 — 1 = apilado (el layout de siempre),
 * 2/3 = rejilla. La sección de huérfanos siempre es `columns: 1`: no hay grupo real (ni
 * `ResolvedFieldGroup`) del que heredarlo.
 */
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';

export interface FormSection {
	/** Nombre del grupo, o `null` para el grupo anónimo/huérfanos (sin `<h2>` de cabecera). */
	group: string | null;
	/** Columnas de la rejilla del grupo (§4.9b): 1 = apilado, el layout de siempre. */
	columns: 1 | 2 | 3;
	fields: ResolvedField[];
}

/** API pública de este módulo. Pura: misma entrada ⇒ misma salida, sin depender de Svelte. */
export function buildFormSections(type: ResolvedContentType): FormSection[] {
	// Objeto plano como acumulador LOCAL de esta pasada (descartado al terminar): idéntico al
	// que usaba el `$derived.by` de `RecordForm.svelte` antes de extraerse a este módulo.
	const placed: Record<string, true> = {};
	const sections: FormSection[] = type.fieldGroups.map((fieldGroup) => {
		const fields = type.fields.filter((f) => f.group === fieldGroup.name);
		for (const f of fields) placed[f.name] = true;
		return { group: fieldGroup.name, columns: fieldGroup.columns, fields };
	});

	const leftover = type.fields.filter((f) => !placed[f.name]);
	if (leftover.length > 0) sections.push({ group: null, columns: 1, fields: leftover });

	return sections;
}
