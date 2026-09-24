/**
 * Texto corto de UN lado de una fila de diff (antes/después), compartido por `RevisionDiff.svelte`
 * (historial) y el aviso de edición concurrente (`form/ConflictNotice.svelte`) a través de
 * `DiffRow.svelte`. Nació dentro de `RevisionDiff.svelte`; se extrae sin cambiar nada para que el
 * segundo consumidor no invente otro formateador (§9 del contrato de Fase B: "no inventes un
 * segundo formateador de valores" — pinta con `describeCell`, `$lib/list/cell.ts`).
 */

import type { FieldValue } from '$lib/backend/types';
import type { Locale } from '$lib/i18n';
import { describeCell, type CellDescriptor } from '$lib/list/cell';
import type { ResolvedField } from '$lib/model/types';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Aplana un `CellDescriptor` a texto corto: mismo vocabulario de `kind` que `RecordTable.svelte`,
 *  sin sus ramas de miniatura/enlace (aquí solo hay un valor de comparación). */
function cellText(t: Translate, descriptor: CellDescriptor): string {
	switch (descriptor.kind) {
		case 'empty':
			return t('revisions.diff.empty');
		case 'text':
		case 'richtext':
		case 'mono':
		case 'number':
		case 'date':
			return descriptor.text;
		case 'bool':
			return descriptor.value ? t('list.cell.yes') : t('list.cell.no');
		case 'select-multi':
			return descriptor.values.length > 0
				? descriptor.values.join(', ')
				: t('revisions.diff.empty');
		case 'relation':
			return t('revisions.diff.relationCount', { count: descriptor.count });
		case 'file':
			return descriptor.refs.length > 0 ? descriptor.refs.join(', ') : t('revisions.diff.empty');
	}
}

/**
 * `undefined` (campo ausente en ese lado) se pinta como "no existía" — distinto de un valor vacío
 * de verdad (`revisions.diff.empty`, "(vacío)"), para no confundir "faltaba el campo" con "el
 * campo estaba vacío". Sin `field` (el esquema cambió desde entonces) degrada igual (L11).
 */
export function diffSideText(
	t: Translate,
	locale: Locale,
	field: ResolvedField | null,
	value: FieldValue | undefined
): string {
	if (value === undefined || field === null) return t('revisions.diff.absent');
	return cellText(t, describeCell(field, value, locale));
}
