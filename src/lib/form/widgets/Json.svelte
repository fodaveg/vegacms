<script lang="ts">
	/**
	 * Widget `json` (F5-b, `type:'json'`): un `<textarea>` que edita un `JsonValue` como texto,
	 * best-effort. Serialización/parseo son un módulo puro (`json-field.ts`, con test propio); este
	 * componente solo pinta y decide cuándo propagar.
	 *
	 * JSON a medio escribir → `parseJsonInput` devuelve `ok:false` → NO se llama a `onChange` (L11,
	 * "degradar sin crashear"): el último valor válido se mantiene en `value` (el prop no cambia),
	 * y como el `<textarea>` no controlado-de-vuelta por Svelte en ese frame, lo que el usuario
	 * tecleó sigue visible en el DOM — mismo comportamiento ya aceptado en `GenericInput.svelte`
	 * para su rama JSON best-effort (ver su cabecera).
	 */
	import type { JsonValue } from '$lib/backend/types';
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { parseJsonInput, stringifyJsonValue } from './json-field';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);
	const text = $derived(stringifyJsonValue((value ?? null) as JsonValue));

	function handleInput(event: Event): void {
		const raw = (event.currentTarget as HTMLTextAreaElement).value;
		const result = parseJsonInput(raw);
		if (result.ok) onChange(result.value);
	}
</script>

<textarea
	id={ids.inputId}
	class="vega-widget-json"
	rows="6"
	value={text}
	disabled={inert}
	oninput={handleInput}
	spellcheck="false"
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}></textarea>

<style>
	.vega-widget-json {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		resize: vertical;
	}

	.vega-widget-json:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-json[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}
</style>
