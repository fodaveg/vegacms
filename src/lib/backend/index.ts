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
	SecondFactorMethod,
	Session,
	StrongAuthLoginOutcome,
	StrongAuthStatus,
	ThumbSpec,
	TotpEnrollment,
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
export type { FileField } from './file-guards';
export { validateFileFieldInput } from './file-guards';

export type {
	AddFieldsResult,
	CollectionFieldSpec,
	CollectionSpec,
	EnsureResult
} from './collections';
export {
	checkCreatableCollectionNames,
	checkReservedNames,
	isCreatableCollectionName,
	isUserAuthorableCollectionName,
	isReservedCollectionName,
	VEGA_COLLECTION
} from './collections';

export type { GeneratedMigration, SchemaMigrationOp } from './migration';
export { generateSchemaMigration } from './migration';

export type { BackendPort, StrongAuthPort } from './port';

export type {
	BuildClient,
	BuildClientOptions,
	BuildState,
	BuildStatus,
	BuildTriggerResult,
	PollBuildStatusOptions
} from './build-client';
export { createBuildClient, parseBuildStatus, pollBuildStatus } from './build-client';

export type { UnpublishedChangesResult } from './unpublished-changes';
export { detectUnpublishedChanges } from './unpublished-changes';
