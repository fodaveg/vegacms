<script lang="ts">
	/**
	 * Widget `file` (F5-f, `type:'file'`): el ÚLTIMO de los 14 dedicados (D-P5.10). Cubre TAMBIÉN
	 * el vocabulario "imagen" (Audit Finding 4, "no hay `WidgetId` `image`" — se distingue por
	 * mime/extensión, ver `file-value.ts`).
	 *
	 * - **Modelo "estado final deseado" (§4.4)**: `value` es `FileRef | File | null` (single) o
	 *   `(File | FileRef)[]` (múltiple) — subir = añadir un `File`; conservar = mantener la
	 *   `FileRef`; borrar = quitarla del array o `null`. La edición (add/remove/reemplazar) es
	 *   `file-value.ts`, puro; este componente solo cablea DOM↔ese módulo.
	 * - **Subida directa + drag&drop**: `<input type="file">` VISIBLE (nunca escondido: es la
	 *   única superficie nativamente operable por teclado, L-P5.2) envuelto en un dropzone que
	 *   además acepta `dragover`/`drop`. La validación cliente (`maxSizeBytes`/`mimeTypes`,
	 *   `file-value.ts`) es SOLO-UX — el backend re-valida de verdad (§9.9) — así que un rechazo
	 *   se pinta en un párrafo local (`rejectionMessage`, `role="alert"`), NUNCA en el `error` de
	 *   campo (ese slot lo llena `RecordForm`/backend, D-P5.1 no da margen para que un widget lo
	 *   escriba él mismo).
	 * - **`maxSelect` (múltiple)**: MISMA afordancia que `chips`/`relation` (F5-b/e) — al
	 *   alcanzarlo, el dropzone/input quedan inertes para AÑADIR (quitar sigue disponible). La
	 *   validación dura ya la hace `validation.ts`/backend.
	 * - **Preview**: un `File` nuevo usa `URL.createObjectURL` (cacheada en `objectUrls`, un `Map`
	 *   PLANO — ver LANDMINE de object URLs más abajo); una `FileRef` existente usa
	 *   `ctx.port.fileUrl(record, field.name, ref, opts)`, con `record` sacado de la costura de
	 *   identidad (`record-context.ts`, ver su cabecera) y `opts.thumb` SOLO si
	 *   `ctx.port.capabilities.thumbs`. Imagen (mime o, para una `FileRef`, extensión —
	 *   `classifyItem`) → `<img>`, con `onerror` degradando a chip (extensión ambigua/incorrecta);
	 *   cualquier otra cosa → chip con su nombre. `alt`/`title` (fix de code-review, a11y): el
	 *   `<img>` lleva `alt={itemDisplayName(item)}` (nunca `alt=""` — en readonly/disabled el botón
	 *   "Quitar" con el nombre desaparece, así que la imagen es la ÚNICA fuente de ese nombre para
	 *   un lector de pantalla) y el chip lleva `title` (nombre completo al pasar el ratón, el texto
	 *   visible se trunca por CSS).
	 * - **Sin identidad (widget fuera de un `RecordForm`, degradado, ver `record-context.ts`)**:
	 *   `previewSrcFor` devuelve `null` para una `FileRef` (nada que mostrar, cae a chip); un
	 *   `File` nuevo se sigue previsualizando igual (no depende de la identidad).
	 * - **Punto de extensión P6 (D-P5.10, "picker de biblioteca")**: HOY `ctx` no expone ningún
	 *   `mediaPicker` — la costura NO se implementa aquí (fuera de alcance de F5-f), pero queda
	 *   documentada: cuando P6 añada `ctx.mediaPicker?.pick(field)` a `VegaAppContext`, un botón
	 *   "Elegir de la biblioteca" en este mismo widget llamaría a esa función y mezclaría el/los
	 *   `FileRef` resultante(s) en `value` por el MISMO `onChange` (`addFilesToMultiple`/
	 *   `setSingleFile` no aplican ahí — un `FileRef` de biblioteca no pasa por validación de
	 *   tamaño/tipo cliente, ya vive en el backend), sin tocar el resto del widget.
	 *
	 * LANDMINE (object URLs): un `$effect` reconcilia `objectUrls` cada vez que `items` cambia —
	 * revoca cualquier entrada cuyo `File` ya no aparezca en el value actual (cubre TANTO quitar un
	 * fichero explícitamente COMO que `RecordForm` reasiente `current` tras guardar, que reemplaza
	 * los `File` pendientes por las `FileRef` reales sin pasar por `removeItem`) — y el cleanup de
	 * `onMount` revoca lo que quede al desmontar. `objectUrls` es un `Map` PLANO (no `$state`,
	 * mismo patrón que `pendingTitleFetches` de `Relation.svelte`): sus claves son `File`, que
	 * Svelte 5 NUNCA proxifica (`to-record-input.ts` lo documenta), así que envolver el propio Map
	 * en reactividad no aporta nada y solo complica el tipo.
	 */
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getVegaContext } from '$lib/app-context';
	import { getRecordIdentity } from '../record-context';
	import {
		acceptAttr,
		addFilesToMultiple,
		classifyItem,
		isNewFile,
		itemDisplayName,
		removeFromMultiple,
		setSingleFile,
		type FileItem,
		type FileRejection
	} from './file-value';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const identity = getRecordIdentity(); // null = fuera de un RecordForm (degradado, ver cabecera)

	const ids = $derived(fieldIds(field.name));
	const rejectionId = $derived(`${ids.inputId}-rejection`);
	const inert = $derived(disabled || readonly);
	const schema = $derived(field.schema.type === 'file' ? field.schema : null);
	const multiple = $derived(schema?.multiple ?? false);

	let rejectionMessage = $state<string | null>(null);
	let dragging = $state(false);
	// `SvelteSet` (no un `Set` plano): SÍ se lee en el template (`!failedImages.has(item)`), a
	// diferencia de `objectUrls`/`pendingTitleFetches` (imperativos, nunca leídos ahí) — necesita
	// reactividad de verdad para que el fallback imagen→chip repinte al primer `onerror`.
	const failedImages = new SvelteSet<FileItem>();

	const describedBy = $derived(
		[
			field.help ? ids.helpId : null,
			error ? ids.errorId : null,
			rejectionMessage ? rejectionId : null
		]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);

	const items = $derived<FileItem[]>(
		multiple
			? Array.isArray(value)
				? (value as FileItem[])
				: []
			: value !== null && value !== undefined
				? [value as FileItem]
				: []
	);
	const limitReached = $derived(
		multiple && schema?.maxSelect !== undefined && items.length >= schema.maxSelect
	);
	const addDisabled = $derived(inert || limitReached);

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ver LANDMINE en cabecera
	const objectUrls = new Map<File, string>();

	// Revoca cualquier object URL cuyo `File` ya no aparezca en `items` (ver cabecera): cubre
	// quitar un fichero Y que `RecordForm` reasiente `current` tras guardar.
	$effect(() => {
		const currentFiles = new Set(items.filter(isNewFile));
		for (const [file, url] of objectUrls) {
			if (!currentFiles.has(file)) {
				URL.revokeObjectURL(url);
				objectUrls.delete(file);
			}
		}
	});

	onMount(() => {
		return () => {
			for (const url of objectUrls.values()) URL.revokeObjectURL(url);
			objectUrls.clear();
		};
	});

	function messageFor(rejection: FileRejection): string {
		const key =
			rejection.reason === 'tooLarge'
				? 'form.file.tooLarge'
				: rejection.reason === 'invalidType'
					? 'form.file.invalidType'
					: 'form.file.tooMany';
		return ctx.t(key, { name: rejection.name });
	}

	function applyRejections(rejections: FileRejection[]): void {
		rejectionMessage = rejections.length > 0 ? rejections.map(messageFor).join(' ') : null;
	}

	function handleFiles(fileList: FileList | null): void {
		if (addDisabled || !schema) return;
		const files = fileList ? Array.from(fileList) : [];
		if (files.length === 0) return;

		if (multiple) {
			const current = Array.isArray(value) ? (value as FileItem[]) : [];
			const outcome = addFilesToMultiple(schema, current, files);
			applyRejections(outcome.rejections);
			onChange(outcome.value);
		} else {
			// Un `<input>` no-múltiple nunca entrega más de un fichero; un `drop` sí podría — solo
			// se considera el primero (mismo criterio que el propio input nativo).
			const current = (value ?? null) as FileItem | null;
			const outcome = setSingleFile(schema, current, files[0]);
			applyRejections(outcome.rejections);
			onChange(outcome.value);
		}
	}

	function handleInputChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		handleFiles(input.files);
		input.value = ''; // permite re-seleccionar el MISMO fichero (si se quitó) y dispara `change`
	}

	function handleDragOver(event: DragEvent): void {
		if (addDisabled) return; // sin preventDefault: el navegador pinta el cursor "no permitido"
		event.preventDefault();
		dragging = true;
	}

	function handleDragLeave(): void {
		dragging = false;
	}

	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		dragging = false;
		if (addDisabled) return;
		handleFiles(event.dataTransfer?.files ?? null);
	}

	function removeItem(item: FileItem): void {
		if (inert || !schema) return;
		onChange(multiple ? removeFromMultiple(items, item) : null);
	}

	/** `src` de preview para `item`: cacheado por `File` (evita crear un object URL nuevo en cada
	 *  render), o `ctx.port.fileUrl` para una `FileRef` — `null` sin identidad de registro (widget
	 *  degradado, ver cabecera) o si `identity.id` es `null` (modo `/new`, sin refs existentes que
	 *  previsualizar por contrato). */
	function previewSrcFor(item: FileItem): string | null {
		if (isNewFile(item)) {
			let url = objectUrls.get(item);
			if (!url) {
				url = URL.createObjectURL(item);
				objectUrls.set(item, url);
			}
			return url;
		}
		if (!identity || identity.id === null) return null;
		const opts = ctx.port.capabilities.thumbs
			? { thumb: { width: 120, height: 120, fit: 'crop' as const } }
			: undefined;
		return ctx.port.fileUrl({ type: identity.type, id: identity.id }, field.name, item, opts);
	}

	/** Fallback imagen→chip (Audit Finding 4): una `FileRef` clasificada como imagen por
	 *  extensión que en realidad no carga (extensión ambigua/incorrecta) degrada a chip. */
	function handleImageError(item: FileItem): void {
		failedImages.add(item);
	}
