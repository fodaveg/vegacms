<script lang="ts">
	/**
	 * Widget `textarea` (F5-b, `type:'text'` con `widget: 'textarea'` — el ÚNICO override de
	 * schema v1, §4.3 del contrato P2/L9): un `<textarea>` multilínea controlado, mismo patrón de
	 * a11y/estados que `Text.svelte`/`GenericInput.svelte`. Comparte `field.schema` con el widget
	 * `text` (misma forma `type:'text', subtype:'plain'`): solo cambia el control HTML, no la
	 * validación (`maxlength`/`minlength` aplican igual, aunque un `<textarea>` no restringe
	 * visualmente tan bien como un `<input>` — la validación real sigue siendo F5-c/backend).
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
	const schema = $derived(field.schema.type === 'text' ? field.schema : null);

	function handleInput(event: Event): void {
		onChange((event.currentTarget as HTMLTextAreaElement).value);
	}
</script>

<textarea
	id={ids.inputId}
	class="vega-widget-textarea"
	rows="4"
	value={typeof value === 'string' ? value : ''}
	placeholder={field.placeholder ?? undefined}
	maxlength={schema?.maxLength}
	minlength={schema?.minLength}
	disabled={inert}
	oninput={handleInput}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}></textarea>

<style>
	.vega-widget-textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
		resize: vertical;
	}

	.vega-widget-textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-textarea[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}
</style>
