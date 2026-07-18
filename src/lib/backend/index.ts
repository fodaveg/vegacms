/**
 * API pública del puerto de backend de Vega (`src/lib/backend/`, cero dependencias, ley L1).
 * Los adaptadores concretos se importan desde su propia carpeta
 * (`./adapters/memory`, `./adapters/pocketbase`), nunca desde aquí, para no arrastrar sus
 * dependencias (p.ej. el SDK `pocketbase`) a consumidores que no lo necesitan.
 */

export type {
	AuthChangeReason,
	Capabilities,
	ContentType,
	Field,
	FieldInputValue,
	FieldSubtype,
	FieldValue,
	FileRef,
	JsonValue,
	Page,
	RecordEvent,
	RecordId,
	RecordInput,
	Session,
	ThumbSpec,
	VegaRecord
} from './types';

export type { FilterNode, FilterOp, Query, SortSpec } from './query';
export {
	allowedFilterOps,
	DEFAULT_PAGE,
	DEFAULT_PER_PAGE,
	FILTER_OPS_BY_FIELD_KIND,
	isScalarField,
	MAX_PER_PAGE,
	validateQuery
} from './query';

export type { FieldError, VegaErrorKind, VegaErrorOptions } from './errors';
export { LOCAL_REJECTION_CODES, PB_VALIDATION_CODES, VegaError } from './errors';

export { isEmptyValue, normalizeFieldValue } from './normalize';
export { assertContentTypeWritable, checkUnwritableFields } from './write-guards';

export type { BackendPort } from './port';
