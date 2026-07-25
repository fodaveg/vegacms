<script lang="ts">
	/**
	 * `FieldRow.svelte` (Fase F5-a; mockup final `aquelarre-detalle-post.html` `.field`): label +
	 * help + el widget del registry + el error del campo, con `aria-invalid`/`aria-describedby`
	 * apuntando al MISMO id que pinta el widget (`field-ids.ts`, compartido — ninguno de los dos lo
	 * recibe como prop extra: la interfaz de widget que fija D-P5.1 es
	 * `{field,value,error,disabled,readonly,optionLabels?,onChange}` y nada más, ver
	 * `widgets/types.ts` para por qué `optionLabels` viaja por ahí).
	 *
	 * `readonly` (L-P5.2) combina `field.schema.readonly` (autodate del backend) con
	 * `typeReadonly` (prop: `contentType.readonly`, una vista) — cualquiera de las dos basta.
	 * `placeholder` no es prop propia de esta capa: cada widget lee `field.placeholder`
	 * directamente (ya viaja dentro de `field`).
	 *
	 * **Campo APILADO (mockup final)**: el label va SIEMPRE encima del control (antes era un grid
	 * `label | control` de 184px + 1fr, mockup C2 `.frow`). El mockup final pinta todos los campos
	 * apilados — tanto en la tarjeta central como en las del aside, donde 184px de label ni caben —
	 * y quien separa unas filas de otras es el `gap` del contenedor (`--gap-field`, `RecordForm.
	 * svelte`), no un borde por fila. `data-field`/`data-widget` y los DOS ids (`fieldIds`) se
	 * mantienen INTACTOS en el mismo elemento raíz: de ellos dependen `resolveFocusTarget`
	 * (`focus-target.ts`, selector `.vega-field-row[data-field="…"]`) y varios locators de
	 * `e2e/form.spec.ts` — renombrar esta clase o mover el atributo habría roto ambos en silencio.
	 *
	 * **`isTitleField` (mockup `.field.title-field`)**: el campo que el tipo declara como
	 * `titleField` se edita EN GRANDE — sin recuadro, solo una hairline inferior que al foco pasa a
	 * ser el hilo `--sheen`. Ver el CSS de más abajo para por qué la caja se aplana del todo.
	 *
	 * **`isSlugField` (capacidad `slugField`, mockup `.slug-row`)**: el campo derivable del título
	 * se pinta en `--mono` (es un VALOR canónico, como los ids y las fechas — misma regla de tokens
	 * que el resto del rediseño) y admite una acción inline a su derecha vía el snippet `action`
	 * (el botón "Regenerar", que compone `RecordForm.svelte` porque es quien conoce el `titleField`
	 * del que derivarlo). El snippet es genérico: cualquier campo podría llevar una acción inline,
	 * aunque hoy solo la usa el slug.
	 *
	 * **`stacked` (§4.9b, rejilla de columnas de `fieldGroups`)**: prop conservada del layout de
	 * columnas emparejadas. Desde el mockup final TODA fila es apilada, así que `stacked` ya no
	 * cambia el eje del label; lo que sigue haciendo es quitar el `margin` de separación de la
	 * fila cuando quien separa es el `gap` de la rejilla `.vega-fgroup-grid`.
	 */
	import type { Snippet } from 'svelte';
	import type { ResolvedField } from '$lib/model/types';
	import type { FieldInputValue } from '$lib/backend/types';
	import type { TranslatedError } from './field-errors';
	import { fieldIds } from './field-ids';
	import { fieldErrorMessage } from './field-error-message';
	import { WIDGET_REGISTRY } from './widgets/registry';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		field: ResolvedField;
		value: FieldInputValue;
		error: TranslatedError | null;
		disabled: boolean;
		/** `contentType.readonly` (view, L-P5.2): se combina con `field.schema.readonly` aquí. */
		typeReadonly: boolean;
		/** `true` dentro de un grupo de columnas (§4.9b, ver cabecera); default `false`. */
		stacked?: boolean;
		/** `true` cuando `field.name === type.titleField` (`RecordForm.svelte`, mockup `.field.
		 *  title-field`): el campo héroe. Ver cabecera y el CSS `:global` de abajo — solo afecta al
		 *  `<input>` que renderiza `Text.svelte`, nunca a otro tipo de widget. Default `false`. */
		isTitleField?: boolean;
		/** `true` cuando `field.name === type.slugField` (mockup `.slug-row input.mono`): control en
		 *  tipografía mono. Default `false`. */
		isSlugField?: boolean;
		/** Etiquetas legibles por valor de opción para ESTE campo (P2 `statusLabels`), o nada. Pasa
		 *  tal cual al widget — solo `Select.svelte` la usa (ver `widgets/types.ts`). */
		optionLabels?: Record<string, string>;
		/** Acción inline a la derecha del control (mockup `.slug-row` + `.btn`), o nada. */
		action?: Snippet;
		onChange: (value: FieldInputValue) => void;
	}

	let {
		field,
		value,
		error,
		disabled,
		typeReadonly,
		stacked = false,
		isTitleField = false,
		isSlugField = false,
		optionLabels,
		action,
		onChange
	}: Props = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const readonly = $derived(field.schema.readonly || typeReadonly);
	const Widget = $derived(WIDGET_REGISTRY[field.widget]);
</script>

