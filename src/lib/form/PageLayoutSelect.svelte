<script lang="ts">
	/**
	 * `PageLayoutSelect.svelte` (modelo de páginas, tarea p1 `1dc63001`; encargo "crear y editar
	 * páginas" §3): el `<select>` de plantilla que `FieldRow.svelte` pinta en vez del `Widget` del
	 * registry cuando el campo es `type.page.layoutField`. NO vive en `widgets/registry.ts` a
	 * propósito: `layoutField` es un `text` cualquiera para P1/P2 (su `widget` resuelto es
	 * `'text'`), pero su vocabulario de valores válidos es CERRADO — `ContentModel.layouts`, una
	 * lista de RAÍZ que ningún widget de `WidgetProps` conoce (esa interfaz es fija por D-P5.1, y
	 * ampliarla para un caso tan concreto rompería el contrato de los otros catorce). Mismo motivo
	 * por el que `optionLabels` NO basta aquí: esa prop solo RELABELA opciones que YA declara
	 * `field.schema` (un `select` real); `layoutField` no tiene opciones propias en el esquema, las
	 * opciones las pone `layouts` desde fuera.
	 *
	 * Estructura y CSS calcados de `widgets/Select.svelte` (mismo criterio "Caja de control del
	 * mockup final" que TODOS los widgets escalares, ver la nota de esa cabecera sobre por qué se
	 * duplica el bloque en vez de compartirlo) — la única diferencia real es de dónde salen las
	 * opciones: aquí de `layouts` (RAÍZ del modelo), no de `field.schema.options`.
	 *
	 * Value SIEMPRE `string` (nunca `null`): `layoutField` es un campo `text`, así que su vacío
	 * canónico es `''` (§2.1 del contrato de backend), no `null` como un `select` de PocketBase —
	 * a diferencia de `Select.svelte`, `onChange('')` en vez de `onChange(null)` cuando se elige
	 * la opción vacía.
	 */
	import type { ResolvedField, ResolvedLayout } from '$lib/model/types';
	import type { FieldInputValue } from '$lib/backend/types';
	import type { TranslatedError } from './field-errors';
	import { fieldIds } from './field-ids';
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		field: ResolvedField;
		value: FieldInputValue;
		error: TranslatedError | null;
		disabled: boolean;
		readonly: boolean;
		/** `ContentModel.layouts` (P2, RAÍZ): en ORDEN de declaración del manifiesto, tal cual —
		 *  este componente no reordena ni filtra. Puede llegar `[]` (colección con `layoutField`
		 *  pero manifiesto sin `layouts`, ver `resolvePage`): el `<select>` se pinta igual, con solo
		 *  la opción vacía, nunca degrada a texto libre. */
		layouts: ResolvedLayout[];
		onChange: (value: FieldInputValue) => void;
	}

	let { field, value, error, disabled, readonly, layouts, onChange }: Props = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);

	function handleChange(event: Event): void {
		onChange((event.currentTarget as HTMLSelectElement).value);
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
	{#each layouts as layout (layout.name)}
		<option value={layout.name}>{layout.label}</option>
	{/each}
</select>

<style>
	.vega-widget-select {
		width: 100%;
		box-sizing: border-box;
		/* Caja de control del mockup final `aquelarre-detalle-post.html` (`.field input`), idéntica
		   en los siete widgets escalares (ver la cabecera de `widgets/Select.svelte`): padding
		   derivado de la densidad (`--pad-field`), radio `--r` y superficie `--surface`. */
		padding: calc(var(--pad-field) * 0.55) calc(var(--pad-field) * 0.7);
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

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
