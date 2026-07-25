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
	.vega-widget-url:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-widget-url:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	.vega-widget-url:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-url[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
