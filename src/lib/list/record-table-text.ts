import type { VegaAppContext } from '$lib/app-context';
import type { VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { classifyStatusBadge, describeCell, describeStatusBadge } from './cell';
import type { ColumnSpec } from './columns';
import { resolveTitleCellText } from './list-load';

/** Texto de apertura: columna de título, primera columna o id si la tabla no tiene columnas. */
export function recordOpenText(
	record: VegaRecord,
	column: ColumnSpec | null,
	ctx: VegaAppContext
): string {
	if (!column) return record.id;
	const descriptor = describeCell(
		column.field,
		record.values[column.field.name] ?? null,
		ctx.locale
	);
	return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
}

/** Solo los descriptores de una línea sirven como subtítulo de la fila. */
export function recordSubtitleText(
	record: VegaRecord,
	field: ResolvedField | null,
	ctx: VegaAppContext
): string | null {
	if (!field) return null;
	const descriptor = describeCell(field, record.values[field.name] ?? null, ctx.locale);
	switch (descriptor.kind) {
		case 'text':
		case 'number':
		case 'date':
		case 'mono':
		case 'richtext':
			return descriptor.text;
		default:
			return null;
	}
}

/** Misma insignia que la celda de Estado, para su copia en la fila estrecha. */
export function recordInlineStatusBadge(
	record: VegaRecord,
	column: ColumnSpec | undefined,
	type: ResolvedContentType,
	ctx: VegaAppContext
): { label: string; kind: string } | null {
	if (!column) return null;
	const descriptor = describeCell(
		column.field,
		record.values[column.field.name] ?? null,
		ctx.locale
	);
	if (descriptor.kind !== 'text') return null;
	const badge = describeStatusBadge(
		type,
		record.values,
		ctx.model.scheduledPublishing ?? 'unknown',
		ctx.locale,
		ctx.t
	);
	return {
		label: badge?.label ?? descriptor.text,
		kind: badge?.kind ?? classifyStatusBadge(descriptor.text)
	};
}
