<script lang="ts">
	/**
	 * Widget `switch` (F5-b, `type:'bool'`): un `<input type="checkbox">` accesible, estilado como
	 * toggle vía CSS (`appearance: none` + pista/pulgar dibujados con el propio input, sin marcado
	 * extra que rompiese la asociación `<label for>` de `FieldRow`). Value `boolean` (§2.1: un
	 * `bool` nunca es `null`, normaliza a `false` por defecto).
	 */
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);

	function handleChange(event: Event): void {
		onChange((event.currentTarget as HTMLInputElement).checked);
	}
</script>

<input
	id={ids.inputId}
	type="checkbox"
	role="switch"
	class="vega-widget-switch"
	checked={value === true}
	disabled={inert}
	onchange={handleChange}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
/>

<style>
	.vega-widget-switch {
		appearance: none;
		position: relative;
		width: 2.4rem;
		height: 1.4rem;
		margin: 0;
		border: 1px solid var(--vega-color-border);
		border-radius: 999px;
		background: var(--vega-color-bg-raised);
		cursor: pointer;
		flex-shrink: 0;
	}

	.vega-widget-switch::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		background: var(--vega-color-text-muted);
		transition:
			transform 0.15s ease,
			background 0.15s ease;
	}

	.vega-widget-switch:checked {
		background: var(--vega-color-accent);
		border-color: var(--vega-color-accent);
	}

	.vega-widget-switch:checked::after {
		transform: translateX(1rem);
		background: var(--vega-color-accent-contrast);
	}

	.vega-widget-switch:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-switch[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}
</style>
