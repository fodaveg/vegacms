<script lang="ts">
	/**
	 * `MediaSelectionBar.svelte` (rediseño de `/media`, mockup `.selection-bar`): la barra
	 * contextual que aparece en cuanto hay assets seleccionados en la biblioteca. Componente TONTO
	 * (mismo reparto que `MediaGrid`/`MediaDeleteConfirm`): no conoce el puerto ni la selección —
	 * recibe el recuento y dos callbacks, `/media/+page.svelte` hace el trabajo.
	 *
	 * `position: sticky; bottom` (mockup): acompaña al scroll de la rejilla sin taparla del todo,
	 * y desaparece con la selección. `role="status"`: aparecer YA es el anuncio ("3 seleccionados"),
	 * sin robar el foco a nadie.
	 *
	 * **Sin "Insertar"** (el mockup lo pinta entre "Copiar URL" y "Eliminar"): insertar un asset en
	 * un campo solo tiene sentido cuando la biblioteca se abre COMO SELECTOR desde un formulario
	 * (`MediaPicker.svelte`, que ya tiene su propio botón y su propio contrato de copia de bytes,
	 * L-P6.8). En la página `/media` suelta no hay campo destino al que insertar nada, así que el
	 * botón no se pinta en vez de mentir sobre lo que Vega sabe hacer — misma doctrina que el editor,
	 * donde se omitió "Publicar". Por lo mismo, "Copiar URL" se queda como botón secundario y no
	 * hereda el relleno primario que el mockup daba a "Insertar": ninguna de las dos acciones de
	 * esta barra es la que "confirma" nada.
	 */
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		/** Nº de assets seleccionados. El llamador no monta la barra con `0`. */
		count: number;
		/** "Copiar URL": copia al portapapeles la URL pública de cada asset seleccionado. */
		onCopy: () => void;
		/** "Eliminar": abre la confirmación (nunca borra directamente, D-P6.5). */
		onDelete: () => void;
		/** `true` mientras un borrado del lote está en vuelo: deshabilita ambas acciones. */
		busy?: boolean;
	}

	let { count, onCopy, onDelete, busy = false }: Props = $props();

	const ctx = getVegaContext();
</script>

<div class="vega-media-selection" role="status" data-media-selection-bar>
	<span class="vega-media-selection-count">
		<b>{count}</b>
		{count === 1 ? ctx.t('media.selection.labelOne') : ctx.t('media.selection.labelMany')}
	</span>
	<span class="vega-media-selection-spacer"></span>
	<button type="button" class="vega-media-selection-copy" disabled={busy} onclick={onCopy}>
		{ctx.t('media.selection.copy')}
	</button>
	<button type="button" class="vega-media-selection-delete" disabled={busy} onclick={onDelete}>
		{ctx.t('media.selection.delete')}
	</button>
</div>

<style>
	.vega-media-selection {
		position: sticky;
		bottom: 12px;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: 480px;
		margin-top: 1.2rem;
		margin-inline: auto;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface-2);
		box-shadow: var(--shadow-card);
		font-size: 0.9em;
	}

	.vega-media-selection-spacer {
		flex: 1;
	}

	/* El recuento es un VALOR → --mono, y en acento para que se lea de un vistazo. */
	.vega-media-selection-count b {
		color: var(--accent-text);
		font-family: var(--mono);
		font-weight: 650;
	}

	.vega-media-selection-copy {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font-weight: 550;
		line-height: 1;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-media-selection-copy:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	/* "Eliminar" (mockup `.link-danger`): sin marco ni relleno — la acción destructiva no compite
	   en peso visual con la neutra, y la confirmación es la que de verdad la ejecuta. */
	.vega-media-selection-delete {
		padding: 0.3rem 0.5rem;
		border: 0;
		border-radius: var(--r);
		background: none;
		color: var(--danger);
		font: inherit;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-media-selection-delete:hover:not(:disabled) {
		background: var(--danger-soft);
	}

	.vega-media-selection button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
