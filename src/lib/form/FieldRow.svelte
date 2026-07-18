<script lang="ts">
	/**
	 * `FieldRow.svelte` (Fase F5-a): label + help + el widget del registry + el error del campo,
	 * con `aria-invalid`/`aria-describedby` apuntando al MISMO id que pinta el widget
	 * (`field-ids.ts`, compartido — ninguno de los dos lo recibe como prop extra, D-P5.1 fija la
	 * interfaz de widget sin más que `{field,value,error,disabled,readonly,onChange}`).
	 *
	 * `readonly` (L-P5.2) combina `field.schema.readonly` (autodate del backend) con
	 * `typeReadonly` (prop: `contentType.readonly`, una vista) — cualquiera de las dos basta.
	 * `placeholder` no es prop propia de esta capa: cada widget lee `field.placeholder`
	 * directamente (ya viaja dentro de `field`).
	 */
	import type { ResolvedField } from '$lib/model/types';
	import type { FieldInputValue } from '$lib/backend/types';
	import type { TranslatedError } from './field-errors';
	import { fieldIds } from './field-ids';
	import { fieldErrorMessage } from './field-error-message';
	import { WIDGET_REGISTRY } from './widgets/registry';
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		field: ResolvedField;
		value: FieldInputValue;
		error: TranslatedError | null;
		disabled: boolean;
		/** `contentType.readonly` (view, L-P5.2): se combina con `field.schema.readonly` aquí. */
		typeReadonly: boolean;
		onChange: (value: FieldInputValue) => void;
	}

	let { field, value, error, disabled, typeReadonly, onChange }: Props = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const readonly = $derived(field.schema.readonly || typeReadonly);
	const Widget = $derived(WIDGET_REGISTRY[field.widget]);
</script>

<div class="vega-field-row" data-field={field.name} data-widget={field.widget}>
	<label for={ids.inputId}>
		{field.label}{#if field.schema.required}<span class="vega-field-required" aria-hidden="true"
				>*</span
			>{/if}
	</label>
	{#if field.help}
		<p id={ids.helpId} class="vega-field-help">{field.help}</p>
	{/if}
	<Widget {field} {value} {error} {disabled} {readonly} {onChange} />
	{#if error}
		<p id={ids.errorId} class="vega-field-error" role="alert">{fieldErrorMessage(ctx.t, error)}</p>
	{/if}
</div>

<style>
	.vega-field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.vega-field-row label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.vega-field-required {
		margin-left: 0.15rem;
		color: var(--vega-color-danger);
	}

	.vega-field-help {
		margin: 0;
		font-size: 0.8rem;
		color: var(--vega-color-text-muted);
	}

	.vega-field-error {
		margin: 0;
		font-size: 0.8rem;
		color: var(--vega-color-danger);
	}
</style>
