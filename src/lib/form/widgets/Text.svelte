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
	 *
	 * **Campo título (`isTitleField`, lote 12 lámina 4)**: en vez del `<input>` se pinta un
	 * `GrowingTextarea` de una línea lógica, para que un título largo se lea entero. Conserva la
	 * clase, el `id`, el nombre accesible (la `<label for>` de `FieldRow`), `aria-*`, los límites y
	 * el valor que se guarda. Intro envía el formulario, como hacía en el `<input>` (un textarea
	 * insertaría un salto); un texto pegado con saltos los guarda como espacios. Por eso los
	 * estilos de abajo son `:global`: la caja la pinta otro componente con esta misma clase.
	 */
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getFieldScope } from '../field-scope';
	import GrowingTextarea from '../GrowingTextarea.svelte';

	let {
		field,
		value,
		error,
		disabled,
		readonly,
		isTitleField = false,
		onChange
	}: WidgetProps = $props();

	const fieldScope = getFieldScope();
	const ids = $derived(fieldIds(field.name, fieldScope));
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

	/** Intro en el título: lo que haría en el `<input>` de antes, enviar el formulario. */
	function submitForm(event: KeyboardEvent): void {
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}
</script>

{#if isTitleField}
	<GrowingTextarea
		id={ids.inputId}
		class="vega-widget-text"
		singleLine
		value={typeof value === 'string' ? value : ''}
		placeholder={field.placeholder ?? undefined}
		maxlength={schema?.maxLength}
		minlength={schema?.minLength}
		disabled={inert}
		{onChange}
		onEnter={submitForm}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
	/>
{:else}
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
{/if}

<style>
	:global(.vega-widget-text) {
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
	:global(.vega-widget-text:hover:not(:disabled)) {
		border-color: var(--line-strong);
	}

	:global(.vega-widget-text:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	:global(.vega-widget-text:disabled) {
		opacity: 0.6;
		cursor: not-allowed;
	}

	:global(.vega-widget-text[aria-invalid='true']) {
		border-color: var(--danger);
	}
</style>
