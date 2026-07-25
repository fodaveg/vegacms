/**
 * `VegaRecord` de `vega_revisions` → `RevisionRecord`, tolerante (`#lote-integridad`, Fase B):
 * mismo espíritu que `media/media-item.ts#toMediaItemView` — ningún consumidor de la UI
 * (`RevisionsPanel.svelte`, `RevisionDiff.svelte`) debe confiar en la forma cruda de `values`,
 * que en teoría podría venir de un backend manipulado a mano fuera de Vega (la colección es un
 * `base` normal de PocketBase, no hay nada que impida un `INSERT` directo con un `kind` fuera del
 * vocabulario cerrado). `parseRevisionRecord` devuelve `null` ante cualquier forma inesperada —el
 * llamador filtra, nunca revienta la lista entera por una fila hostil.
 */

import type { FieldValue, RecordId, VegaRecord } from '$lib/backend/types';

export type RevisionKind = 'update' | 'delete';

/** Vista ya desnormalizada de una fila de `vega_revisions` (§1 del contrato de Fase B). */
export interface RevisionRecord {
	id: RecordId;
	collection: string;
	recordId: RecordId;
	kind: RevisionKind;
	/** La PRE-IMAGEN completa (§2, INVARIANTE 1): `VegaRecord.values` del registro de origen tal
	 *  cual estaba ANTES de la escritura que disparó este snapshot. */
	values: Record<string, FieldValue>;
	label: string;
	/** Cadena vacía si no había sesión (no debería pasar en la práctica). */
	author: string;
	/** ISO 8601 UTC, o `null` si el registro no lo trae todavía (defensivo: `autodate` siempre lo
	 *  rellena en la práctica). */
	created: string | null;
}

function parseKind(raw: FieldValue): RevisionKind | null {
	return raw === 'update' || raw === 'delete' ? raw : null;
}

function parseValues(raw: FieldValue): Record<string, FieldValue> {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
	return raw as Record<string, FieldValue>;
}

/** `null` si `record` no tiene la forma mínima esperada (`collection`/`recordId` de texto, `kind`
 *  dentro del vocabulario cerrado) — el resto de campos degrada campo a campo sin invalidar nada. */
export function parseRevisionRecord(record: VegaRecord): RevisionRecord | null {
	const kind = parseKind(record.values.kind);
	if (kind === null) return null;

	const collection = record.values.collection;
	const recordId = record.values.recordId;
	if (typeof collection !== 'string' || typeof recordId !== 'string') return null;

	const label = typeof record.values.label === 'string' ? record.values.label : recordId;
	const author = typeof record.values.author === 'string' ? record.values.author : '';
	const created = typeof record.values.created === 'string' ? record.values.created : null;

	return {
		id: record.id,
		collection,
		recordId,
		kind,
		values: parseValues(record.values.values),
		label,
		author,
		created
	};
}
