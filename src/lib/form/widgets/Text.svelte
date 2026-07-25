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
	}

	/* Hover/foco del mockup: el borde se marca al pasar por encima y el anillo `--ring` sube
	   al control (nunca `outline: none` sin sustituto). */
	.vega-widget-text:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-widget-text:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	.vega-widget-text:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-text[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