</script>

<div class="vega-widget-file" data-widget="file" data-invalid={error ? 'true' : undefined}>
	<!-- `role="presentation"` (deliberado, no un silenciador de a11y): esta capa es puramente
	     decorativa/de conveniencia para ampliar el área de `drop` — el ÚNICO control real, y el
	     que de verdad es operable por teclado, es el `<input type="file">` de dentro. -->
	<div
		class="vega-file-dropzone"
		class:vega-file-dropzone--dragging={dragging}
		data-inert={addDisabled ? 'true' : undefined}
		role="presentation"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		<input
			id={ids.inputId}
			type="file"
			class="vega-file-input"
			accept={schema ? acceptAttr(schema) : undefined}
			{multiple}
			disabled={addDisabled}
			onchange={handleInputChange}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
		/>
		<p class="vega-file-hint">{ctx.t('form.file.dropHint')}</p>
	</div>

	{#if rejectionMessage}
		<p id={rejectionId} class="vega-file-rejection" role="alert">{rejectionMessage}</p>
	{/if}

	{#if items.length > 0}
		<ul class="vega-file-list">
			{#each items as item (item)}
				{@const isImage = classifyItem(item) === 'image' && !failedImages.has(item)}
				{@const src = isImage ? previewSrcFor(item) : null}
				<li class="vega-file-item">
					{#if isImage && src}
						<img
							{src}
							alt={itemDisplayName(item)}
							class="vega-file-thumb"
							onerror={() => handleImageError(item)}
						/>
					{:else}
						<span class="vega-file-chip" title={itemDisplayName(item)}>{itemDisplayName(item)}</span
						>
					{/if}
					{#if !inert}
						<button
							type="button"
							class="vega-file-remove"
							onclick={() => removeItem(item)}
							aria-label={ctx.t('form.file.removeLabel', { name: itemDisplayName(item) })}
						>
							{ctx.t('form.file.remove')}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="vega-file-empty">{ctx.t('form.file.empty')}</p>
	{/if}
</div>

<style>
	.vega-widget-file {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-file-dropzone {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.6rem;
		border: 1px dashed var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-file-dropzone--dragging {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.vega-file-dropzone[data-inert='true'] {
		opacity: 0.6;
	}

	.vega-file-input:disabled {
		cursor: not-allowed;
	}

	.vega-file-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-2);
	}

	.vega-file-rejection {
		margin: 0;
		font-size: 0.85rem;
		color: var(--danger);
	}

	.vega-file-empty {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-file-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-file-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
	}

	.vega-file-thumb {
		width: 2.5rem;
		height: 2.5rem;
		object-fit: cover;
		border-radius: 4px;
	}

	.vega-file-chip {
		font-size: 0.85rem;
		color: var(--ink);
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-file-remove {
		border: none;
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
	}

	.vega-widget-file[data-invalid='true'] .vega-file-dropzone {
		border-color: var(--danger);
	}
</style>
