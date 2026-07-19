<script lang="ts">
	/**
	 * `FieldRow.svelte` (Fase F5-a; R7 del rediseño C2 «Cabina», mockup `.frow`): label + help + el
	 * widget del registry + el error del campo, con `aria-invalid`/`aria-describedby` apuntando al
	 * MISMO id que pinta el widget (`field-ids.ts`, compartido — ninguno de los dos lo recibe como
	 * prop extra, D-P5.1 fija la interfaz de widget sin más que
	 * `{field,value,error,disabled,readonly,onChange}`).
	 *
	 * `readonly` (L-P5.2) combina `field.schema.readonly` (autodate del backend) con
	 * `typeReadonly` (prop: `contentType.readonly`, una vista) — cualquiera de las dos basta.
	 * `placeholder` no es prop propia de esta capa: cada widget lee `field.placeholder`
	 * directamente (ya viaja dentro de `field`).
	 *
	 * **Grid de 2 columnas (R7)**: antes era una columna (label encima, ayuda encima del widget,
	 * error debajo); el mockup pinta `label | control` lado a lado (`184px 1fr`), con la ayuda Y el
	 * error bajo el CONTROL, no bajo el label — de ahí el `<div class="vega-field-control">` que
	 * envuelve widget+ayuda+error como segunda columna del grid (el propio `.vega-field-row` solo
	 * puede tener dos hijos directos de grid: el `<label>` y este envoltorio). `data-field`/
	 * `data-widget` y los DOS ids (`fieldIds`) se mantienen INTACTOS en el mismo elemento raíz: de
	 * ellos dependen `resolveFocusTarget` (`focus-target.ts`, selector `.vega-field-row[data-field=
	 * "…"]`) y varios locators de `e2e/form.spec.ts` — renombrar esta clase o mover el atributo
	 * habría roto ambos silenciosamente.
	 *
	 * **Responsive (`@media max-width:720px`)**: colapsa a 1 columna (mockup §responsive) — el
	 * label pierde el `padding-top` que antes lo alineaba con la primera línea del control, porque
	 * ya no hay nada a su lado con lo que alinearse.
	 *
	 * **`stacked` (§4.9b, rejilla de columnas de `fieldGroups`)**: prop opcional, `false` por
	 * defecto — el layout de siempre, sin cambios. `RecordForm.svelte` la pasa `true` para cada
	 * `FieldRow` de un grupo con `columns > 1` (p. ej. `titleEs`|`titleEn` lado a lado): con menos
	 * ancho por campo (la mitad o un tercio del ancho del formulario), el grid `label | control` de
	 * 184px fijo no cabe bien — de ahí que el label pase a ir SIEMPRE encima del control, sin
	 * esperar al `@media` de más abajo (que solo mira el ancho de LA PROPIA fila, no el nº de
	 * columnas de su grupo). También cede su propio padding/borde de fila (que solo tiene sentido
	 * apilando filas verticalmente en una ficha) al `gap` de la rejilla `.vega-fgroup-grid` de
	 * `RecordForm.svelte`, que ya separa tanto filas como columnas con el mismo criterio.
	 */
	import type { ResolvedField } from '$lib/model/types';
	import type { FieldInputValue } from '$lib/backend/types';
	import type { TranslatedError } from './field-errors';
	import { fieldIds } from './field-ids';
	import { fieldErrorMessage } from './field-error-message';
	import { WIDGET_REGISTRY } from './widgets/registry';
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		field: ResolvedField;
		value: FieldInputValue;
		error: TranslatedError | null;
		disabled: boolean;
		/** `contentType.readonly` (view, L-P5.2): se combina con `field.schema.readonly` aquí. */
		typeReadonly: boolean;
		/** `true` dentro de un grupo de columnas (§4.9b, ver cabecera); default `false`. */
		stacked?: boolean;
		onChange: (value: FieldInputValue) => void;
	}

	let { field, value, error, disabled, typeReadonly, stacked = false, onChange }: Props = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const readonly = $derived(field.schema.readonly || typeReadonly);
	const Widget = $derived(WIDGET_REGISTRY[field.widget]);
</script>

<div
	class="vega-field-row"
	class:vega-field-row--stacked={stacked}
	data-field={field.name}
	data-widget={field.widget}
>
	<label id={ids.labelId} for={ids.inputId}>
		{field.label}{#if field.schema.required}<span class="vega-field-required" aria-hidden="true"
				>*</span
			>{/if}
	</label>
	<div class="vega-field-control">
		<Widget {field} {value} {error} {disabled} {readonly} {onChange} />
		{#if field.help}
			<p id={ids.helpId} class="vega-field-help">{field.help}</p>
		{/if}
		{#if error}
			<p id={ids.errorId} class="vega-field-error" role="alert">
				{fieldErrorMessage(ctx.t, error)}
			</p>
		{/if}
	</div>
</div>

<style>
	/* Grid `label | control` del mockup (R7, `.frow`): `align-items: start` para que una fila con
	   un widget alto (richtext, chips con muchas opciones) no estire el label a su misma altura. */
	.vega-field-row {
		display: grid;
		grid-template-columns: 184px 1fr;
		gap: 1.25rem;
		align-items: start;
		padding: 1.1rem 1.25rem;
		border-bottom: 1px solid var(--line-soft);
		/* Casos límite de contenido real (F5-g): permite que la fila se encoja por debajo del
		   ancho de su contenido (default `min-width: auto` de un item de grid) — sin esto, un
		   label/valor kilométrico de una sola palabra desbordaría horizontalmente el formulario. */
		min-width: 0;
	}

	/* Las fichas (`.vega-fsection` de `RecordForm.svelte`) ya ponen el borde/fondo/sombra exterior;
	   la última fila de cada ficha no necesita su propia línea divisoria de cierre. */
	.vega-field-row:last-child {
		border-bottom: 0;
	}

	.vega-field-row > label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--ink);
		overflow-wrap: anywhere;
		/* Alinea la línea base del label con la primera línea del control (mockup `.frow > label`). */
		padding-top: 0.4rem;
	}

	.vega-field-required {
		margin-left: 0.15rem;
		color: var(--danger);
	}

	.vega-field-control {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.vega-field-help {
		margin: 0;
		font-size: 0.75rem;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	.vega-field-error {
		margin: 0;
		font-size: 0.75rem;
		color: var(--danger);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	/* Responsive (R7): 1 columna, el label ya no necesita alinearse con nada. Breakpoint 940px =
	   el MISMO que el `@media` del mockup (`.frow`/`.manif` colapsan juntos) y que `.manif` en
	   `ManifestEditor.svelte` — así editor y manifiesto rompen a 1-col en el mismo ancho. */
	@media (max-width: 940px) {
		.vega-field-row {
			grid-template-columns: 1fr;
			gap: 0.35rem;
			padding: 0.9rem 1rem;
		}

		.vega-field-row > label {
			padding-top: 0;
		}
	}

	/* `stacked` (§4.9b, ver cabecera): SIEMPRE 1 columna, con o sin el `@media` de arriba — de ahí
	   que esta regla vaya DESPUÉS (misma especificidad, gana por orden de cascada a cualquier
	   ancho). Sin padding/borde propios: la fila pasa a ser una celda de `.vega-fgroup-grid`
	   (`RecordForm.svelte`), que ya separa filas Y columnas con su propio `gap`. */
	.vega-field-row--stacked {
		grid-template-columns: 1fr;
		gap: 0.35rem;
		padding: 0;
		border-bottom: 0;
	}

	.vega-field-row--stacked > label {
		padding-top: 0;
	}
</style>
