<script lang="ts">
	/**
	 * `MediaUpload.svelte` (Fase P6·6c): zona de subida drag&drop de `/media`, montada dentro del
	 * estado `'present'` — componente TONTO respecto al puerto (recibe `schema` YA resuelto por
	 * `+page.svelte` vía `findMediaFileFieldSchema`, y un callback `onUploaded`), mismo reparto que
	 * `MediaGrid`/`MediaDetail` (6b): la orquestación real vive en `media-upload-state.svelte.ts`,
	 * este componente solo cablea DOM↔ese estado.
	 *
	 * **`<input type="file" multiple>` REAL** (a11y + testabilidad, contrato §4): foco-able,
	 * operable por teclado — la ÚNICA superficie que Playwright ejercita con `setInputFiles`
	 * (nunca simula un `drop` de `DataTransfer`). El dropzone visual (`ondragover`/`ondrop`) es un
	 * extra ENCIMA de ese input, mismo patrón que `FileInput.svelte` de P5: `role="presentation"`
	 * (capa puramente decorativa, no un silenciador de a11y — el control real es el input de
	 * dentro).
	 *
	 * **Arranca el lote de inmediato** al elegir/soltar ficheros, sin botón "subir" aparte: a
	 * diferencia del widget `file` de P5 (que acumula un "estado final deseado" hasta que
	 * `RecordForm` guarda), aquí cada fichero YA ES su propio registro de `vega_media` — no hay
	 * nada que posponer. `uploadState.running` deshabilita añadir un lote nuevo mientras el
	 * actual sigue en vuelo (mismo criterio que `saving` en `MediaDetail`).
	 *
	 * **Estados por-fichero** (`data-media-upload-status`, para e2e): `pending`/`uploading`/`done`/
	 * `error` — un `'rejected'` de la pre-validación (D-P6.3) se pinta como `error` igual que un
	 * rechazo del backend (la distinción interna entre ambos, ver `media-upload-state.svelte.ts`,
	 * no es visible aquí: para quien mira la lista, "no se subió, y este es el motivo" es un único
	 * concepto). `aria-live="polite"` en la lista: cada cambio de estado se anuncia.
	 *
	 * **Resumen honesto** (D-P6.7, "sin dedup por hash"): al terminar (o abortar) el lote, un
	 * toast "`N` subidos, `M` fallidos" — nunca infla ni oculta un fallo.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { createMediaUploadState, type MediaUploadItemStatus } from './media-upload-state.svelte';
	import type { MediaFileFieldSchema } from './media-upload';

	interface Props {
		/** El campo `file` de `vega_media` YA resuelto (`findMediaFileFieldSchema`, esquema
		 *  DESCUBIERTO en runtime, D-P6.3) — este componente nunca lo busca por su cuenta. */
		schema: MediaFileFieldSchema;
		/** Se llama tras CADA subida individual con éxito (no solo al final del lote): el llamador
		 *  refresca el grid (`mediaListState.reload()`). */
		onUploaded: () => void;
	}

	let { schema, onUploaded }: Props = $props();

	const ctx = getVegaContext();
	const uploadState = createMediaUploadState();

	let dragging = $state(false);

	/** Texto legible del estado de UN fichero del lote (ver cabecera: `rejected` y `error` se
	 *  presentan igual, con el motivo). */
	function statusText(status: MediaUploadItemStatus): string {
		switch (status.kind) {
			case 'pending':
				return ctx.t('media.upload.status.pending');
			case 'uploading':
				return ctx.t('media.upload.status.uploading');
			case 'done':
				return ctx.t('media.upload.status.done');
			case 'rejected': {
				const reasonKey =
					status.reason === 'tooLarge'
						? 'media.upload.reason.tooLarge'
						: 'media.upload.reason.invalidType';
				return ctx.t('media.upload.status.error', { message: ctx.t(reasonKey) });
			}
			case 'error':
				return ctx.t('media.upload.status.error', { message: status.message });
		}
	}

	/** `data-media-upload-status`: `'rejected'` colapsa a `'error'` (mismo criterio que
	 *  `statusText`, un único concepto visible de "no se subió"). */
	function statusAttr(status: MediaUploadItemStatus): 'pending' | 'uploading' | 'done' | 'error' {
		return status.kind === 'rejected' ? 'error' : status.kind;
	}

	function handleFiles(fileList: FileList | null): void {
		if (uploadState.running || !fileList || fileList.length === 0) return;
		const files = Array.from(fileList);
		void uploadState.start(ctx, schema, files, onUploaded, (summary) => {
			ctx.feedback.toast(
				ctx.t('media.upload.summary', { uploaded: summary.uploaded, failed: summary.failed }),
				{ kind: summary.failed > 0 ? 'error' : 'success' }
			);
		});
	}

	function handleInputChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		handleFiles(input.files);
		// Permite re-seleccionar el MISMO fichero (p.ej. tras corregirlo) y dispara `change` de nuevo.
		input.value = '';
	}

	function handleDragOver(event: DragEvent): void {
		if (uploadState.running) return; // sin preventDefault: el navegador pinta "no permitido"
		event.preventDefault();
		dragging = true;
	}

	function handleDragLeave(): void {
		dragging = false;
	}

	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		dragging = false;
		if (uploadState.running) return;
		handleFiles(event.dataTransfer?.files ?? null);
	}
</script>

<div class="vega-media-upload" data-media-upload>
	<!-- `role="presentation"` (ver cabecera): decorativo, el único control operable de verdad es
	     el `<input>` de dentro. -->
	<div
		class="vega-media-upload-dropzone"
		class:vega-media-upload-dropzone--dragging={dragging}
		data-inert={uploadState.running ? 'true' : undefined}
		role="presentation"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		<label for="vega-media-upload-input">{ctx.t('media.upload.inputLabel')}</label>
		<input
			id="vega-media-upload-input"
			type="file"
			multiple
			class="vega-media-upload-input"
			disabled={uploadState.running}
			onchange={handleInputChange}
		/>
		<p class="vega-media-upload-hint">{ctx.t('media.upload.dropHint')}</p>
	</div>

	{#if uploadState.items.length > 0}
		<ul class="vega-media-upload-list" aria-live="polite">
			{#each uploadState.items as item (item.id)}
				<li
					class="vega-media-upload-item"
					data-media-upload-item
					data-media-upload-status={statusAttr(item.status)}
				>
					<span class="vega-media-upload-name">{item.name}</span>
					<span class="vega-media-upload-status">{statusText(item.status)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.vega-media-upload {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.vega-media-upload-dropzone {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.9rem;
		border: 1px dashed var(--line);
		border-radius: 8px;
		background: var(--surface);
	}

	.vega-media-upload-dropzone--dragging {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.vega-media-upload-dropzone[data-inert='true'] {
		opacity: 0.6;
	}

	.vega-media-upload-dropzone label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ink);
	}

	.vega-media-upload-input:disabled {
		cursor: not-allowed;
	}

	.vega-media-upload-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-2);
	}

	.vega-media-upload-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-media-upload-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		font-size: 0.85rem;
	}

	.vega-media-upload-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink);
	}

	.vega-media-upload-status {
		flex-shrink: 0;
		color: var(--ink-2);
	}

	.vega-media-upload-item[data-media-upload-status='done'] .vega-media-upload-status {
		color: var(--success);
	}

	.vega-media-upload-item[data-media-upload-status='error'] .vega-media-upload-status {
		color: var(--danger);
	}
</style>
