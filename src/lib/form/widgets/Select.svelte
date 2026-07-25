<script lang="ts">
	/**
	 * Widget `select` (F5-b, `type:'select'` con `multiple:false`): `<select>` nativo con una
	 * opción vacía (`form.select.empty`, i18n) seguida de `field.schema.options` — vocabulario
	 * CERRADO (§2.2 del contrato de backend), no admite valores libres. Value `string | null`.
	 *
	 * **Etiquetas legibles (`optionLabels`, P2 `statusLabels`)**: el `value` de cada `<option>` es
	 * SIEMPRE el valor crudo (es lo que se guarda y lo que el backend entiende); lo único que
	 * cambia es el TEXTO visible, con el mismo patrón `optionLabels?.[option] ?? option` que ya
	 * usan la insignia de `RecordTable`, los chips de filtro, el raíl del editor y la píldora de
	 * estado de la barra. Sin la prop (o sin entrada para ese valor) se pinta el valor crudo, igual
	 * que siempre — así una colección que no declara `statusLabels` no cambia nada, y la pantalla
	 * deja de contradecirse (la píldora decía «Publicado» mientras el select decía `published`).
	 */
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getVegaContext } from '$lib/app-context';

	let { field, value, error, disabled, readonly, optionLabels, onChange }: WidgetProps = $props();

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
		<option value={option}>{optionLabels?.[option] ?? option}</option>
	{/each}
</select>

<style>
	.vega-widget-select {
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
	.vega-widget-select:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-widget-select:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	.vega-widget-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-select[aria-invalid='true'] {
		border-color: var(--danger);
	}
</style>
