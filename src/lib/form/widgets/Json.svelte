<script lang="ts">
	/**
	 * Widget `json` (F5-b, `type:'json'`): un `<textarea>` que edita un `JsonValue` como texto.
	 * Serialización/parseo son un módulo puro (`json-field.ts`, con test propio); este componente
	 * pinta y decide cuándo propagar.
	 *
	 * **El texto es del usuario mientras escribe.** El widget tiene su propio estado de texto
	 * (`text`): no se repinta desde `value` en cada pulsación, así que el cursor no se mueve y un
	 * JSON a medio escribir no se pisa. Solo se vuelve a derivar de `value` cuando éste cambia por
	 * fuera (recarga, conflicto, restaurar), detectado por su serialización (`lastSerialized`).
	 *
	 * - JSON válido → `onChange(valor)`; el texto NO se reformatea mientras se escribe, sólo al
	 *   perder el foco (`handleBlur`).
	 * - JSON inválido → NO se llama a `onChange`, se muestra un error propio (`form.json.invalid`)
	 *   y se marca el `<textarea>` con `setCustomValidity`: la validación nativa del `<form>` de
	 *   `RecordForm` bloquea el envío (incluido ⌘S, que va por `requestSubmit()`), el MISMO
	 *   mecanismo que `Markdown.svelte` para su URI insegura. Al perder el foco no se toca.
	 * - Texto en blanco = campo vacío: se pinta vacío (no `null`) y propaga `null`, lo que ya
	 *   enviaba antes (`parseJsonInput`).
	 */
	import { untrack } from 'svelte';
	import type { JsonValue } from '$lib/backend/types';
	import type { WidgetProps } from './types';
	import { getVegaContext } from '$lib/app-context';
	import { fieldIds } from '../field-ids';
	import { getFieldScope } from '../field-scope';
	import { parseJsonInput, stringifyJsonValue } from './json-field';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const fieldScope = getFieldScope();
	const ids = $derived(fieldIds(field.name, fieldScope));
	const inert = $derived(disabled || readonly);

	/** Valor de dominio → texto del control: `null` (sin valor) se pinta VACÍO, no `null`. */
	function display(v: FieldInputValueLike): string {
		return v === null || v === undefined ? '' : stringifyJsonValue(v as JsonValue);
	}
	type FieldInputValueLike = WidgetProps['value'] | undefined;

	// Solo el valor INICIAL: después manda el efecto de abajo (cambios externos) o el usuario.
	let text = $state(untrack(() => display(value)));
	let invalid = $state(false);
	let lastSerialized = untrack(() => JSON.stringify(value ?? null));
	let textarea = $state<HTMLTextAreaElement | undefined>();

	const describedBy = $derived(
		[
			field.help ? ids.helpId : null,
			error ? ids.errorId : null,
			invalid ? `${ids.inputId}-json-error` : null
		]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);

	// Cambio externo de `value` (no el que acabamos de emitir): se vuelve a derivar el texto.
	$effect(() => {
		const serialized = JSON.stringify(value ?? null);
		if (serialized === lastSerialized) return;
		lastSerialized = serialized;
		text = display(value);
		invalid = false;
	});

	// Validación nativa: bloquea el envío del `<form>` mientras el texto no sea JSON.
	$effect(() => {
		textarea?.setCustomValidity(invalid ? ctx.t('form.json.invalid') : '');
	});

	function handleInput(event: Event): void {
		const raw = (event.currentTarget as HTMLTextAreaElement).value;
		text = raw;
		const result = parseJsonInput(raw);
		invalid = !result.ok;
		// Síncrono además del efecto: el envío puede llegar antes de que corra.
		(event.currentTarget as HTMLTextAreaElement).setCustomValidity(
			result.ok ? '' : ctx.t('form.json.invalid')
		);
		if (!result.ok) return;
		lastSerialized = JSON.stringify(result.value);
		onChange(result.value);
	}

	function handleBlur(): void {
		if (invalid) return;
		const result = parseJsonInput(text);
		if (result.ok) text = display(result.value);
	}
</script>

<textarea
	bind:this={textarea}
	id={ids.inputId}
	class="vega-widget-json"
	rows="6"
	value={text}
	placeholder={field.placeholder ?? undefined}
	disabled={inert}
	oninput={handleInput}
	onblur={handleBlur}
	spellcheck="false"
	aria-invalid={error || invalid ? 'true' : undefined}
	aria-describedby={describedBy}></textarea>
{#if invalid}
	<p id="{ids.inputId}-json-error" class="vega-widget-json-error" role="alert">
		{ctx.t('form.json.invalid')}
	</p>
{/if}

<style>
	.vega-widget-json {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		/* --mono (vocabulario §3, forma/tipo): un JSON crudo es un valor canónico, mismo criterio
		   tipográfico que ids/slugs/fechas ISO — antes hardcodeaba su propia pila de fuentes en vez
		   de reutilizar el token. */
		font-family: var(--mono);
		font-size: 0.85rem;
		resize: vertical;
	}

	.vega-widget-json:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-json[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-widget-json-error {
		margin: 0.3rem 0 0;
		font-size: 0.8rem;
		color: var(--danger);
	}
</style>