<div
	class="vega-field-row"
	class:vega-field-row--stacked={stacked}
	class:vega-field-row--title={isTitleField}
	class:vega-field-row--slug={isSlugField}
	data-field={field.name}
	data-widget={field.widget}
>
	<label id={ids.labelId} for={ids.inputId}>
		{field.label}{#if field.schema.required}<span class="vega-field-required" aria-hidden="true"
				>*</span
			>{/if}
	</label>
	<div class="vega-field-control">
		{#if action}
			<!-- Control + acción en la MISMA línea (mockup `.slug-row`): el widget ocupa el hueco
			     restante (`flex: 1` sobre este envoltorio) y la acción se alinea con su borde
			     superior, no con su centro (un widget alto no debe arrastrar el botón al medio). -->
			<div class="vega-field-inline">
				<div class="vega-field-inline-widget">
					<Widget {field} {value} {error} {disabled} {readonly} {optionLabels} {onChange} />
				</div>
				{@render action()}
			</div>
		{:else}
			<Widget {field} {value} {error} {disabled} {readonly} {optionLabels} {onChange} />
		{/if}
		{#if field.help}
			<p id={ids.helpId} class="vega-field-help">{field.help}</p>
		{/if}
		{#if error}
			<p id={ids.errorId} class="vega-field-error" role="alert">
				<!-- Glifo decorativo (`aria-hidden` por defecto en `Icon.svelte`): el TEXTO del error
				     ya lo dice todo, el icono solo lo hace localizable de un vistazo (mockup
				     `.error-msg svg`). -->
				<Icon id="generic" size={13} />
				{fieldErrorMessage(ctx.t, error)}
			</p>
		{/if}
	</div>
</div>

<style>
	/* Campo apilado (mockup `.field`): label encima, control debajo, ayuda y error bajo el control.
	   Sin borde ni padding propios — quien separa una fila de otra es el `gap` del contenedor
	   (`.vega-fields`/`.vega-fgroup-grid` de `RecordForm.svelte`), como en el mockup. */
	.vega-field-row {
		display: flex;
		flex-direction: column;
		/* Casos límite de contenido real (F5-g): permite que la fila se encoja por debajo del
		   ancho de su contenido — sin esto, un label/valor kilométrico de una sola palabra
		   desbordaría horizontalmente el formulario. */
		min-width: 0;
	}

	.vega-field-row > label {
		display: block;
		font-size: 0.82em;
		font-weight: 650;
		letter-spacing: 0.03em;
		color: var(--ink-2);
		margin-bottom: 0.35rem;
		overflow-wrap: anywhere;
	}

	.vega-field-required {
		margin-left: 0.15rem;
		color: var(--danger);
	}

	.vega-field-control {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.vega-field-inline {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	.vega-field-inline-widget {
		flex: 1;
		min-width: 0;
	}

	.vega-field-help {
		margin: 0.3rem 0 0;
		font-size: 0.82em;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	/* Mensaje de error (mockup `.error-msg`): icono + texto en la misma línea base. */
	.vega-field-error {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.35rem 0 0;
		font-size: 0.84em;
		color: var(--danger);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	/* `stacked` (§4.9b): dentro de `.vega-fgroup-grid` la separación entre celdas la pone el `gap`
	   de la rejilla. Se conserva la clase (la usan los grupos de columnas emparejadas) aunque el
	   eje del label ya no dependa de ella: todas las filas son apiladas desde el mockup final. */
	.vega-field-row--stacked {
		margin: 0;
	}

	/* Campo héroe: el título del registro (mockup `.field.title-field input`, firma de David — el
	   hilo `--sheen` en trazos-resalte finos, nunca en rellenos). `:global()` porque el `<input>`
	   real lo pinta `Text.svelte` (D-P5.1: la interfaz de widget no lleva un flag "soy el título",
	   así que el gancho vive aquí, en el contenedor) — targetea su clase estable
	   `.vega-widget-text`, nunca un selector de posición.
	   La caja se aplana a una sola hairline inferior (sin recuadro/radio): un `border-image` NO
	   respeta `border-radius` (esquinas cuadradas encima de una caja redondeada, artefacto visual
	   conocido) y pintaría el degradado en las CUATRO aristas si quedara algún `border-width` en
	   las otras tres — reduciéndolas a 0 aquí es lo que confina el efecto a un subrayado de
	   verdad. `aria-invalid` (regla de `Text.svelte`) sigue funcionando: solo tiñe la arista que
	   de verdad tiene ancho. */
	.vega-field-row--title :global(.vega-widget-text) {
		font-size: 1.35em;
		font-weight: 650;
		color: var(--ink-hi);
		border: 0;
		border-bottom: 1px solid var(--line-soft);
		border-radius: 0;
		padding-inline: 0;
		background: transparent;
	}

	.vega-field-row--title :global(.vega-widget-text:hover) {
		border-bottom-color: var(--line-strong);
	}

	.vega-field-row--title :global(.vega-widget-text:focus-visible) {
		outline: none;
		border-bottom: 2px solid transparent;
		border-image: var(--sheen) 1;
	}

	/* Campo slug (mockup `.slug-row input.mono`): VALOR canónico ⇒ `--mono`, un punto más pequeño
	   para compensar el ancho de la mono. Mismo gancho `:global` que el campo héroe. */
	.vega-field-row--slug :global(.vega-widget-text) {
		font-family: var(--mono);
		font-size: 0.92em;
	}
</style>
