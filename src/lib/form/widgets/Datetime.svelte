<script lang="ts">
	/**
	 * Widget `datetime` (F5-b, `type:'date'`, Audit Finding 2 / D-P5.13 del contrato P5): un
	 * `<input type="datetime-local">` controlado. TODA la conversión UTC↔hora de pared vive en el
	 * módulo puro `datetime.ts` (con su propio test de round-trip) — este componente es un shell
	 * fino que solo pinta y reenvía.
	 *
	 * Value de dominio: `string` ISO 8601 UTC (con segundos) | `null`. El control ve/produce hora
	 * LOCAL sin zona; `isoUtcToLocalInput`/`localInputToIsoUtc` hacen la traducción en cada
	 * dirección. Vaciar el input emite `onChange(null)` (mismo criterio que el resto de widgets
	 * escalares con default `null`).
	 */
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { isoUtcToLocalInput, localInputToIsoUtc } from './datetime';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);
	const localValue = $derived(typeof value === 'string' ? isoUtcToLocalInput(value) : '');

	function handleInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		onChange(localInputToIsoUtc(raw));
	}
</script>

<input
	id={ids.inputId}
	type="datetime-local"
	class="vega-widget-datetime"
	value={localValue}
	disabled={inert}
	oninput={handleInput}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
/>

<style>
	.vega-widget-datetime {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
	}

	.vega-widget-datetime:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-datetime[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}
</style>
