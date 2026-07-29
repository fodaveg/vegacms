<script lang="ts">
	/**
	 * Mini-formulario de un bloque embebido en `RecordBlocks.svelte`.
	 *
	 * En modo tipado, el orden y la selección de campos pertenecen a `ResolvedBlockType.fields`:
	 * los `source: 'data'` usan los campos sintéticos de `resolveBlockDataFields` y solo cruzan la
	 * frontera JSON mediante `readBlockData`/`writeBlockData`; los `source: 'record'` se casan por
	 * nombre con las columnas descubiertas del hijo y solo esas columnas llegan a `toRecordInput`.
	 * Mantener ambos estados separados es el guardarraíl que impide inventar columnas físicas.
	 *
	 * Cada editor permanece montado aunque su fila esté plegada (`hidden` en `RecordBlocks`), así
	 * que plegar y desplegar conserva el borrador. El baseline solo se reasienta cuando `onSubmit`
	 * confirma: un fallo del puerto deja intactos ambos estados y permite reintentar.
	 *
	 * Sin tipo resuelto no se ofrece un guardado ambiguo. Si `data` no es un objeto JSON tampoco:
	 * se enseña su valor crudo y se bloquea antes de llamar a `writeBlockData`, que es tolerante al
	 * leer pero no debe decidir si un valor histórico destructible se puede sustituir.
	 *
	 * El modo homogéneo anterior (`dataField === null`) conserva el formulario físico legado. Es
	 * una compatibilidad deliberada para colecciones de bloques sin vocabulario heterogéneo.
	 */
	import { tick, untrack } from 'svelte';
	import type {
		ResolvedBlockField,
		ResolvedBlockType,
		ResolvedContentType,
		ResolvedField
	} from '$lib/model/types';
	import type { FieldInputValue, RecordInput, VegaRecord } from '$lib/backend/types';
	import type { PreviewDraftRecord } from '$lib/backend/preview-client';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import { settingsRoute } from '$lib/nav/routes';
	import {
		readBlockData,
		resolveBlockDataFields,
		writeBlockData,
		type BlockDataValues
	} from '$lib/model/block-data-form';
	import { validateBlockData } from '$lib/model/block-validation';
	import { buildFormModel, type FormValues } from './form-model';
	import { isDirty, type FormInputValues } from './dirty';
	import { toRecordInput } from './to-record-input';
	import { validateForm } from './validation';
	import {
		isFieldValidationError,
		mapFieldErrors,
		type FieldErrorsView,
		type TranslatedError
	} from './field-errors';
	import { fieldErrorMessage } from './field-error-message';
	import { setRecordIdentity } from './record-context';
	import FieldRow from './FieldRow.svelte';

	interface Props {
		/** Tipo físico de la colección hija (p. ej. `landing_block`). */
		childType: ResolvedContentType;
		/** Tipo editorial de ESTA fila; `null` para tipo retirado, vacío o modo homogéneo. */
		blockType: ResolvedBlockType | null;
		/** Valor crudo de la columna de tipo, para distinguir huérfano de vacío. */
		rawBlockType: string | null;
		/** Columna JSON declarada por `blocks.dataField`; `null` identifica el modo homogéneo. */
		dataField: string | null;
		record: VegaRecord;
		/** `parentField`/`orderField`/`typeField`: nunca editables desde este formulario. */
		structuralFields: readonly string[];
		onSubmit: (input: RecordInput) => Promise<VegaRecord>;
		onSaved: (record: VegaRecord) => void;
		onDirtyChange: (dirty: boolean) => void;
		/** Publica el borrador en forma FÍSICA: las claves tipadas viajan dentro de `dataField`. */
		onDraftChange?: (record: PreviewDraftRecord) => void;
		disabled?: boolean;
		onBusyChange?: (busy: boolean) => void;
	}

	let {
		childType,
		blockType,
		rawBlockType,
		dataField,
		record,
		structuralFields,
		onSubmit,
		onSaved,
		onDirtyChange,
		onDraftChange = () => {},
		disabled = false,
		onBusyChange = () => {}
	}: Props = $props();

	const ctx = getVegaContext();
	const EMPTY_ERRORS: FieldErrorsView = { byField: {}, record: null };
	const typed = untrack(() => dataField !== null);
	const settingsHref = settingsRoute();

	// Props de identidad estables durante la vida de una fila: `RecordBlocks` usa `{#each ... (id)}`
	// y remonta el componente si cambia el registro. Capturarlas evita que una recarga de la lista
	// pise un borrador vivo con el eco de otro cambio estructural.
	const initialRecord = untrack(() => $state.snapshot(record as unknown)) as VegaRecord;
	let baseline = untrack(() => buildFormModel(childType, initialRecord).baseline);
	let current = $state<FormInputValues>({ ...baseline });
	let persistedData = $state.raw<unknown>(
		untrack(() => (dataField === null ? null : initialRecord.values[dataField]))
	);
	let dataBaseline = untrack<BlockDataValues>(() =>
		blockType === null ? {} : readBlockData(blockType, persistedData)
	);
	let dataCurrent = $state.raw<BlockDataValues>({ ...dataBaseline });
	let clientErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let backendErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let saving = $state(false);

	untrack(() => setRecordIdentity({ type: childType.name, id: initialRecord.id }));

	function isDataObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function rawDataText(value: unknown): string {
		const serialized = JSON.stringify(value, null, 2);
		return serialized === undefined ? String(value) : serialized;
	}

	function openSettings(event: MouseEvent): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toSettings();
	}

	type TypedField =
		| { kind: 'data'; field: ResolvedField }
		| { kind: 'record'; field: ResolvedField }
		| { kind: 'missing-record'; declaration: ResolvedBlockField };

	const typedFields = untrack<TypedField[]>(() => {
		if (blockType === null) return [];
		const dataFields = new Map(
			resolveBlockDataFields(blockType).map((field) => [field.name, field])
		);
		const recordFields = new Map(childType.fields.map((field) => [field.name, field]));

		const items: TypedField[] = [];
		for (const declaration of blockType.fields) {
			if (declaration.source === 'data') {
				const field = dataFields.get(declaration.name);
				if (field) items.push({ kind: 'data', field });
				continue;
			}
			const column = recordFields.get(declaration.name);
			if (column) {
				items.push({
					kind: 'record',
					// El schema/widget salen de la columna descubierta; el rótulo y el orden,
					// del tipo de bloque que dirige este formulario.
					field: { ...column, label: declaration.label }
				});
			} else {
				items.push({ kind: 'missing-record', declaration });
			}
		}
		return items;
	});

	const legacyFields = $derived(
		childType.fields.filter((field) => !field.hidden && !structuralFields.includes(field.name))
	);
	const invalidData = $derived(typed && blockType !== null && !isDataObject(persistedData));
	const recordDirty = $derived(isDirty(baseline, current));
	const dataDirty = $derived(
		typed &&
			blockType !== null &&
			!invalidData &&
			isDirty(dataBaseline as FormValues, dataCurrent as FormInputValues)
	);
	const dirty = $derived(
		typed ? blockType !== null && !invalidData && (recordDirty || dataDirty) : recordDirty
	);
	const inert = $derived(disabled || saving || invalidData);

	const errors = $derived.by<FieldErrorsView>(() => {
		const dataColumnError: TranslatedError | null =
			dataField === null ? null : (backendErrors.byField[dataField] ?? null);
		return {
			byField: { ...clientErrors.byField, ...backendErrors.byField },
			record: backendErrors.record ?? dataColumnError ?? clientErrors.record
		};
	});

	$effect(() => {
		onDirtyChange(dirty);
	});

	$effect(() => {
		const fields: FormInputValues = { ...current };
		if (typed && blockType !== null && !invalidData && dataField !== null) {
			fields[dataField] = writeBlockData(blockType, persistedData, dataCurrent);
		}
		onDraftChange({ id: record.id, fields });
	});

	$effect(() => {
		onBusyChange(saving);
	});

	function clearFieldError(name: string): void {
		if (name in clientErrors.byField) {
			const rest = { ...clientErrors.byField };
			delete rest[name];
			clientErrors = { ...clientErrors, byField: rest };
		}
		if (name in backendErrors.byField) {
			const rest = { ...backendErrors.byField };
			delete rest[name];
			backendErrors = { ...backendErrors, byField: rest };
		}
	}

	function handleRecordFieldChange(name: string, value: FieldInputValue): void {
		current = { ...current, [name]: value };
		clearFieldError(name);
	}

	function handleDataFieldChange(name: string, value: FieldInputValue): void {
		dataCurrent = { ...dataCurrent, [name]: value as BlockDataValues[string] };
		clearFieldError(name);
	}

	function validateTypedForm(): FieldErrorsView {
		const dataView = validateBlockData(blockType, dataCurrent);
		const physicalView = validateForm(childType, current);
		const claimedColumns = new Set(
			typedFields.flatMap((item) => (item.kind === 'record' ? [item.field.name] : []))
		);
		const byField = { ...dataView.byField };
		for (const [name, error] of Object.entries(physicalView.byField)) {
			if (claimedColumns.has(name)) byField[name] = error;
		}
		return { byField, record: dataView.record };
	}

	async function handleSave(): Promise<void> {
		if (saving || disabled || invalidData || (typed && blockType === null) || !dirty) return;

		const clientView = typed ? validateTypedForm() : validateForm(childType, current);
		clientErrors = clientView;
		if (Object.keys(clientView.byField).length > 0 || clientView.record) return;

		backendErrors = EMPTY_ERRORS;
		saving = true;
		try {
			const input = toRecordInput(childType, baseline, current);
			if (typed && blockType !== null && dataField !== null && dataDirty) {
				// ÚNICA escritura de `data`: parte del objeto persistido, de modo que las claves
				// shadowed y orphaned sobreviven por separado aunque el formulario no las pinte.
				input[dataField] = writeBlockData(blockType, persistedData, dataCurrent);
			}
			const saved = await onSubmit(input);

			baseline = buildFormModel(childType, saved).baseline;
			current = { ...baseline };
			if (typed && blockType !== null && dataField !== null) {
				persistedData = saved.values[dataField];
				dataBaseline = readBlockData(blockType, persistedData);
				dataCurrent = { ...dataBaseline };
			}
			clientErrors = EMPTY_ERRORS;
			backendErrors = EMPTY_ERRORS;
			onSaved(saved);
		} catch (err) {
			const vegaErr = err instanceof VegaError ? err : VegaError.backend('Error al guardar', err);
			if (isFieldValidationError(vegaErr)) {
				backendErrors = mapFieldErrors(vegaErr);
			} else {
				ctx.feedback.reportError(vegaErr, { action: 'block:save' });
			}
		} finally {
			saving = false;
			await tick();
		}
	}
