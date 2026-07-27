<script lang="ts">
	/**
	 * `BlockEditor.svelte` (capacidad `blocks`, lote "editor" Fase A): el mini-formulario de UN
	 * bloque desplegado dentro de `RecordBlocks.svelte`. Es una versión EN MINIATURA de
	 * `RecordForm.svelte` — mismo baseline/current/dirty/validación/envío — pero deliberadamente
	 * SIN barra pegajosa, raíl, aside, guard de salida (`beforeNavigate`) ni atajo ⌘S: todo eso
	 * es del REGISTRO PADRE, que ya lo tiene. Este componente solo sabe editar y guardar UN
	 * registro hijo, tal y como `RecordForm` sabe editar y guardar el suyo.
	 *
	 * **Por qué un guardado propio y no uno compartido con el padre** (documentado también en
	 * `RecordBlocks.svelte`, la cabecera "completa" de la decisión): un bloque se guarda con SU
	 * PROPIO botón "Guardar" (reusa `editor.save`/`editor.saving`), vía `port.update` directo —
	 * NO se agrega al payload del `RecordForm` padre. Extender `onSubmit`/`RecordInput` del padre
	 * para escribir VARIOS registros en un solo envío rompería su contrato (§4.3: un `RecordInput`
	 * es SIEMPRE de una colección) y acoplaría la validación de N tipos de contenido distintos al
	 * mismo `handleSubmit`. El precio de esta decisión es justo el que exige el enunciado del lote:
	 * un bloque con ediciones sin guardar cuenta como "sucio" (`onDirtyChange`, reenviado por
	 * `RecordBlocks` hasta `RecordForm`) hasta que se guarda con su propio botón o se descarta
	 * colapsando la fila.
	 *
	 * Reusa TAL CUAL la maquinaria pura de F5-a (mismos módulos que `RecordForm`, cero lógica
	 * duplicada): `buildFormModel` (baseline), `dirtyFields`/`isDirty` (`dirty.ts`), `validateForm`
	 * (cliente), `toRecordInput` (payload), `mapFieldErrors`/`isFieldValidationError`
	 * (`field-errors.ts`). Lo único que NO reusa es `form-sections.ts`: los campos se pintan en una
	 * lista PLANA con `type.fields` (sin tarjetas por grupo ni columna aside/main — ya está dentro
	 * de una tarjeta de bloque, meter sub-tarjetas sería ruido visual), así que un `fieldGroups`/
	 * `localization` que el tipo hijo declare no se respeta aquí (limitación consciente de alcance
	 * de esta fase: un bloque es, por diseño, más simple que un registro de primera clase).
	 */
	import { tick, untrack } from 'svelte';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { FieldInputValue, RecordInput, VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import { buildFormModel } from './form-model';
	import { isDirty, type FormInputValues } from './dirty';
	import { toRecordInput } from './to-record-input';
	import { validateForm } from './validation';
	import { isFieldValidationError, mapFieldErrors, type FieldErrorsView } from './field-errors';
	import { fieldErrorMessage } from './field-error-message';
	import { setRecordIdentity } from './record-context';
	import FieldRow from './FieldRow.svelte';

	interface Props {
		/** El `ResolvedContentType` de la colección HIJA (p.ej. `landing_block`). */
		childType: ResolvedContentType;
		record: VegaRecord;
		/** `parentField`/`orderField` de `blocks` (P2, `ResolvedBlocksConfig`): estructurales, el
		 *  usuario nunca los edita aquí — los escribe `RecordBlocks` al crear/reordenar. */
		structuralFields: readonly string[];
		onSubmit: (input: RecordInput) => Promise<VegaRecord>;
		onSaved: (record: VegaRecord) => void;
		onDirtyChange: (dirty: boolean) => void;
		/** Bloqueo externo durante una mutación estructural de la lista. */
		disabled?: boolean;
		/** Permite a la lista impedir la operación inversa mientras este bloque se guarda. */
		onBusyChange?: (busy: boolean) => void;
	}

	let {
		childType,
		record,
		structuralFields,
		onSubmit,
		onSaved,
		onDirtyChange,
		disabled = false,
		onBusyChange = () => {}
	}: Props = $props();

	const ctx = getVegaContext();
	const EMPTY_ERRORS: FieldErrorsView = { byField: {}, record: null };

	// Baseline capturado UNA VEZ al montar, con `untrack` (mismo patrón que la "Semilla inicial" de
	// `RecordForm.svelte`: un `$state` poblado a partir de props reactivas solo debe capturar su
	// valor INICIAL). A propósito SIN `$effect` de resincronía: `RecordBlocks` puede recargar su
	// lista de registros por debajo (tras crear/borrar/reordenar OTRO bloque) sin que este
	// componente pierda las ediciones en curso del usuario — el bloque abierto es dueño de su
	// propio borrador hasta que se guarda.
	let baseline = untrack(() => buildFormModel(childType, record).baseline);
	let current = $state<FormInputValues>({ ...baseline });
	let clientErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let backendErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let saving = $state(false);

	// Identidad de registro para el widget `file` (F5-f, `record-context.ts`): CADA bloque publica
	// la SUYA — sin esto, un campo `file` de un bloque leería la identidad del registro PADRE
	// (el contexto más cercano gana, pero el padre lo publica más arriba en el árbol) y pediría
	// `fileUrl` contra el registro equivocado. Captura inicial también (mismo motivo que arriba).
	untrack(() => setRecordIdentity({ type: childType.name, id: record.id }));

	const errors = $derived<FieldErrorsView>({
		byField: { ...clientErrors.byField, ...backendErrors.byField },
		record: backendErrors.record ?? clientErrors.record
	});
	const dirty = $derived(isDirty(baseline, current));
	const inert = $derived(disabled || saving);

	/** Campos visibles del mini-formulario: todo lo del tipo hijo MENOS `parentField`/`orderField`
	 *  (estructurales, ver cabecera) y lo que el propio schema/manifiesto ya marca `hidden`. */
	const visibleFields = $derived(
		childType.fields.filter((f) => !f.hidden && !structuralFields.includes(f.name))
	);

	$effect(() => {
		onDirtyChange(dirty);
	});

	$effect(() => {
		onBusyChange(saving);
	});

	function handleFieldChange(name: string, value: FieldInputValue): void {
		current = { ...current, [name]: value };
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

	async function handleSave(): Promise<void> {
		if (saving || disabled) return;

		const clientView = validateForm(childType, current);
		clientErrors = clientView;
		if (Object.keys(clientView.byField).length > 0 || clientView.record) return;

		backendErrors = EMPTY_ERRORS;
		saving = true;
		try {
			const input = toRecordInput(childType, baseline, current);
			const saved = await onSubmit(input);
			// Igual que `RecordForm` (L-P5.6): reasentar baseline ANTES de avisar al padre, así el
			// bloque deja de estar "sucio" en el mismo tick en que se confirma el guardado.
			baseline = buildFormModel(childType, saved).baseline;
			current = { ...baseline };
			clientErrors = EMPTY_ERRORS;
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
	{#if errors.record}
		<p class="vega-block-banner" role="alert">{fieldErrorMessage(ctx.t, errors.record)}</p>
	{/if}
	{#each visibleFields as field (field.name)}
		<FieldRow
			{field}
			value={current[field.name]}
			error={errors.byField[field.name] ?? null}
			disabled={inert}
			typeReadonly={false}
			stacked
			onChange={(value) => handleFieldChange(field.name, value)}
		/>
	{/each}
	<div class="vega-block-actions">
		<button
			type="button"
			class="vega-block-save-button"
			disabled={inert || !dirty}
			onclick={handleSave}
		>
			{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
		</button>
	</div>
</div>

<style>
	.vega-block-fields {
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
		min-width: 0;
	}

	.vega-block-banner {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--danger);
		border-radius: 6px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-block-actions {
		display: flex;
		justify-content: flex-end;
	}

	/* Mismo botón secundario/inline que el resto del editor (`.vega-editor-inline-button` de
	   `RecordForm.svelte`), namespaced aquí a propósito: este componente no importa CSS ajeno
	   (cada marco define su propio botón, convención ya establecida en el repo). */
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

	.vega-block-save-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
