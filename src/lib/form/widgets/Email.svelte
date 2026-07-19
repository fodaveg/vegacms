<script lang="ts">
	/**
	 * Widget `email` (F5-b, `type:'email'`): `<input type="email">` controlado. Sin límites de
	 * schema que traducir a atributos nativos (`onlyDomains`/`exceptDomains` son reglas de
	 * backend, no afordancias de teclado/formato del navegador); el propio `type="email"` ya da
	 * la validación de formato básica del navegador como pista visual, sin sustituir a F5-c.
	 * Value `string | null` (§2.1) — en la práctica `normalizeFieldValue` nunca produce `null`
	 * para `email` (default `''`), pero se pinta con `?? ''` por si acaso.
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
	type="email"
	class="vega-widget-email"
	value={typeof value === 'string' ? value : ''}
	placeholder={field.placeholder ?? undefined}
	disabled={inert}
	oninput={handleInput}
	aria-invalid={error ? 'true' : undefined}
	aria-describedby={describedBy}
/>

<style>
	.vega-widget-email {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-widget-email:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-email[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
