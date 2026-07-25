<script lang="ts">
	/**
	 * `MediaUpload.svelte` (Fase P6·6c; rediseño al mockup `aquelarre-medios.html`): la subida de
	 * `/media` — componente TONTO respecto al puerto (recibe `schema` YA resuelto por `+page.svelte`
	 * vía `findMediaFileFieldSchema`, y un callback `onUploaded`), mismo reparto que `MediaGrid`/
	 * `MediaDetail` (6b): la orquestación real vive en `media-upload-state.svelte.ts`, este
	 * componente solo cablea DOM↔ese estado.
	 *
	 * **Recambio de PRESENTACIÓN (mockup)**: la tarjeta "Subir ficheros" con el `<input type=file>`
	 * nativo a la vista pasa a ser (a) una banda de arrastre discreta (`.dropzone`: borde
	 * discontinuo, una línea de copy) y (b) las celdas del lote en curso, con el MISMO marco que
	 * las tarjetas de la rejilla. La lógica de drag&drop, la pre-validación y el lote secuencial no
	 * cambian ni una línea.
	 *
	 * **`<input type="file" multiple>` REAL** (a11y + testabilidad, contrato §4): sigue siendo el
	 * único control operable de verdad — foco-able, con su `<label>` asociado, y la ÚNICA superficie
	 * que Playwright ejercita (`setInputFiles`; nunca simula un `drop` de `DataTransfer`). Queda
	 * OCULTO VISUALMENTE (clip de 1px, nunca `display:none`: eso lo sacaría del orden de foco), y
	 * lo disparan tanto la banda de arrastre como el botón "Subir archivos" de la cabecera de la
	 * página — de ahí `openFilePicker`, exportada para `bind:this` (`/media/+page.svelte`).
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
	 * **"Reintentar" SOLO para fallos del backend** (`status.kind === 'error'`): reintentar un
	 * fichero que la pre-validación cliente rechazó (`'rejected'`: MIME/tamaño) daría exactamente el
	 * mismo rechazo, así que ahí el enlace no se pinta — sería una acción falsa, misma doctrina que
	 * omitir botones que no hacen nada. El `File` original se recuerda por índice (`batchFiles`,
	 * paralelo a `uploadState.items`, que `start()` construye con `files.map`) porque el estado del
	 * lote guarda nombre y estado, nunca los bytes.
	 *
	 * **Resumen honesto** (D-P6.7, "sin dedup por hash"): al terminar (o abortar) el lote, un
	 * toast "`N` subidos, `M` fallidos" — nunca infla ni oculta un fallo.
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		classifyMediaAssetType,
		formatFileSize,
		mediaExtensionBadge,
		mediaThumbTone
	} from './media-card';
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
	let inputEl = $state<HTMLInputElement | null>(null);
	// Bytes del último lote, por índice (ver cabecera: "Reintentar"). Variable PLANA: nunca se lee
	// en el template, así que no necesita reactividad (mismo criterio que `lastCall` de
	// `media-list-state.svelte.ts`).
	let batchFiles: File[] = [];

	/** Abre el selector de ficheros del sistema. Exportada para `bind:this` (el botón primario
	 *  "Subir archivos" de la cabecera de `/media` la llama; la banda de arrastre, también). */
	export function openFilePicker(): void {
		if (uploadState.running) return;
		inputEl?.click();
	}

	/** Tamaño máximo por fichero YA formateado (`schema.maxSizeBytes`, descubierto en runtime —
	 *  nunca el "25 MB" literal del mockup: el valor real de la colección es el que manda). `null`
	 *  si el esquema no declara límite: entonces la banda no promete ninguno. */
	const maxSizeText = $derived(
		schema.maxSizeBytes === undefined ? null : formatFileSize(schema.maxSizeBytes, ctx.locale)
	);

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

	function handleFiles(files: File[]): void {
		if (uploadState.running || files.length === 0) return;
		batchFiles = files;
		void uploadState.start(ctx, schema, files, onUploaded, (summary) => {
			ctx.feedback.toast(
				ctx.t('media.upload.summary', { uploaded: summary.uploaded, failed: summary.failed }),
				{ kind: summary.failed > 0 ? 'error' : 'success' }
			);
		});
	}

	function handleInputChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		handleFiles(input.files ? Array.from(input.files) : []);
		// Permite re-seleccionar el MISMO fichero (p.ej. tras corregirlo) y dispara `change` de nuevo.
		input.value = '';
	}

	/** "Reintentar" de un fichero que falló CONTRA EL BACKEND (ver cabecera): arranca un lote nuevo
	 *  con solo ese fichero — la lista pasa a mostrar ese único ítem, que es justo lo que el usuario
	 *  está mirando en ese momento. */
	function handleRetry(index: number): void {
		const file = batchFiles[index];
		if (!file) return;
		handleFiles([file]);
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
		handleFiles(event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : []);
	}
