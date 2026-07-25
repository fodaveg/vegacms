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
		/* Caja de control del mockup final `aquelarre-detalle-post.html` (`.field input`), idéntica
		   en los siete widgets escalares: padding derivado de la densidad (`--pad-field`), radio
		   `--r` y superficie `--surface` (los CONTROLES; la tarjeta que los contiene es
		   `--paper`). Hover y foco viven abajo. */
		padding: calc(var(--pad-field) * 0.55) calc(var(--pad-field) * 0.7);
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		resize: vertical;
	}

	/* Hover/foco del mockup: el borde se marca al pasar por encima y el anillo `--ring` sube
	   al control (nunca `outline: none` sin sustituto). */
	.vega-widget-textarea:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-widget-textarea:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	.vega-widget-textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-textarea[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
