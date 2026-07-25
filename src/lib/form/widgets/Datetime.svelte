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
	.vega-widget-datetime:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-widget-datetime:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	.vega-widget-datetime:disabled {
		/* --mono: un `datetime` deshabilitado es SIEMPRE el autodate readonly del backend
		   (`created`/`updated`) — un valor canónico, mismo criterio que ids/slugs. Un `datetime`
		   editable de dominio (fecha de publicación, etc.) sigue en la tipografía normal. */
		font-family: var(--mono);
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-datetime[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
