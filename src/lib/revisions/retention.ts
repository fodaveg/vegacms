/**
 * Retención de `vega_revisions` (`#lote-integridad`, Fase B §7): las constantes con nombre + los
 * dos selectores PUROS que deciden QUÉ se poda. La poda EN SÍ (quién borra de verdad contra el
 * puerto) vive en `with-revisions.ts`, disparada fire-and-forget tras cada snapshot — separada a
 * propósito de la DECISIÓN de qué podar, para que esta sea testeable sin un `BackendPort` de por
 * medio (§11 del contrato: "la función que decide QUÉ se poda debe ser pura y testeable aparte de
 * la que borra").
 *
 * Dos podas independientes, con ámbito distinto:
 * - `selectUpdateRevisionsToPrune`: POR REGISTRO — conserva las `keepPerRecord` versiones
 *   (`kind:'update'`) más recientes de UN `(collection, recordId)`, poda el resto. Se dispara tras
 *   cada snapshot de `update` (Fase B1, ya cableado).
 * - `selectTrashRevisionsToPrune`: GLOBAL — cualquier entrada de papelera (`kind:'delete'`) con
 *   `created` anterior a `ahora - trashDays` cae, con techo `TRASH_PRUNE_BATCH_LIMIT` por pasada
 *   (§7: "para no provocar una tormenta de peticiones en una papelera muy vieja"). Fase B1 no crea
 *   todavía ninguna revisión `kind:'delete'` (el snapshot de `delete` es el gancho de Fase B2, ver
 *   `with-revisions.ts`), así que esta función queda lista pero sin invocador real hasta entonces.
 */

import type { RecordId } from '$lib/backend/types';

export const DEFAULT_KEEP_PER_RECORD = 20;
export const DEFAULT_TRASH_RETENTION_DAYS = 30;
/** Techo por pasada de la poda de papelera (§7, ver cabecera). La poda de versiones no lo
 *  necesita: su tamaño de entrada ya está acotado por `keepPerRecord` + lo que se acumuló desde
 *  la última pasada, nunca por "toda la papelera del proyecto". */
export const TRASH_PRUNE_BATCH_LIMIT = 50;

/** Metadato MÍNIMO de una revisión que necesita una decisión de poda — nunca el registro entero
 *  (ni su `values`, la pre-imagen puede ser arbitrariamente grande). */
export interface RevisionPruneCandidate {
	id: RecordId;
	kind: 'update' | 'delete';
	/** ISO 8601 UTC (`autodate`, §1): ordenable lexicográficamente, mismo criterio que el resto
	 *  del repo para `created`/`updated`. */
	created: string;
}

/** Orden DESCENDENTE por `created` (más reciente primero) sin mutar el array de entrada. */
function sortByCreatedDesc(revisions: readonly RevisionPruneCandidate[]): RevisionPruneCandidate[] {
	return [...revisions].sort((a, b) =>
		a.created < b.created ? 1 : a.created > b.created ? -1 : 0
	);
}

/**
 * Qué revisiones `kind:'update'` sobran de UN `(collection, recordId)`: `revisions` debe venir YA
 * filtrada a esa identidad — esta función no la conoce, sería un parámetro redundante para lo que
 * decide. Conserva las `keepPerRecord` más recientes (por `created` desc) y devuelve los ids del
 * resto. `keepPerRecord <= 0` poda TODAS las de `kind:'update'` (retención desactivada por
 * completo, caso límite válido: David puede fijar `keepPerRecord: 0`).
 */
export function selectUpdateRevisionsToPrune(
	revisions: readonly RevisionPruneCandidate[],
	keepPerRecord: number
): RecordId[] {
	const updates = sortByCreatedDesc(revisions.filter((r) => r.kind === 'update'));
	return updates.slice(Math.max(keepPerRecord, 0)).map((r) => r.id);
}

/**
 * Qué entradas de papelera (`kind:'delete'`) llevan más de `trashDays` desde `created`, acotado a
 * `limit` por pasada (§7). `now` es un parámetro EXPLÍCITO (nunca `Date.now()` leído dentro): el
 * test fija "ahora" sin mockear el reloj global, mismo criterio que `describeCell`
 * (`$lib/list/cell.ts`).
 */
export function selectTrashRevisionsToPrune(
	revisions: readonly RevisionPruneCandidate[],
	trashDays: number,
	now: number,
	limit: number = TRASH_PRUNE_BATCH_LIMIT
): RecordId[] {
	const cutoff = now - trashDays * 24 * 60 * 60 * 1000;
	return revisions
		.filter((r) => r.kind === 'delete' && new Date(r.created).getTime() < cutoff)
		.slice(0, limit)
		.map((r) => r.id);
}
