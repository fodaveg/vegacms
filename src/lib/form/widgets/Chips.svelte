<script lang="ts">
	/**
	 * Widget `chips` (F5-b, `type:'select'` con `multiple:true`): las `field.schema.options` como
	 * chips-toggle — opciones CERRADAS (§2.2 del contrato de backend), sin entrada libre. El toggle
	 * en sí es un módulo puro (`select-value.ts`, `toggleValue` — ver ahí la decisión de orden).
	 *
	 * Un grupo de botones no es un único control "labelable" por HTML (a diferencia de un
	 * `<input>`/`<select>`): pone `id={ids.inputId}` en el CONTENEDOR (`role="group"`) en vez de en
	 * un control interactivo. Como el `<label for>` de `FieldRow` NO asocia con un `role="group"`,
	 * el grupo toma su nombre accesible con `aria-labelledby={ids.labelId}` (apunta a esa misma
	 * etiqueta); el nombre de cada chip es además su propio texto de opción.
	 *
	 * `maxSelect` (afordancia UX, la validación dura es F5-c/backend): al alcanzarlo, las chips NO
	 * seleccionadas se deshabilitan — comunica el límite sin necesidad de un mensaje aparte.
	 *
	 * `aria-invalid` NO es un atributo soportado por `role="group"` (ARIA 1.2, warning real de
	 * `svelte-check`): el estado de error se comunica igual vía `aria-describedby` (apunta al
	 * párrafo de error que pinta `FieldRow`) y visualmente vía `data-invalid` (hook de CSS, sin
	 * semántica ARIA).
	 */
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { toggleValue } from './select-value';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);
	const schema = $derived(field.schema.type === 'select' ? field.schema : null);
	const selected = $derived(Array.isArray(value) ? (value as string[]) : []);
	const limitReached = $derived(
		schema?.maxSelect !== undefined && selected.length >= schema.maxSelect
	);

	function toggle(option: string): void {
		if (inert) return;
		onChange(toggleValue(selected, option));
	}
</script>

<div
	id={ids.inputId}
	class="vega-widget-chips"
	role="group"
	aria-labelledby={ids.labelId}
	data-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
>
	{#each schema?.options ?? [] as option (option)}
		{@const isSelected = selected.includes(option)}
		<button
			type="button"
			class="vega-chip"
			aria-pressed={isSelected}
			disabled={inert || (!isSelected && limitReached)}
			onclick={() => toggle(option)}
		>
			{option}
		</button>
	{/each}
</div>

<style>
	.vega-widget-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.vega-chip {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 999px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		/* Caso límite: una opción de una sola palabra kilométrica no debe forzar overflow
		   horizontal (el grupo ya envuelve por `flex-wrap`, esto evita que UNA chip se salga). */
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.vega-chip[aria-pressed='true'] {
		border-color: var(--vega-color-accent);
		background: var(--vega-color-accent);
		color: var(--vega-color-accent-contrast);
	}

	.vega-chip:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-chips[data-invalid='true'] .vega-chip {
		border-color: var(--vega-color-danger);
	}
</style>
