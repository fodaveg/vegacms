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
	 *   `ctx.port.capabilities.thumbs` — y, dentro de eso, `120x120` SOLO si `schema.thumbs` lo
	 *   declaró (`selectThumbSpec`, `$lib/backend/thumb-select.ts`, hallazgo p2); si no, cae a
	 *   `100x100` en vez de pedir a ciegas el tamaño que PB serviría como ORIGINAL completo.
	 *   Imagen (mime o, para una `FileRef`, extensión —
	 *   `classifyItem`) → `<img>`, con `onerror` degradando a chip (extensión ambigua/incorrecta);
	 *   cualquier otra cosa → chip con su nombre. `alt`/`title` (fix de code-review, a11y): el
	 *   `<img>` lleva `alt={itemDisplayName(item)}` (nunca `alt=""` — en readonly/disabled el botón
	 *   "Quitar" con el nombre desaparece, así que la imagen es la ÚNICA fuente de ese nombre para
	 *   un lector de pantalla) y el chip lleva `title` (nombre completo al pasar el ratón, el texto
	 *   visible se trunca por CSS). Una imagen ya copiada a Medios con texto alternativo lleva ESE
	 *   texto como `alt` (lámina 5, estado 5.5).
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
	 * - **Aviso de texto alternativo (audit del 23 sep, lámina pieza 3; decidido: SOLO
	 *   informativo)**: si el picker marca un resultado con `missingAlt` (imagen sin alt en la
	 *   biblioteca, la regla la aplica `MediaPicker`), su fila se bordea en `--warning` y debajo sale
	 *   un aviso con `role="status"`. Solo vive en la sesión en que se elige: se recuerda el `File`
	 *   concreto (`pickedWithoutAlt`, un `WeakSet`), y en cuanto `RecordForm` reasienta el valor tras
	 *   guardar —`FileRef` en vez de `File`— o el fichero se quita, deja de casar y el aviso se va.
	 *   Al recargar el registro ya no se puede calcular (el campo no guarda alt ni `mediaId`), y el
	 *   editor no puede arreglarlo desde aquí: por eso informa y no ofrece ninguna acción.
	 * - **Imagen subida desde el campo: texto alternativo y copia en Medios (lote 12, lámina 5;
	 *   reglas en `file-library-copy.ts`)**: si hay biblioteca y permiso de crear en ella
	 *   (`libraryCopyTarget`), cada fichero NUEVO que llega por la zona o el input (no de la
	 *   biblioteca, que ya está allí) queda apuntado para copiarse a `vega_media` al guardar el
	 *   registro, y si es una imagen su fila se despliega con un campo «Texto alternativo»
	 *   (`GrowingTextarea`, el mismo control que crece del título) que recibe el foco nada más
	 *   elegirla. Vacío AVISA (borde `--warning` y la misma frase de la ficha de Medios en la región
	 *   `status`) pero no bloquea: un texto obligatorio acaba siendo «imagen». La copia la hace el
	 *   gancho `copyToLibrary`, apuntado en el registro de `after-save.ts` que publica `RecordForm`:
	 *   corre con el registro YA escrito y el formulario aún deshabilitado («Guardando en Medios…»),
	 *   por `uploadMediaFile` — el mismo camino que la zona de subida de `/media`: reducir, validar
	 *   el tope sobre lo reducido y crear, aquí con `alt`. El resultado se guarda por `FileRef`
	 *   (`matchSavedRefs`) para que, cuando `RecordForm` reasiente el valor, la fila siga diciendo
	 *   «En Medios, con texto alternativo» o el error con «reintentar». El texto, una vez copiado,
	 *   se edita en la ficha de Medios, que es la fuente; aquí deja de pedirse. Si la copia falla el
	 *   registro NO se deshace: el aviso se queda en la fila (edición) o, al crear —la ruta navega
	 *   al registro nuevo y este widget se desmonta—, va al toast de error, que persiste hasta
	 *   descartarlo. Un fichero que la biblioteca no admite por tipo no se copia (ese campo sí lo
	 *   admitía: no es un error del usuario); uno que no es imagen se copia sin pedir texto y sin
	 *   línea de estado (lámina, estado 5.7).
	 *
	 * LANDMINE (object URLs): un `$effect` reconcilia `objectUrls` cada vez que `items` cambia —
	 * revoca cualquier entrada cuyo `File` ya no aparezca en el value actual (cubre TANTO quitar un
	 * fichero explícitamente COMO que `RecordForm` reasiente `current` tras guardar, que reemplaza
	 * los `File` pendientes por las `FileRef` reales sin pasar por `removeItem`) — y el cleanup de
	 * `onMount` revoca lo que quede al desmontar. `objectUrls` es un `Map` PLANO (no `$state`,
	 * mismo patrón que `pendingTitleFetches` de `Relation.svelte`): sus claves son `File`, que
	 * Svelte 5 NUNCA proxifica (`to-record-input.ts` lo documenta), así que envolver el propio Map
	 * en reactividad no aporta nada y solo complica el tipo. `altByFile` y `copyState` SÍ son
	 * `SvelteMap` (el template los lee) y se reconcilian con el mismo `$effect`.
	 */
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getFieldScope } from '../field-scope';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { VegaRecord } from '$lib/backend/types';
	import Icon from '$lib/icons/Icon.svelte';
	import GrowingTextarea from '../GrowingTextarea.svelte';
	import { getAfterSaveRegistry } from '../after-save';
	import { getRecordIdentity } from '../record-context';
	import { selectThumbSpec } from '$lib/backend/thumb-select';
	import type { MediaFileFieldSchema } from '$lib/media/media-upload';
	import {
		mediaUploadErrorMessage,
		uploadMediaFile,
		type ShrinkFn
	} from '$lib/media/media-upload-file';
	import { shrinkImage } from '$lib/media/shrink-image';
	import { browserShrinkDeps } from '$lib/media/shrink-image-browser';
	import {
		acceptAttr,
		addFilesToMultiple,
		classifyFile,
		classifyItem,
		isNewFile,
		itemDisplayName,
		removeFromMultiple,
		setSingleFile,
		type FileItem,
		type FileRejection
	} from './file-value';
	import {
		asksForAlt,
		libraryCopyTarget,
		matchSavedRefs,
		shouldCopyToLibrary
	} from './file-library-copy';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const identity = getRecordIdentity(); // null = fuera de un RecordForm (degradado, ver cabecera)
	const afterSave = getAfterSaveRegistry(); // null = fuera de un RecordForm: sin copia a Medios

	const fieldScope = getFieldScope();
	const ids = $derived(fieldIds(field.name, fieldScope));
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
	/** Raíz del widget: solo para llevar el foco al texto alternativo recién pintado. */
	let rootEl: HTMLDivElement | undefined;
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
	// quitar un fichero Y que `RecordForm` reasiente `current` tras guardar. Con el mismo gesto se
	// olvidan el texto alternativo y el estado de copia de lo que ya no está en el valor (las
	// entradas por `FileRef` que el gancho dejó para después de guardar SÍ están y se conservan).
	$effect(() => {
		const present = new Set<FileItem>(items);
		for (const [file, url] of objectUrls) {
			if (!present.has(file)) {
				URL.revokeObjectURL(url);
				objectUrls.delete(file);
			}
		}
		untrack(() => {
			for (const key of [...altByFile.keys()]) if (!present.has(key)) altByFile.delete(key);
			for (const key of [...copyState.keys()]) if (!present.has(key)) copyState.delete(key);
		});
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
	 * `source` solo decide si lo aceptado se apunta para copiarse a Medios (lámina 5): lo que viene
	 * de la biblioteca ya está allí.
	 */
	function applyNewFiles(files: File[], source: 'upload' | 'library'): void {
		if (addDisabled || !schema || files.length === 0) return;

		let next: FileItem[] | FileItem | null;
		if (multiple) {
			const current = Array.isArray(value) ? (value as FileItem[]) : [];
			const outcome = addFilesToMultiple(schema, current, files);
			applyRejections(outcome.rejections);
			next = outcome.value;
		} else {
			// Un `<input>` no-múltiple nunca entrega más de un fichero; un `drop`/el picker sí
			// podrían — solo se considera el primero (mismo criterio que el propio input nativo).
			const current = (value ?? null) as FileItem | null;
			const outcome = setSingleFile(schema, current, files[0]);
			applyRejections(outcome.rejections);
			next = outcome.value;
		}

		const accepted = files.filter((file) =>
			Array.isArray(next) ? next.includes(file) : next === file
		);
		// ANTES de `onChange`: cuando `items` cambie y el template lo relea, la pertenencia ya está.
		const firstWithAlt = source === 'upload' ? markForLibraryCopy(accepted) : null;
		onChange(next);
		if (firstWithAlt) void focusAlt(firstWithAlt);
	}

	function handleFiles(fileList: FileList | null): void {
		applyNewFiles(fileList ? Array.from(fileList) : [], 'upload');
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

	/** `File`s traídos de la biblioteca que allí no tienen texto alternativo (ver cabecera). Un
	 *  `WeakSet` plano y no reactivo: se escribe ANTES de `onChange`, así que cuando `items` cambia
	 *  y el template lo relee, la pertenencia ya está puesta; y no retiene un `File` que el valor
	 *  ya soltó. */
	const pickedWithoutAlt = new WeakSet<File>();
	/** Filas que llevan el aviso de biblioteca ahora mismo: solo `File`s nuevos de esta sesión. */
	const libraryMissingAltCount = $derived(
		items.filter((item) => isNewFile(item) && pickedWithoutAlt.has(item)).length
	);

	async function handlePickFromLibrary(): Promise<void> {
		if (!ctx.mediaPicker || addDisabled || !schema || pickingFromLibrary) return;
		pickingFromLibrary = true;
		try {
			const results = await ctx.mediaPicker.open({ multiple, accept: schema.mimeTypes });
			// `null` = cancelado (D-P6.6); un array vacío no debería llegar nunca (el picker exige
			// al menos un elegido para habilitar "Insertar"), pero `applyNewFiles` ya es un no-op
			// con `files.length === 0` — defensivo, no hace falta un guard explícito aquí.
			if (results) {
				for (const result of results) {
					if (result.missingAlt) pickedWithoutAlt.add(result.file);
				}
				applyNewFiles(
					results.map((r) => r.file),
					'library'
				);
			}
		} finally {
			pickingFromLibrary = false;
		}
	}

	// ————— Texto alternativo y copia a Medios (lote 12, lámina 5) —————

	/** Estado de la copia de UN fichero a Medios. Antes de guardar la clave es el `File`; el gancho
	 *  deja además una entrada por su `FileRef` para después de reasentar el valor. */
	type LibraryCopyState =
		| { kind: 'pending' }
		| { kind: 'uploading' }
		| { kind: 'done'; alt: string }
		/** Conserva el `File` y su texto para «reintentar» desde la fila ya guardada. */
		| { kind: 'error'; message: string; file: File; alt: string };

	/** Campo `file` de `vega_media` si hay biblioteca y permiso de crear en ella; `null` = todo
	 *  como antes de este lote (ni texto ni copia). Fuera de un `RecordForm` no hay guardado al
	 *  que engancharse, así que tampoco. */
	const copyTarget = $derived<MediaFileFieldSchema | null>(
		afterSave ? libraryCopyTarget(ctx.model.types) : null
	);

	/** Texto alternativo escrito para cada imagen NUEVA subida desde el campo. */
	const altByFile = new SvelteMap<File, string>();
	/** Estado de la copia a Medios por fichero (ver `LibraryCopyState`). */
	const copyState = new SvelteMap<FileItem, LibraryCopyState>();
	/** Clave estable por `File` para los `id` del DOM (un `File` no tiene ninguna). */
	const fileKeys = new WeakMap<File, string>();
	let nextFileKey = 0;

	function keyFor(file: File): string {
		let key = fileKeys.get(file);
		if (!key) {
			nextFileKey += 1;
			key = String(nextFileKey);
			fileKeys.set(file, key);
		}
		return key;
	}

	/** La reducción del navegador, la misma que usa la zona de subida de `/media`. */
	const browserShrink: ShrinkFn = (file, options) => shrinkImage(file, browserShrinkDeps, options);

	/** Apunta los ficheros aceptados para copiarse a Medios y abre el texto alternativo de las
	 *  imágenes. Devuelve la primera imagen que pide texto (para llevarle el foco), o `null`. */
	function markForLibraryCopy(accepted: File[]): File | null {
		if (!copyTarget) return null;
		let first: File | null = null;
		for (const file of accepted) {
			if (!shouldCopyToLibrary(copyTarget, file)) continue;
			copyState.set(file, { kind: 'pending' });
			if (asksForAlt(copyTarget, file)) {
				altByFile.set(file, '');
				first ??= file;
			}
		}
		return first;
	}

	/** El foco entra en el texto alternativo nada más elegir la imagen (lámina 5, estado 5.2). */
	async function focusAlt(file: File): Promise<void> {
		await tick();
		rootEl?.querySelector<HTMLTextAreaElement>(`[data-alt-key="${keyFor(file)}"]`)?.focus();
	}

	/** Imágenes nuevas subidas desde el campo que siguen sin texto: avisan, no bloquean. */
	const missingAltFiles = $derived(
		items.filter(
			(item): item is File => isNewFile(item) && (altByFile.get(item)?.trim() ?? 'x') === ''
		)
	);

	/** Sube `file` a Medios con `alt` por el camino único (`uploadMediaFile`) y lo traduce al estado
	 *  de la fila. Nunca lanza. */
	async function runCopy(
		file: File,
		alt: string,
		target: MediaFileFieldSchema
	): Promise<LibraryCopyState> {
		try {
			const result = await uploadMediaFile(ctx.port, target, file, { shrink: browserShrink, alt });
			if (result.kind === 'rejected') {
				return {
					kind: 'error',
					message: ctx.t(`media.upload.reason.${result.reason}`),
					file,
					alt
				};
			}
			return { kind: 'done', alt };
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al subir el fichero', err);
			// La sesión caducada es feedback GLOBAL (overlay de re-login), como en el resto de la app;
			// la fila guarda igualmente su error para poder reintentar tras reentrar.
			if (vegaErr.kind === 'auth-expired') {
				ctx.feedback.reportError(vegaErr, { action: 'media:upload' });
			}
			return { kind: 'error', message: mediaUploadErrorMessage(vegaErr), file, alt };
		}
	}

	/**
	 * Gancho tras guardar (`after-save.ts`): copia a Medios, uno a uno, los ficheros apuntados que
	 * siguen en el valor, con su texto. Corre con el registro YA escrito y antes de que `RecordForm`
	 * reasiente el valor, así que `items` todavía trae los `File` (su fila enseña «Guardando en
	 * Medios…») y el resultado se deja TAMBIÉN bajo la `FileRef` que el backend les dio
	 * (`matchSavedRefs`), que es la clave que sobrevive al reasiento. Devuelve la frase del toast.
	 */
	async function copyToLibrary(saved: VegaRecord): Promise<string | undefined> {
		const target = copyTarget;
		if (!target) return undefined;
		const pending = items.filter(
			(item): item is File => isNewFile(item) && copyState.get(item)?.kind === 'pending'
		);
		if (pending.length === 0) return undefined;

		const refs = matchSavedRefs(items, saved.values[field.name]);
		let copied = 0;
		const failures: string[] = [];
		for (const file of pending) {
			copyState.set(file, { kind: 'uploading' });
			const alt = altByFile.get(file)?.trim() ?? '';
			const result = await runCopy(file, alt, target);
			copyState.set(file, result);
			const ref = refs.get(file);
			if (ref !== undefined) copyState.set(ref, result);
			if (result.kind === 'done') copied += 1;
			else if (result.kind === 'error') failures.push(result.message);
		}

		// Al crear, la ruta navega al registro nuevo y este widget se desmonta: la fila no puede
		// quedarse con el error, así que va al toast (persistente hasta descartar, ver cabecera).
		if (failures.length > 0 && identity?.id === null) {
			for (const message of failures) {
				ctx.feedback.toast(ctx.t('form.file.libraryError', { message }), { kind: 'error' });
			}
		}

		if (copied === 0) return undefined;
		if (copied > 1) return ctx.t('form.file.copiedMany', { count: copied });
		const only = pending.find((file) => copyState.get(file)?.kind === 'done');
		return ctx.t(
			only && classifyFile(only) === 'image' ? 'form.file.copiedOne' : 'form.file.copiedOneFile'
		);
	}

	/** «reintentar» desde la fila ya guardada (lámina 5, estado 5.6). */
	async function retryCopy(item: FileItem): Promise<void> {
		const state = copyState.get(item);
		const target = copyTarget;
		if (!state || state.kind !== 'error' || !target) return;
		copyState.set(item, { kind: 'uploading' });
		copyState.set(item, await runCopy(state.file, state.alt, target));
	}

	onMount(() => afterSave?.register(copyToLibrary));

	/** `alt` del `<img>`: el texto ya copiado a Medios si lo hay; si no, el nombre (ver cabecera). */
	function imgAlt(item: FileItem): string {
		const state = copyState.get(item);
		if (state?.kind === 'done' && state.alt !== '') return state.alt;
		return itemDisplayName(item);
	}

	/** `true` si la fila se despliega (lámina 5): una imagen nueva que pide texto, o una ya guardada
	 *  cuya copia a Medios tiene algo que contar. Un fichero que no es imagen nunca se despliega. */
	function expanded(item: FileItem, isImage: boolean): boolean {
		if (isNewFile(item)) return altByFile.has(item);
		return isImage && copyState.has(item);
	}

	/** Escritura del texto alternativo desde la fila; solo un `File` nuevo lo tiene editable. */
	function setAlt(item: FileItem, next: string): void {
		if (isNewFile(item) && altByFile.has(item)) altByFile.set(item, next);
	}

	/** Borde de aviso: imagen nueva sin texto alternativo, venga de la biblioteca o del campo. */
	function warns(item: FileItem): boolean {
		return isNewFile(item) && (pickedWithoutAlt.has(item) || missingAltFiles.includes(item));
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
		// `120x120` solo si el propio campo lo declaró (`schema.thumbs`, hallazgo p2); si no,
		// `selectThumbSpec` cae a `100x100` (el único tamaño que PB sirve siempre) en vez de pedir
		// a ciegas un tamaño que devolvería el fichero ORIGINAL completo.
		const opts = ctx.port.capabilities.thumbs
			? { thumb: selectThumbSpec({ width: 120, height: 120, fit: 'crop' }, schema?.thumbs) }
			: undefined;
		return ctx.port.fileUrl({ type: identity.type, id: identity.id }, field.name, item, opts);
	}

	/** Fallback imagen→chip (Audit Finding 4): una `FileRef` clasificada como imagen por
	 *  extensión que en realidad no carga (extensión ambigua/incorrecta) degrada a chip. */
	function handleImageError(item: FileItem): void {
		failedImages.add(item);
	}
</script>

<div
	bind:this={rootEl}
	class="vega-widget-file"
	data-widget="file"
	data-invalid={error ? 'true' : undefined}
>
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
		<!-- Estado CON ficheros: lista de previsualizaciones/chips + "Quitar". Una imagen nueva que
		     pide texto alternativo, o una ya copiada a Medios, ocupa la fila entera (lámina 5). -->
		<ul class="vega-file-list">
			{#each items as item (item)}
				{@const isImage = classifyItem(item) === 'image' && !failedImages.has(item)}
				{@const src = isImage ? previewSrcFor(item) : null}
				{@const isExpanded = expanded(item, isImage)}
				{@const altText = isNewFile(item) ? altByFile.get(item) : undefined}
				{@const copy = copyState.get(item)}
				{@const altKey = isNewFile(item) ? keyFor(item) : ''}
				{@const altId = `${ids.inputId}-alt-${altKey}`}
				{@const altHelpId = `${altId}-help`}
				<li
					class="vega-file-item"
					class:vega-file-item--alt={isExpanded}
					class:vega-file-item--warn={warns(item)}
				>
					{#if isImage && src}
						<img
							{src}
							alt={imgAlt(item)}
							class="vega-file-thumb"
							onerror={() => handleImageError(item)}
						/>
					{:else if isExpanded}
						<!-- Sin imagen que pintar (todavía no carga, o falló): el bloque con icono de la
						     lámina ocupa el sitio de la miniatura para que la fila no baile. -->
						<span class="vega-file-thumb vega-file-thumb--placeholder" aria-hidden="true">
							<Icon id="media" size={22} />
						</span>
					{:else}
						<span class="vega-file-chip" title={itemDisplayName(item)}>{itemDisplayName(item)}</span
						>
					{/if}

					{#if isExpanded}
						<div class="vega-file-item-body">
							<div class="vega-file-item-head">
								<span class="vega-file-chip" title={itemDisplayName(item)}
									>{itemDisplayName(item)}</span
								>
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
							</div>

							{#if altText !== undefined}
								<label class="vega-file-alt-label" for={altId}>{ctx.t('form.file.altLabel')}</label>
								<!-- El mismo control que crece del título (lámina 4): una descripción es una
								     frase y en la columna lateral no cabe en una línea. -->
								<GrowingTextarea
									id={altId}
									class="vega-widget-text vega-file-alt-input"
									value={altText}
									onChange={(next) => setAlt(item, next)}
									{disabled}
									data-alt-key={altKey}
									aria-describedby={altText.trim() === '' ? altHelpId : undefined}
								/>
								{#if altText.trim() === ''}
									<!-- La ayuda de la ficha de Medios; desaparece al escribir (lámina, estado 5.3). -->
									<p id={altHelpId} class="vega-file-alt-help">{ctx.t('media.detail.altHelp')}</p>
								{/if}
							{/if}

							{#if copy?.kind === 'pending'}
								<p class="vega-file-library-state">{ctx.t('form.file.libraryPending')}</p>
							{:else if copy?.kind === 'uploading'}
								<p class="vega-file-library-state" data-state="uploading">
									{ctx.t('form.file.libraryUploading')}
								</p>
							{:else if copy?.kind === 'done'}
								<p class="vega-file-library-state" data-state="done">
									<Icon id="check" size={12} />
									{copy.alt !== ''
										? ctx.t('form.file.libraryDone')
										: ctx.t('form.file.libraryDoneNoAlt')}
								</p>
							{:else if copy?.kind === 'error'}
								<!-- Son dos escrituras y la segunda puede fallar sola: el registro no se deshace y
								     el aviso se queda aquí hasta reintentar o quitar la imagen. -->
								<p class="vega-file-library-state" data-state="error" role="alert">
									<span>{ctx.t('form.file.libraryError', { message: copy.message })} ·</span>
									<button
										type="button"
										onclick={() => retryCopy(item)}
										aria-label={ctx.t('form.file.libraryRetryLabel', {
											name: itemDisplayName(item)
										})}
									>
										{ctx.t('form.file.libraryRetry')}
									</button>
								</p>
							{/if}
						</div>
					{:else if !inert}
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

	<!-- Informativo (ver cabecera): `role="status"`, nunca `alert` — avisa, no bloquea. La región
	     existe SIEMPRE para que el lector de pantalla anuncie el aviso cuando aparece (una región
	     viva recién insertada con su texto no se anuncia de forma fiable); vacía, sale del flujo
	     (ver CSS) y no añade hueco al campo. -->
	<div class="vega-file-alt-status" role="status">
		<!-- UN solo bloque: dos `{#if}` hermanos (o un `{#each}` vacío) dejan nodos ancla y la
		     región dejaría de ser `:empty` (ver CSS). -->
		{#if libraryMissingAltCount > 0 || missingAltFiles.length > 0}
			{#if libraryMissingAltCount > 0}
				<p class="vega-file-alt-warn">
					<Icon id="warning" size={12} />
					<span>
						{libraryMissingAltCount === 1
							? ctx.t('form.file.libraryMissingAltOne')
							: ctx.t('form.file.libraryMissingAltMany', { count: libraryMissingAltCount })}
					</span>
				</p>
			{/if}
			<!-- La misma frase que la ficha de Medios para una imagen sin texto (lámina 5, 5.2). -->
			{#each missingAltFiles as file (file)}
				<p class="vega-file-alt-warn">
					<Icon id="warning" size={12} />
					<span>{ctx.t('media.detail.altMissingHint', { name: file.name })}</span>
				</p>
			{/each}
		{/if}
	</div>
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
		/* `--ink-3` es el mismo 2,20:1 (medido) bajo AA que `.vega-field-help`: esta es la única
		   instrucción de cómo operar el campo ("arrastra o haz clic"), no algo decorativo. */
		color: var(--ink-2);
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
		/* Sin `opacity` extra: sobre `--ink-2` (ver `.vega-file-dropzone`) bajaría de nuevo por
		   debajo de AA (0,8 de opacidad da ~3,7:1); el tamaño reducido ya lo distingue del hint. */
		font-size: 0.86em;
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

	/* Imagen sin texto alternativo: traída de la biblioteca sin él (lámina del audit, pieza 3) o
	   subida desde el campo y todavía sin describir (lámina 5). Avisa, no bloquea. */
	.vega-file-item--warn {
		border-color: var(--warning);
	}

	/* ——— Lámina 5 · imagen subida desde el campo ——— */

	/* Una imagen NUEVA ocupa la fila entera de la lista: miniatura + nombre + texto alternativo. En
	   un campo múltiple, un bloque por imagen, uno debajo de otro. */
	.vega-file-item--alt {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem 0.75rem;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 0.6rem;
	}

	/* Miniatura y nombre arriba; el texto alternativo debajo, a todo el ancho del campo: en la
	   columna lateral (296 px) al lado de la miniatura no cabía ni media frase. */
	.vega-file-item--alt .vega-file-item-body {
		display: contents;
	}

	.vega-file-item--alt .vega-file-item-body > :not(.vega-file-item-head) {
		grid-column: 1 / -1;
	}

	/* 5rem: el doble de `.vega-file-thumb` (2.5rem). Hay que ver la imagen para describirla. */
	.vega-file-item--alt .vega-file-thumb {
		width: 5rem;
		height: 5rem;
		flex-shrink: 0;
	}

	.vega-file-item-body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.vega-file-item-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	/* El nombre recorta con puntos suspensivos y «Quitar» no se mueve (lámina 5, estado 5.9). */
	.vega-file-item-head .vega-file-chip {
		flex: 1;
		max-width: none;
		min-width: 0;
	}

	.vega-file-item-head .vega-file-remove {
		flex-shrink: 0;
	}

	/* Rótulo del campo: el de `.vega-field-row > label` (`FieldRow.svelte`). */
	.vega-file-alt-label {
		font-size: 0.82em;
		font-weight: 650;
		letter-spacing: 0.03em;
		color: var(--ink-2);
	}

	/* La caja la pone `.vega-widget-text` (global, `Text.svelte`); aquí solo lo que la lámina añade.
	   `:global` porque el `<textarea>` lo pinta `GrowingTextarea`, otro componente: la regla de
	   arriba (`> :not(.vega-file-item-head)`) lleva la clase de ámbito de ESTE componente y no le
	   llega, así que sin esto el textarea se queda en la columna de la miniatura (5 rem de ancho). */
	.vega-file-item--alt :global(.vega-file-alt-input) {
		grid-column: 1 / -1;
		width: 100%;
		font-size: 0.92em;
	}

	/* La ayuda de la ficha de Medios, con los valores de `.vega-field-help` (`FieldRow.svelte`). */
	.vega-file-alt-help {
		margin: 0;
		font-size: 0.82em;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	/* Estado de la copia en Medios: mono como `.vega-media-upload-status`, con `--ink-2` (AA). */
	.vega-file-library-state {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.72em;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.vega-file-library-state :global(svg) {
		vertical-align: -0.15em;
	}

	.vega-file-library-state[data-state='done'] {
		color: var(--success);
	}

	.vega-file-library-state[data-state='uploading'] {
		color: var(--info);
	}

	.vega-file-library-state[data-state='error'] {
		color: var(--danger);
	}

	.vega-file-library-state button {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	@media (pointer: coarse) {
		.vega-file-item--alt .vega-file-remove,
		.vega-file-library-state button {
			min-height: 44px;
			min-width: 44px;
		}
	}

	/* Región viva del aviso (ver marcado): vacía, `position: absolute` la saca del flujo —y con ello
	   del `gap` de la columna— sin sacarla del árbol de accesibilidad, como haría `display: none`. */
	.vega-file-alt-status:empty {
		position: absolute;
	}

	.vega-file-alt-status {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.vega-file-alt-warn {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		margin: 0;
		font-size: 0.84em;
		font-weight: 550;
		color: var(--warning);
	}

	.vega-file-alt-warn :global(svg) {
		flex-shrink: 0;
		margin-top: 0.15rem;
	}

	.vega-file-thumb {
		width: 2.5rem;
		height: 2.5rem;
		object-fit: cover;
		border-radius: 4px;
	}

	/* Sin imagen que pintar: el bloque tintado con icono que usa la lámina (y `MediaUpload`). */
	.vega-file-thumb--placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(140deg, var(--accent-soft), var(--surface-2));
		color: var(--accent-text);
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
