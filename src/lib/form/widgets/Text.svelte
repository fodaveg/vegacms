<script lang="ts">
	/**
	 * Widget `text` (F5-b, §2.1 `type:'text', subtype:'plain'`): `<input type="text">` controlado,
	 * réplica del patrón de a11y/estados de `GenericInput.svelte` (ids compartidos vía
	 * `field-ids.ts`, `aria-invalid`/`aria-describedby`, `disabled = disabled || readonly`).
	 *
	 * `maxlength`/`minlength` son solo la AFORDANCIA nativa del navegador (de `field.schema`); la
	 * validación real de esos límites es responsabilidad de F5-c (cliente) y del backend — este
	 * widget no la duplica ni la sustituye. Value `string | null` (§2.1): un `text` vacío normaliza
	 * a `''`, nunca `null`, pero se pinta con `?? ''` por si acaso llega otra cosa.
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
		onChange((event.currentTarget as HTMLInputElement).value);
	}
</script>

<input
	id={ids.inputId}
	type="text"
	class="vega-widget-text"
	value={typeof value === 'string' ? value : ''}
	placeholder={field.placeholder ?? undefined}
	maxlength={schema?.maxLength}
	minlength={schema?.minLength}
	disabled={inert}
	oninput={handleInput}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
/>

<style>
	.vega-widget-text {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-widget-text:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-text[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
