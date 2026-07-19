<script lang="ts">
	/**
	 * Widget `select` (F5-b, `type:'select'` con `multiple:false`): `<select>` nativo con una
	 * opción vacía (`form.select.empty`, i18n) seguida de `field.schema.options` tal cual — vocabulario
	 * CERRADO (§2.2 del contrato de backend), no admite valores libres. Value `string | null`.
	 */
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getVegaContext } from '$lib/app-context';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);
	const schema = $derived(field.schema.type === 'select' ? field.schema : null);

	function handleChange(event: Event): void {
		const raw = (event.currentTarget as HTMLSelectElement).value;
		onChange(raw === '' ? null : raw);
	}
</script>

<select
	id={ids.inputId}
	class="vega-widget-select"
	value={typeof value === 'string' ? value : ''}
	disabled={inert}
	onchange={handleChange}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
>
	<option value="">{ctx.t('form.select.empty')}</option>
	{#each schema?.options ?? [] as option (option)}
		<option value={option}>{option}</option>
	{/each}
</select>

<style>
	.vega-widget-select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-widget-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-select[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