</script>

<div class="vega-block-fields">
	{#if typed && blockType === null}
		<section class="vega-block-readonly" role="status">
			<p>
				{rawBlockType
					? ctx.t('editor.blocks.form.unknownType', { name: rawBlockType })
					: ctx.t('editor.blocks.form.noType')}
			</p>
			<!-- La URL real conserva abrir en pestaña nueva; el clic ordinario usa el NavApi del shell. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={settingsHref} class="vega-block-settings-link" onclick={openSettings}>
				{ctx.t('editor.blocks.form.openSettings')}
			</a>
			{#if dataField !== null}
				<div class="vega-block-raw">
					<strong>{ctx.t('editor.blocks.form.rawData', { field: dataField })}</strong>
					<pre>{rawDataText(persistedData)}</pre>
				</div>
			{/if}
		</section>
	{:else}
		{#if errors.record}
			<p class="vega-block-banner" role="alert">{fieldErrorMessage(ctx.t, errors.record)}</p>
		{/if}

		{#if invalidData && dataField !== null}
			<section class="vega-block-readonly vega-block-readonly--danger" role="alert">
				<p>{ctx.t('editor.blocks.form.invalidData', { field: dataField })}</p>
				<div class="vega-block-raw">
					<strong>{ctx.t('editor.blocks.form.rawData', { field: dataField })}</strong>
					<pre>{rawDataText(persistedData)}</pre>
				</div>
			</section>
		{/if}

		{#if typed}
			{#each typedFields as item (item.kind === 'missing-record' ? item.declaration.name : item.field.name)}
				{#if item.kind === 'missing-record'}
					<div
						class="vega-block-missing-field"
						data-field={item.declaration.name}
						data-widget={item.declaration.widget}
					>
						<label for={`vega-block-missing-${record.id}-${item.declaration.name}`}>
							{item.declaration.label}
						</label>
						<input
							id={`vega-block-missing-${record.id}-${item.declaration.name}`}
							type="text"
							disabled
							aria-describedby={`vega-block-missing-help-${record.id}-${item.declaration.name}`}
						/>
						<p id={`vega-block-missing-help-${record.id}-${item.declaration.name}`}>
							{ctx.t('editor.blocks.form.missingRecordField', {
								field: item.declaration.name
							})}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={settingsHref} class="vega-block-settings-link" onclick={openSettings}>
								{ctx.t('editor.blocks.form.openSettings')}
							</a>
						</p>
					</div>
				{:else if item.kind === 'data'}
					<FieldRow
						field={item.field}
						value={dataCurrent[item.field.name]}
						error={errors.byField[item.field.name] ?? null}
						disabled={inert}
						typeReadonly={false}
						stacked
						onChange={(value) => handleDataFieldChange(item.field.name, value)}
					/>
				{:else}
					<FieldRow
						field={item.field}
						value={current[item.field.name]}
						error={errors.byField[item.field.name] ?? null}
						disabled={inert || structuralFields.includes(item.field.name)}
						typeReadonly={false}
						stacked
						onChange={(value) => handleRecordFieldChange(item.field.name, value)}
					/>
				{/if}
			{/each}
		{:else}
			{#each legacyFields as field (field.name)}
				<FieldRow
					{field}
					value={current[field.name]}
					error={errors.byField[field.name] ?? null}
					disabled={inert}
					typeReadonly={false}
					stacked
					onChange={(value) => handleRecordFieldChange(field.name, value)}
				/>
			{/each}
		{/if}

		<div class="vega-block-actions">
			<button
				type="button"
				class="vega-block-save-button"
				disabled={inert || !dirty || (typed && blockType === null)}
				onclick={handleSave}
			>
				{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
			</button>
		</div>
	{/if}
</div>

<style>
	.vega-block-fields {
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
		min-width: 0;
	}

	.vega-block-banner,
	.vega-block-readonly {
		margin: 0;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	.vega-block-banner,
	.vega-block-readonly--danger {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-block-readonly p {
		margin: 0;
	}

	.vega-block-settings-link {
		display: inline-block;
		margin-top: 0.35rem;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}

	.vega-block-raw {
		margin-top: 0.75rem;
	}

	.vega-block-raw strong {
		display: block;
		margin-bottom: 0.3rem;
		font-size: 0.78rem;
	}

	.vega-block-raw pre {
		max-height: 14rem;
		margin: 0;
		padding: 0.6rem;
		overflow: auto;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.78rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.vega-block-missing-field {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.vega-block-missing-field label {
		margin-bottom: 0.35rem;
		color: var(--ink-2);
		font-size: 0.82em;
		font-weight: 650;
		letter-spacing: 0.03em;
		overflow-wrap: anywhere;
	}

	.vega-block-missing-field input {
		width: 100%;
		min-height: 2.25rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
		opacity: 0.65;
	}

	.vega-block-missing-field p {
		margin: 0.3rem 0 0;
		color: var(--warning);
		font-size: 0.82em;
		overflow-wrap: anywhere;
	}

	.vega-block-actions {
		display: flex;
		justify-content: flex-end;
	}

	.vega-block-save-button {
		height: 30px;
		padding: 0 0.8rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-block-save-button:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-block-save-button:focus-visible,
	.vega-block-settings-link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-block-save-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	@media (pointer: coarse) {
		.vega-block-save-button {
			min-height: 44px;
		}
	}
</style>
