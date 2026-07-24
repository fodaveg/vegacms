/**
 * `isRightAlignedColumn` (R3 del rediseño, mockup `.cell-date`/`th.th-date`): las columnas
 * `date`/`number` se alinean a la derecha (mismo criterio tipográfico que cualquier tabla con
 * columnas numéricas — la magnitud se lee mejor alineada al dígito de las unidades) tanto en la
 * cabecera como en la celda. Módulo puro, sin Svelte: solo mira `field.schema.type`, ninguna
 * otra columna (`text`/`select`/`relation`/`file`…) se ve afectada.
 */

import type { ColumnSpec } from './columns';

export function isRightAlignedColumn(column: ColumnSpec): boolean {
	return column.field.schema.type === 'date' || column.field.schema.type === 'number';
}