</script>

<div class="vega-media-upload" data-media-upload>
	<!-- Control REAL (ver cabecera): oculto VISUALMENTE, pero sigue en el orden de foco y en el
	     árbol de accesibilidad. Su `<label>` le da el nombre accesible con el que lo localizan tanto
	     un lector de pantalla como los e2e (`getByLabel`). -->
	<label class="vega-media-upload-sr" for="vega-media-upload-input">
		{ctx.t('media.upload.inputLabel')}
	</label>
	<input
		id="vega-media-upload-input"
		type="file"
		multiple
		class="vega-media-upload-sr"
		bind:this={inputEl}
		disabled={uploadState.running}
		onchange={handleInputChange}
	/>

	<!-- Banda de arrastre (mockup `.dropzone`): un `<button>` de verdad, no un `<div>` con
	     `role="presentation"` — desde el rediseño ES la afordancia principal de "elegir ficheros",
	     así que tiene que ser operable con teclado por sí misma. -->
	<button
		type="button"
		class="vega-media-dropzone"
		class:vega-media-dropzone--over={dragging}
		aria-disabled={uploadState.running ? 'true' : undefined}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onclick={openFilePicker}
	>
		<Icon id="upload" size={16} />
		<span>
			{ctx.t('media.upload.dropzoneLead')}
			<strong>{ctx.t('media.upload.dropzoneAction')}</strong>
			{#if maxSizeText}
				·
				<span class="vega-media-dropzone-max">
					{ctx.t('media.upload.dropzoneMax', { max: maxSizeText })}
				</span>
				{ctx.t('media.upload.dropzoneMaxSuffix')}
			{/if}
		</span>
	</button>

	{#if uploadState.items.length > 0}
		<!-- Lote en curso: mismas tarjetas que la rejilla, en su propia fila justo encima de ella
		     (el mockup las intercala entre los assets; aquí van juntas y arriba, que es donde el
		     usuario acaba de soltarlas y donde aparecerán al terminar — el grid ordena por `created`
		     desc). El marco visual se repite aquí en vez de compartir componente con `MediaGrid`: allí
		     una celda es un asset PERSISTIDO (`MediaItemView`, con id, miniatura y detalle); aquí es
		     un `File` en vuelo, sin `RecordId` ni nada que abrir. -->
		<ul class="vega-media-upload-grid" aria-live="polite">
			{#each uploadState.items as item, index (item.id)}
				{@const kind = statusAttr(item.status)}
				{@const ext = mediaExtensionBadge(item.name)}
				{@const type = classifyMediaAssetType(item.name)}
				<li
					class="vega-media-upload-card"
					class:vega-media-upload-card--error={kind === 'error'}
					data-media-upload-item
					data-media-upload-status={kind}
				>
					<span
						class="vega-media-upload-thumb"
						class:vega-media-upload-thumb--error={kind === 'error'}
						data-media-tone={kind === 'error' ? undefined : mediaThumbTone(item.name)}
					>
						{#if ext !== ''}
							<span class="vega-media-upload-ext">{ext}</span>
						{/if}
						{#if kind === 'error'}
							<Icon id="warning" size={30} />
						{:else if type === 'video'}
							<Icon id="video" size={30} />
						{:else if type === 'image'}
							<Icon id="media" size={30} />
						{:else}
							<Icon id="document" size={30} />
						{/if}
						{#if kind === 'uploading'}
							<!-- Relleno de progreso (mockup `.progress > span`, firma: --accent-fill SOLO en
							     rellenos). Sin bytes transferidos reales que reportar (el puerto no expone
							     progreso incremental de subida), así que es INDETERMINADO — nunca el
							     porcentaje inventado que pinta el mockup. -->
							<span class="vega-media-upload-progress" aria-hidden="true">
								<span class="vega-media-upload-progress-fill"></span>
							</span>
						{/if}
					</span>
					<span class="vega-media-upload-meta">
						<span class="vega-media-upload-name">{item.name}</span>
						{#if kind === 'error'}
							<span class="vega-media-upload-error">
								{statusText(item.status)}
								{#if item.status.kind === 'error'}
									·
									<button
										type="button"
										class="vega-media-upload-retry"
										onclick={() => handleRetry(index)}
									>
										{ctx.t('media.upload.retry')}
									</button>
								{/if}
							</span>
						{:else}
							<span class="vega-media-upload-status">{statusText(item.status)}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.vega-media-upload {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	/* Oculto VISUALMENTE, presente para teclado y lectores de pantalla (nunca `display: none`). */
	.vega-media-upload-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	/* Banda de arrastre (mockup `.dropzone`). */
	.vega-media-dropzone {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.8rem;
		border: 1px dashed var(--line-strong);
		border-radius: var(--r);
		background: var(--paper);
		color: var(--ink-3);
		font-size: 0.9em;
		line-height: 1.45;
		cursor: pointer;
	}

	.vega-media-dropzone:hover {
		border-color: var(--accent-line);
		color: var(--ink-2);
	}

	.vega-media-dropzone strong {
		color: var(--ink-2);
		font-weight: 600;
	}

	/* El límite es un VALOR canónico → --mono (mismo criterio que tamaños y nombres de fichero). */
	.vega-media-dropzone-max {
		font-family: var(--mono);
		font-size: 0.9em;
	}

	.vega-media-dropzone--over {
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-media-dropzone[aria-disabled='true'] {
		cursor: progress;
		opacity: 0.6;
	}

	/* Lote en curso: MISMA rejilla que `MediaGrid` (ver marcado). */
	.vega-media-upload-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--vega-space-gutter);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-media-upload-card {
		display: flex;
		flex-direction: column;
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: var(--r);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.vega-media-upload-card--error {
		border-color: var(--danger);
	}

	.vega-media-upload-thumb {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 4 / 3;
		border-bottom: 1px solid var(--line-soft);
		background: var(--btn);
		color: var(--ink-3);
		overflow: hidden;
	}

	.vega-media-upload-thumb[data-media-tone='a'] {
		background: linear-gradient(140deg, var(--accent-soft), var(--surface-2));
		color: var(--accent-text);
	}

	.vega-media-upload-thumb[data-media-tone='b'] {
		background: linear-gradient(140deg, var(--info-soft), var(--surface-2));
		color: var(--info);
	}

	.vega-media-upload-thumb[data-media-tone='c'] {
		background: linear-gradient(140deg, var(--success-soft), var(--surface-2));
		color: var(--success);
	}

	.vega-media-upload-thumb[data-media-tone='d'] {
		background: linear-gradient(140deg, var(--warning-soft), var(--surface-2));
		color: var(--warning);
	}

	.vega-media-upload-thumb--error {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-media-upload-ext {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--line-soft);
		border-radius: 4px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 0.68em;
		line-height: 1.4;
		letter-spacing: 0.05em;
	}

	/* Barra de progreso INDETERMINADA (ver marcado): pista neutra + relleno --accent-fill que
	   recorre la pista — `prefers-reduced-motion` ya la congela globalmente (`theme/base.css`). */
	.vega-media-upload-progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: block;
		height: 4px;
		background: var(--line-soft);
		overflow: hidden;
	}

	.vega-media-upload-progress-fill {
		display: block;
		height: 100%;
		width: 40%;
		background: var(--accent-fill);
		animation: vega-media-upload-indeterminate 1.1s ease-in-out infinite;
	}

	@keyframes vega-media-upload-indeterminate {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(250%);
		}
	}

	.vega-media-upload-meta {
		display: block;
		padding: 0.55rem 0.7rem 0.65rem;
	}

	.vega-media-upload-name {
		display: block;
		color: var(--ink);
		font-size: 0.88em;
		font-weight: 550;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.vega-media-upload-status {
		display: block;
		margin-top: 1px;
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 0.72em;
		line-height: 1.4;
	}

	/* Mensaje de error (mockup `.asset-error-msg` + `.retry`): el motivo y, solo para fallos del
	   backend, el enlace de reintento (ver cabecera). */
	.vega-media-upload-error {
		display: block;
		margin-top: 0.2rem;
		color: var(--danger);
		font-size: 0.76em;
		line-height: 1.35;
	}

	.vega-media-upload-retry {
		padding: 0;
		border: 0;
		background: none;
		color: var(--danger);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	/* Estado semántico "subido" (el resto se lee del propio texto): verde de éxito. */
	.vega-media-upload-card[data-media-upload-status='done'] .vega-media-upload-status {
		color: var(--success);
	}

	.vega-media-upload-card[data-media-upload-status='uploading'] .vega-media-upload-status {
		color: var(--info);
	}

	/* Móvil (mockup): la banda de arrastre desaparece (no hay "arrastrar" en táctil) — el botón
	   "Subir archivos" de la cabecera sigue siendo la vía real. Las celdas del lote pasan a dos
	   columnas, igual que la rejilla. */
	@media (max-width: 560px) {
		.vega-media-dropzone {
			display: none;
		}

		.vega-media-upload-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
