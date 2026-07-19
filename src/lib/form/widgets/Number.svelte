<script lang="ts">
	/**
	 * Widget `number` (F5-b, `type:'number'`): `<input type="number">` controlado, con `step`
	 * derivado de `integer` y `min`/`max` del schema como afordancia nativa.
	 *
	 * **Ley crítica (bug ya cazado en F5-a sobre `GenericInput.svelte`, ver su cabecera)**: un
	 * campo `number` arranca en `null` (default de creación, `normalizeFieldValue` §2.1); al
	 * teclear DEBE emitirse un `number` real (o `null` si el input queda vacío), JAMÁS un string —
	 * el adaptador `memory` (`normalizeFieldValue`, que exige `typeof raw === 'number'`) degrada
	 * cualquier otra cosa a `null` AL ESCRIBIR, perdiendo el valor tecleado en silencio.
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
	const schema = $derived(field.schema.type === 'number' ? field.schema : null);

	function handleInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		if (raw === '') {
			onChange(null);
			return;
		}
		const n = Number(raw);
		// Un estado intermedio no parseable ("-", "1.") no propaga: se mantiene el último valor
		// válido (L11, degradar sin crashear) hasta que el usuario termine de teclear.
		if (!Number.isNaN(n)) onChange(n);
	}
</script>

<input
	id={ids.inputId}
	type="number"
	class="vega-widget-number"
	value={typeof value === 'number' ? value : ''}
	placeholder={field.placeholder ?? undefined}
	step={schema?.integer ? '1' : 'any'}
	min={schema?.min}
	max={schema?.max}
	disabled={inert}
	oninput={handleInput}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
/>

<style>
	.vega-widget-number {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-widget-number:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-number[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
