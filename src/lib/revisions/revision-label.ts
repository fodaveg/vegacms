/**
 * `revisionDisplayLabel`/`revisionDateLabel`/`revisionAuthorLabel` (`#lote-integridad`, Fase B
 * §10.1/§10.2): las tres piezas de presentación de UNA revisión — extraídas de
 * `RevisionsPanel.svelte` (donde nacieron, fix de code-review de B1) para que la papelera
 * (`/papelera`, Fase B2) las reutilice tal cual, en vez de reimplementar el mismo criterio (§10.2
 * del contrato: "aprovecha el `revisionLabel` por `titleField` que hiciste en `RevisionsPanel` —
 * aquí es donde más falta hace: el registro ya no existe").
 *
 * A diferencia del `label` almacenado en `vega_revisions` (heurístico ciego `guessRecordLabel`,
 * capa P3 SIN `ContentModel` — ver `record-label.ts`), este vive en la capa de RUTAS/UI (P3/P5),
 * que SÍ tiene el `titleField` YA resuelto de un `ResolvedContentType` — un tipo cuyo campo título
 * se llame p. ej. `headline` deja de enseñar el id crudo que `guessRecordLabel` habría devuelto.
 * El `label` almacenado queda como RESERVA: sin `titleField` (o `null` si la colección de origen
 * ya no existe en el esquema — el caso de la papelera, `revisions.collection` puede apuntar a un
 * tipo borrado), o si esta revisión concreta no trae un valor de texto usable en ese campo
 * (esquema cambiado desde que se guardó).
 */

import type { FieldValue } from '$lib/backend/types';

export function revisionDisplayLabel(
	titleField: string | null,
	revision: { values: Record<string, FieldValue>; label: string }
): string {
	if (titleField !== null) {
		const raw = revision.values[titleField];
		if (typeof raw === 'string' && raw.trim() !== '') return raw;
	}
	return revision.label;
}

/**
 * Fecha legible de `created` (ISO 8601 UTC o `null`), o `unknownText` si falta/es inválida —
 * también extraída de `RevisionsPanel.svelte` para que `/papelera` la reutilice. `locale`/
 * `unknownText` entran como parámetros (nunca `ctx` directo): esta función sigue siendo pura,
 * sin depender de `VegaAppContext`.
 */
export function revisionDateLabel(
	created: string | null,
	locale: string,
	unknownText: string
): string {
	if (created === null) return unknownText;
	const parsed = new Date(created);
	if (Number.isNaN(parsed.getTime())) return unknownText;
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
		parsed
	);
}

/** `author` (email, o `''` si no había sesión) o `unknownText` — mismo criterio que
 *  `RevisionsPanel.svelte`. */
export function revisionAuthorLabel(author: string, unknownText: string): string {
	return author !== '' ? author : unknownText;
}
