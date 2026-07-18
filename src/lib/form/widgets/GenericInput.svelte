<script lang="ts">
	/**
	 * `GenericInput.svelte` — placeholder FUNCIONAL MÍNIMO de F5-a (§5 plan del contrato P5,
	 * "F5-a Armazón") para los 14 widgets dedicados del registry (`text, textarea, markdown,
	 * richtext, number, switch, email, url, datetime, select, chips, relation, file, json`). NO
	 * conoce la configuración rica de cada uno (opciones de `select`, `target` de `relation`,
	 * subida de `file`, editor TipTap de `richtext`/`markdown`…) — eso llega en F5-b/d/e/f, widget
	 * a widget, sin tocar el resto del registry (`registry.ts` sustituye una entrada cada vez).
	 *
	 * Garantiza dos cosas mientras tanto: (a) editar cualquier valor ESCALAR (texto/número/
	 * booleano) sin romper ningún tipo de la tabla de normalización (§2.1 del contrato de
	 * backend) — suficiente para el e2e de crear/editar un tipo trivial (`posts`); (b) los seis
	 * estados de L-P5.2 (vacío·valor·error·disabled·readonly·loading, este último vía `disabled`
	 * durante el guardado) sin reventar sobre un array/objeto (select múltiple, relation, json…)
	 * si `RecordForm` monta este placeholder sobre CUALQUIER tipo de la demo.
	 *
	 * El control HTML se elige por la FORMA del valor normalizado (`typeof value`), no por
	 * `field.widget`: un mapeo widget→control es justo lo que F5-b sustituye, así que no vale la
	 * pena construirlo aquí para tirarlo después. ÚNICA excepción (fix de code-review, ver
	 * `kind` más abajo): un `number` en `null` (su default de creación) SÍ consulta el schema,
	 * porque por forma es indistinguible de cualquier otro campo vacío y el error resultante
	 * (editar como texto, perder el tipo) es un bug de dominio real, no cosmético.
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
	/** Inerte = no acepta interacción NI dispara `onChange` (L-P5.2: "un widget readonly nunca
	 *  emite cambios"). Un `<input disabled>` no dispara eventos, así que basta con esto — sin
	 *  necesidad de condicionar cada manejador por separado. */
	const inert = $derived(disabled || readonly);

	type Kind = 'checkbox' | 'number' | 'multiline' | 'text';
	const kind = $derived.by((): Kind => {
		if (typeof value === 'boolean') return 'checkbox';
		if (typeof value === 'number') return 'number';
		// FIX (code-review): un campo `number` arranca en `null` (default de creación,
		// `normalizeFieldValue` §2.1 del backend) — por FORMA (`typeof null !== 'number'`) esto
		// caía a 'text', y desde la primera tecla `handleText` emitía un STRING. El widget nunca
		// volvía a la rama 'number' (una vez `value` es string, sigue siéndolo) y el `RecordInput`
		// viajaba con `count: "123"` en vez de `123`: viola el dominio (`FieldValue` de `number` =
		// `number | null`), y en el adaptador `memory` `normalizeFieldValue` (que exige
		// `typeof raw === 'number'`) lo degrada a `null` AL ESCRIBIR — el valor tecleado se
		// PERDÍA en silencio. Única excepción explícita a "elegir por forma" (ver cabecera):
		// consulta el schema SOLO para no perder el tipo de un campo `number` vacío.
		if (value === null && field.schema.type === 'number') return 'number';
		if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return 'multiline';
		// Nota: un campo `date` (widget `datetime`) también arranca en `null` y cae aquí a 'text'
		// a propósito — a diferencia de `number`, el string que produce SIGUE siendo del tipo de
		// dominio correcto (`FieldValue` de `date` = `string ISO | null`), así que no hay
		// violación de contrato, solo un formato libre hasta que F5-g monte el `<input
		// type="datetime-local">` real con la conversión UTC↔local (Audit Finding 2).
		return 'text';
	});

	/** Representación editable de un array/objeto (best-effort): un array de strings (select/
	 *  chips/relation múltiples) se edita línea a línea; cualquier otra cosa (`json`, o un array
	 *  con un `File` colado que este placeholder no sabe editar) se muestra como JSON
	 *  pretty-printed de solo lectura visual — sigue sin reventar, aunque no sea editable aquí. */
	function toMultilineText(v: unknown): string {
		if (Array.isArray(v) && v.every((item) => typeof item === 'string')) return v.join('\n');
		return JSON.stringify(v, null, 2);
	}

	function handleText(event: Event): void {
		onChange((event.currentTarget as HTMLInputElement).value);
	}

	function handleNumber(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		if (raw === '') {
			onChange(null);
			return;
		}
		const n = Number(raw);
		if (!Number.isNaN(n)) onChange(n);
	}

	function handleCheckbox(event: Event): void {
		onChange((event.currentTarget as HTMLInputElement).checked);
	}

	function handleMultiline(event: Event): void {
		const raw = (event.currentTarget as HTMLTextAreaElement).value;
		if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
			onChange(
				raw
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line !== '')
			);
			return;
		}
		try {
			onChange(JSON.parse(raw));
		} catch {
			// JSON a medio escribir: no propaga (L11, degradar sin crashear) — el usuario sigue
			// tecleando, el último `onChange` válido se mantiene.
		}
	}
</script>

<div class="vega-widget-generic" data-widget={field.widget}>
	{#if kind === 'checkbox'}
		<input
			id={ids.inputId}
			type="checkbox"
			checked={value === true}
			disabled={inert}
			onchange={handleCheckbox}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
		/>
	{:else if kind === 'number'}
		<input
			id={ids.inputId}
			type="number"
			value={value ?? ''}
			placeholder={field.placeholder ?? undefined}
			disabled={inert}
			oninput={handleNumber}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
		/>
	{:else if kind === 'multiline'}
		<textarea
			id={ids.inputId}
			rows="4"
			value={toMultilineText(value)}
			placeholder={field.placeholder ?? undefined}
			disabled={inert}
			oninput={handleMultiline}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}></textarea>
	{:else}
		<input
			id={ids.inputId}
			type="text"
			value={typeof value === 'string' ? value : ''}
			placeholder={field.placeholder ?? undefined}
			disabled={inert}
			oninput={handleText}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
		/>
	{/if}
</div>

<style>
	.vega-widget-generic input,
	.vega-widget-generic textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font: inherit;
	}

	.vega-widget-generic input[type='checkbox'] {
		width: auto;
	}

	.vega-widget-generic input:disabled,
	.vega-widget-generic textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-widget-generic input[aria-invalid='true'],
	.vega-widget-generic textarea[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}
</style>
