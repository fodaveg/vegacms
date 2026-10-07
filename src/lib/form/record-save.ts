import type { VegaConflictError } from '$lib/backend/errors';
import { isConflictError, VegaError } from '$lib/backend/errors';
import type { RecordInput, VegaRecord } from '$lib/backend/types';
import type { UpdateOptions } from '$lib/backend/port';
import type { RecordVersion } from '$lib/backend/version';
import type { ResolvedContentType } from '$lib/model/types';
import { isFieldValidationError, mapFieldErrors, type FieldErrorsView } from './field-errors';
import type { FormMode, FormValues } from './form-model';
import type { FormInputValues } from './dirty';
import { toRecordInput } from './to-record-input';

interface RecordSend<TJob> {
	type: ResolvedContentType;
	baseline: FormValues;
	values: FormInputValues;
	/** Omitido en «Guardar igualmente»: `toRecordInput` conserva su modo edit por defecto. */
	mode?: FormMode;
	/** Se lee tras capturar la redirección, igual que en los dos envíos originales. */
	expectedVersion: () => RecordVersion | undefined;
	onSubmit: (input: RecordInput, opts?: UpdateOptions) => Promise<VegaRecord>;
	captureRedirectJob: () => TJob | null;
	syncRedirects: (job: TJob) => Promise<string | null>;
	runAfterSave: (saved: VegaRecord) => Promise<string[]>;
	note?: () => string | undefined;
	commitSaved: (saved: VegaRecord, note?: string) => void;
}

/**
 * Envío común de Guardar y Guardar igualmente. Mantiene la captura de redirecciones antes del
 * puerto, los ganchos con el formulario todavía en `saving`, y el reasiento al final. La
 * validación, el conflicto y el foco posterior a `saving = false` pertenecen al componente.
 */
export async function sendRecord<TJob>(request: RecordSend<TJob>): Promise<void> {
	const input = toRecordInput(request.type, request.baseline, request.values, request.mode);
	const job = request.captureRedirectJob();
	const expectedVersion = request.expectedVersion();
	const saved =
		expectedVersion === undefined
			? await request.onSubmit(input)
			: await request.onSubmit(input, { expectedVersion });
	const redirectNote = job ? await request.syncRedirects(job) : null;
	const hookNotes = await request.runAfterSave(saved);
	request.commitSaved(saved, joinSaveNotes([redirectNote, request.note?.(), ...hookNotes]));
}

/** Clasifica el rechazo sin modificar estado: ambos caminos de guardado muestran el mismo error. */
export function classifyRecordSaveError(
	error: unknown
):
	| { kind: 'conflict'; error: VegaConflictError }
	| { kind: 'field'; errors: FieldErrorsView }
	| { kind: 'other'; error: VegaError } {
	const vegaError =
		error instanceof VegaError ? error : VegaError.backend('Error al guardar', error);
	if (isConflictError(vegaError)) return { kind: 'conflict', error: vegaError };
	if (isFieldValidationError(vegaError)) {
		return { kind: 'field', errors: mapFieldErrors(vegaError) };
	}
	return { kind: 'other', error: vegaError };
}

/** Une solo las notas presentes para el aviso de guardado. */
function joinSaveNotes(parts: (string | null | undefined)[]): string | undefined {
	return parts.filter((part) => !!part).join(' ') || undefined;
}
