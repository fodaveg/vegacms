<script lang="ts">
	/**
	 * Diálogo «Texto alternativo» de la barra del texto enriquecido: el paso que sigue a elegir en
	 * la biblioteca una imagen que NO tiene texto alternativo. Si el medio ya lo trae, la barra
	 * inserta la imagen sin pasar por aquí.
	 *
	 * El campo es opcional a propósito: una imagen decorativa va con `alt=""`, que es lo correcto
	 * (un lector de pantalla la salta). Lo que se escribe aquí se guarda en ESTA inserción; no
	 * cambia el medio en la biblioteca.
	 *
	 * Se monta solo mientras está abierto (lo decide `EditorToolbar.svelte`). El marco, el foco
	 * atrapado, `Esc` y la devolución del foco son de `AdminDialog.svelte`.
	 */
	import { getVegaContext } from '$lib/app-context';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';

	interface Props {
		/** URL de la imagen elegida: la misma que se va a escribir en el `src`. */
		src: string;
		/** Nombre del fichero, para decir de qué imagen se habla si la vista previa no carga. */
		fileName: string;
		onInsert: (alt: string) => void;
		onClose: () => void;
	}

	let { src, fileName, onInsert, onClose }: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	let alt = $state('');

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		onInsert(alt.trim());
	}
</script>

<AdminDialog open title={ctx.t('form.editor.imageDialog.title')} {onClose}>
	<form id="{id}-form" class="vega-admin-form" novalidate onsubmit={submit}>
		<figure class="vega-rt-image-preview">
			<!-- Decorativa dentro del diálogo: el nombre va en el pie, y el texto alternativo es
			     justo lo que se está escribiendo. -->
			<img {src} alt="" />
			<figcaption>{fileName}</figcaption>
		</figure>
		<div class="vega-admin-field">
			<label for="{id}-alt">{ctx.t('form.editor.imageDialog.altLabel')}</label>
			<input
				id="{id}-alt"
				class="vega-admin-input"
				type="text"
				autocomplete="off"
				bind:value={alt}
				aria-describedby="{id}-alt-help"
				data-autofocus=""
			/>
			<p class="vega-admin-help" id="{id}-alt-help">
				{ctx.t('form.editor.imageDialog.altHelp')}
			</p>
		</div>
	</form>

	{#snippet actions()}
		<button type="button" class="vega-admin-btn" onclick={onClose}>
			{ctx.t('common.cancel')}
		</button>
		<button type="submit" form="{id}-form" class="vega-admin-btn vega-admin-btn--primary">
			{ctx.t('form.editor.imageDialog.insert')}
		</button>
	{/snippet}
</AdminDialog>

<style>
	.vega-rt-image-preview {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0;
	}

	.vega-rt-image-preview img {
		display: block;
		width: 100%;
		max-height: 11rem;
		border: 1px solid var(--line-soft);
		border-radius: var(--r);
		background: var(--surface-2);
		object-fit: contain;
	}

	.vega-rt-image-preview figcaption {
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}
</style>
