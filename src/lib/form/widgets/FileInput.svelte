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
	 * - **Subida directa + drag&drop**: el `<input type="file">` sigue siendo el ÚNICO control real
	 *   (foco-able, con el `<label for>` de `FieldRow` dándole nombre accesible, y la única
	 *   superficie que ejercitan los e2e con `setInputFiles`), pero desde el mockup final
	 *   `aquelarre-detalle-post.html` (`.cover`) queda OCULTO VISUALMENTE — clip de 1px, NUNCA
	 *   `display:none`, que lo sacaría del orden de foco y del árbol de accesibilidad — y quien se
	 *   ve es una ZONA punteada que lo dispara al hacer click y que acepta `dragover`/`drop`.
	 *   Misma técnica y mismo motivo que `MediaUpload.svelte` en `/media`: el chrome nativo del
	 *   `<input type="file">` ("Seleccionar archivo | Ningún archivo seleccionado") lo pinta el
	 *   sistema operativo, ignora el tema por completo y era lo más feo de la pantalla. La
	 *   validación cliente (`maxSizeBytes`/`mimeTypes`, `file-value.ts`) es SOLO-UX — el backend
	 *   re-valida de verdad (§9.9) — así que un rechazo se pinta en un párrafo local
	 *   (`rejectionMessage`, `role="alert"`), NUNCA en el `error` de campo (ese slot lo llena
	 *   `RecordForm`/backend, D-P5.1 no da margen para que un widget lo escriba él mismo).
	 * - **Dos formas de la zona**: VACÍA = el bloque del mockup (16/9, icono + copy centrados, la
	 *   única cosa que se ve en el campo); CON ficheros = una banda fina sobre la lista/preview,
	 *   que NO cambia (solo así un campo múltiple sigue pudiendo añadir el segundo fichero). El
	 *   `aspect-ratio` lleva `max-height`: 16/9 sobre una tarjeta de aside de ~296px da el
	 *   rectángulo del mockup, pero sobre un campo a ancho completo daría un cajón de 400px.
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
	 * - **Picker de biblioteca (Fase P6·6e, D-P6.6, cablea el punto de extensión que F5-f dejó
	 *   documentado)**: si `ctx.mediaPicker` existe, un botón "Elegir de la biblioteca" abre
	 *   `MediaPicker.svelte` (montado UNA vez en el shell, `+layout.svelte`) vía
	 *   `ctx.mediaPicker.open({ multiple, accept: schema.mimeTypes })`. Su AUSENCIA
	 *   (`ctx.mediaPicker` `undefined`) oculta el botón SIN error (L-P6.9): el resto del widget
	 *   sigue funcionando IDÉNTICO. **INVARIANTE L-P6.8 (no negociable)**: el picker devuelve
	 *   `MediaPickResult[]` (`{file, mediaId, alt}`) — SOLO `result.file` (un `File` real, bytes ya
	 *   descargados) entra en `value`, por el MISMO camino que una subida nueva
	 *   (`addFilesToMultiple`/`setSingleFile`, `applyNewFiles` más abajo); `mediaId` NUNCA se
	 *   persiste (recrearía la referencia fantasma que el audit H3 declara inexistente para
	 *   `filePerRecord`) y `alt` se IGNORA (este widget edita un campo `file` de un registro de
	 *   usuario, que no tiene por contrato un campo `alt` propio asociado — [SUP-5], decisión: sin
	 *   dónde ponerlo, no se fuerza).
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
	import Icon from '$lib/icons/Icon.svelte';
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
	/** El `<input type="file">` real (oculto visualmente, ver cabecera): la zona punteada lo
	 *  dispara con `.click()`. Variable PLANA (`bind:this` sobre un nodo que solo se usa de forma
	 *  imperativa, mismo criterio que `formEl` en `RecordForm.svelte`). */
	let inputEl: HTMLInputElement | undefined;
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

	/**
	 * Núcleo compartido de "añadir ficheros nuevos" (Fase P6·6e, fix code-review): subida
	 * directa/drag&drop (`handleFiles`) Y el picker de biblioteca (`handlePickFromLibrary`) llegan
	 * aquí con un `File[]` ya en mano — cada `File` pasa por la MISMA validación cliente
	 * (`addFilesToMultiple`/`setSingleFile`, `maxSizeBytes`/`mimeTypes`/`maxSelect`), sin importar
	 * si vino de `<input type="file">`, un `drop` o la biblioteca (INVARIANTE L-P6.8: el picker
	 * entrega `File`, nunca un `FileRef` ajeno, así que este único camino de escritura basta).
	 */
	function applyNewFiles(files: File[]): void {
		if (addDisabled || !schema || files.length === 0) return;

		if (multiple) {
			const current = Array.isArray(value) ? (value as FileItem[]) : [];
			const outcome = addFilesToMultiple(schema, current, files);
			applyRejections(outcome.rejections);
			onChange(outcome.value);
		} else {
			// Un `<input>` no-múltiple nunca entrega más de un fichero; un `drop`/el picker sí
			// podrían — solo se considera el primero (mismo criterio que el propio input nativo).
			const current = (value ?? null) as FileItem | null;
			const outcome = setSingleFile(schema, current, files[0]);
			applyRejections(outcome.rejections);
			onChange(outcome.value);
		}
	}

	function handleFiles(fileList: FileList | null): void {
		applyNewFiles(fileList ? Array.from(fileList) : []);
	}

	function handleInputChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		handleFiles(input.files);
		input.value = ''; // permite re-seleccionar el MISMO fichero (si se quitó) y dispara `change`
	}

	/** Click en la zona punteada → abre el selector del sistema disparando el input REAL (ver
	 *  cabecera). No-op si el campo no admite añadir (readonly/guardando/`maxSelect` alcanzado). */
	function openFilePicker(): void {
		if (addDisabled) return;
		inputEl?.click();
	}

	// ————— Picker de biblioteca (Fase P6·6e, D-P6.6) —————

	/** `true` mientras `ctx.mediaPicker.open(...)` está en vuelo: deshabilita el botón para evitar
	 *  una segunda apertura mientras la primera sigue sin resolver (el store la cancelaría de
	 *  todos modos, `media-picker-state.svelte.ts`, pero un botón inerte es más honesto). */
	let pickingFromLibrary = $state(false);

	async function handlePickFromLibrary(): Promise<void> {
		if (!ctx.mediaPicker || addDisabled || !schema || pickingFromLibrary) return;
		pickingFromLibrary = true;
		try {
			const results = await ctx.mediaPicker.open({ multiple, accept: schema.mimeTypes });
			// `null` = cancelado (D-P6.6); un array vacío no debería llegar nunca (el picker exige
			// al menos un elegido para habilitar "Insertar"), pero `applyNewFiles` ya es un no-op
			// con `files.length === 0` — defensivo, no hace falta un guard explícito aquí.
			if (results) applyNewFiles(results.map((r) => r.file));
		} finally {
			pickingFromLibrary = false;
		}
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
	<!-- Control REAL (ver cabecera): oculto VISUALMENTE, pero sigue en el orden de foco, conserva
	     el nombre accesible que le da el `<label for>` de `FieldRow` y sigue siendo lo que los e2e
	     ejercitan con `setInputFiles`. -->
	<input
		bind:this={inputEl}
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

	<!-- Zona punteada (mockup `.cover`): un `<button>` de verdad, no un `<div role="presentation">`
	     — desde que el input no se ve, ESTA es la afordancia visible de "elegir fichero", así que
	     tiene que ser operable por teclado por sí misma (mismo criterio que la banda de arrastre de
	     `MediaUpload.svelte`). `data-inert` se conserva como gancho de estado (CSS + e2e). -->
	<button
		type="button"
		class="vega-file-dropzone"
		class:vega-file-dropzone--empty={items.length === 0}
		class:vega-file-dropzone--dragging={dragging}
		data-inert={addDisabled ? 'true' : undefined}
		disabled={addDisabled}
		onclick={openFilePicker}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		<Icon id="media" size={22} />
		<span class="vega-file-hint">{ctx.t('form.file.dropHint')}</span>
		{#if items.length === 0}
			<!-- "Sin ficheros": el estado del campo, dentro de la propia zona en vez de como un
			     párrafo suelto debajo (el mockup tiene UN solo bloque). -->
			<span class="vega-file-empty">{ctx.t('form.file.empty')}</span>
		{/if}
	</button>

	{#if ctx.mediaPicker}
		<!-- Fase P6·6e (D-P6.6, L-P6.9): oculto por completo sin `ctx.mediaPicker` — nunca un botón
		     deshabilitado sin explicación. -->
		<button
			type="button"
			class="vega-file-pick-library"
			onclick={handlePickFromLibrary}
			disabled={addDisabled || pickingFromLibrary}
		>
			{ctx.t('form.file.pickFromLibrary')}
		</button>
	{/if}

	{#if rejectionMessage}
		<p id={rejectionId} class="vega-file-rejection" role="alert">{rejectionMessage}</p>
	{/if}

	{#if items.length > 0}
		<!-- Estado CON ficheros: intacto (lista de previsualizaciones/chips + "Quitar"). -->
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
	{/if}
</div>

<style>
	.vega-widget-file {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* El input REAL, oculto VISUALMENTE (ver cabecera): clip de 1px, nunca `display:none` — sigue
	   siendo foco-able, sigue en el árbol de accesibilidad y `setInputFiles` lo sigue ejercitando.
	   MISMA técnica que `.vega-media-upload-sr` en `MediaUpload.svelte`. */
	.vega-file-input {
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

	/* Zona punteada (mockup `.cover`): la afordancia visible del campo. En su forma compacta (con
	   ficheros ya añadidos) es una banda de una línea sobre la lista. */
	.vega-file-dropzone {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.6rem 0.8rem;
		border: 1px dashed var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink-3);
		font: inherit;
		font-size: 0.86em;
		line-height: 1.45;
		cursor: pointer;
	}

	/* Forma VACÍA (mockup): rectángulo 16/9 con el icono y el copy centrados en columna. El
	   `max-height` acota el caso que el mockup no tiene: el mismo widget en un campo a ancho
	   completo de la columna central, donde 16/9 daría un cajón de 400px de alto. */
	.vega-file-dropzone--empty {
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.8rem;
		aspect-ratio: 16 / 9;
		max-height: 200px;
	}

	.vega-file-dropzone:hover:not(:disabled),
	.vega-file-dropzone--dragging {
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-file-dropzone:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	/* Botón del picker de biblioteca (Fase P6·6e): mismo tratamiento que un botón secundario del
	   resto del formulario (`.vega-file-remove` es un link-button, este SÍ tiene borde propio —
	   es una acción de nivel de campo, no una acción "sobre un item" ya añadido). */
	.vega-file-pick-library {
		align-self: flex-start;
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-file-pick-library:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	/* Copy de la zona: la línea de acción (hint) manda, el estado del campo ("Sin ficheros") va
	   debajo en un punto más pequeño. Los dos heredan el color de la zona, así que el hover de
	   marca los arrastra a `--accent-text` de una pieza. */
	.vega-file-hint {
		text-align: center;
	}

	.vega-file-empty {
		font-size: 0.86em;
		opacity: 0.8;
	}

	.vega-file-rejection {
		margin: 0;
		font-size: 0.85rem;
		color: var(--danger);
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
