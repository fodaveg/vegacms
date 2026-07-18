<script lang="ts">
	/**
	 * Widget `url` (F5-b, `type:'url'`): `<input type="url">` controlado. Mismo razonamiento que
	 * `Email.svelte` (ver su cabecera) — `onlyDomains`/`exceptDomains` son reglas de backend, no
	 * afordancias de este control. Value `string | null` (§2.1).
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

	function handleInput(event: Event): void {
		onChange((event.currentTarget as HTMLInputElement).value);
	}
</script>

<input
	id={ids.inputId}
	type="url"
	class="vega-widget-url"
	value={typeof value === 'string' ? value : ''}
	placeholder={field.placeholder ?? undefined}
	disabled={inert}
	oninput={handleInput}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
/>

<style>
	.vega-widget-url {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
	}

	.vega-widget-url:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-url[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}
</style>
