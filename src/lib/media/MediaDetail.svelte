<script lang="ts">
	/**
	 * `MediaDetail.svelte` (Fase P6·6b): panel MODAL para editar los metadatos de un asset de
	 * `vega_media` (`alt`/`title`/`tags`) — NUNCA el motor `RecordForm` de P5 (ese es para registros
	 * de tipos de contenido de usuario, con validación por-campo/dirty-tracking/relaciones/foco de
	 * F5-g; aquí son 3 metadatos sin relaciones ni widgets dedicados, un panel ligero de propósito
	 * único basta — "sin sobre-ingeniería" del alcance de 6b). `file`/`created` NUNCA se editan
	 * (D-P6.1: `created` es autodate readonly; `file` no tiene UI de reemplazo hasta 6c/6d).
	 *
	 * **Diálogo modal**: mismo patrón visual/estructural que `ReloginModal.svelte`/
	 * `DeleteConfirm.svelte` (backdrop + panel centrado, foco atrapado, `Esc` cierra). `role="dialog"`
	 * (no `"alertdialog"`: no hay una decisión urgente que forzar, es un editor). Vive DENTRO del
	 * árbol de `/media/+page.svelte` (nieto de `#vega-app-shell`, no su hermano) — igual que
	 * `DeleteConfirm`, por eso NO se marca `inert` el resto de la app: el backdrop `fixed` + el
	 * atrapado de `Tab` ya bastan.
	 *
	 * **Cerrar sin guardar**: si hay cambios sin guardar (`dirty`), reutiliza el MISMO gesto/copy
	 * que el guard de salida de `RecordForm` (`editor.leaveConfirm`, `window.confirm`) en vez de
	 * inventar un segundo modal de confirmación para lo mismo — precedente ya asentado en el propio
	 * repo (P5, F5-g) para "salir con cambios sin guardar".
	 *
	 * **Guardar**: `ctx.port.update('vega_media', item.id, { alt, title, tags })`. Éxito → toast +
	 * `onSaved(nuevoView)` (el llamador refresca la celda del grid) + cierra. `VegaError kind
	 * 'validation'` → mensaje en contexto (record-level, `role="alert"`; estos 3 campos no tienen
	 * restricciones propias hoy, así que en la práctica solo se alcanzaría si el backend añadiera
	 * una regla nueva); cualquier otro kind → `ctx.feedback.reportError` (global, L-P4.4-alike).
	 *
	 * **Borrar (Fase P6·6d, D-P6.5/audit H3)**: botón "Borrar" en la fila de acciones → abre
	 * `MediaDeleteConfirm` (montado SIEMPRE, hermano del `{#if item}` de más abajo — ver su propia
	 * cabecera para el porqué) con el aviso HONESTO del modelo de media (copia de bytes, no
	 * referencia: borrar el original nunca rompe una copia ya insertada en un registro). Confirmar →
	 * `ctx.port.delete('vega_media', item.id)`; éxito → toast + `onDeleted(id)` (el llamador refresca
	 * el grid, la celda ya no existe) + cierra este panel; fallo → `ctx.feedback.reportError`
	 * (global, mismo reparto que el borrado de P4 en `/c/[type]`: el diálogo se cierra pero el asset
	 * NUNCA se quita de forma optimista, sigue en el grid). `dirty` (metadatos sin guardar) NO
	 * bloquea borrar: el registro entero va a desaparecer, esos drafts dejan de tener sentido.
	 *
	 * **Doble trampa de foco mientras `confirmingDelete`/`confirmingReplace`**: `handleKeydown` de
	 * ESTE componente tiene un guard (primera línea) para quedar inerte mientras
	 * `MediaDeleteConfirm`/`MediaReplaceConfirm` están abiertos — los tres instalan un listener de
	 * `keydown` en `document` (en captura), y sin este guard un `Escape` dispararía VARIOS handlers
	 * a la vez (`stopPropagation` no cancela un listener hermano en el mismo nodo). Ver la cabecera
	 * de `MediaDeleteConfirm.svelte`/`MediaReplaceConfirm.svelte`.
	 *
	 * **"Se usa en" (`#lote-integridad`, Fase A)**: `UsedInPanel` montado dentro del formulario,
	 * colapsado por defecto (carga a demanda, ver su cabecera) — nunca paga el coste de red al
	 * simple abrir un asset.
	 *
	 * **"Reemplazar fichero" (`#lote-integridad`, Fase A, punto 4)**: sube un fichero nuevo AL
	 * MISMO registro (`ctx.port.update('vega_media', id, { file })`, conserva id/metadatos) tras
	 * pasar por `MediaReplaceConfirm` — igual que el borrado, NUNCA se dispara sin ese diálogo. La
	 * validación de mime/tamaño reutiliza `validateMediaFile`/`findMediaFileFieldSchema`
	 * (`media-upload.ts`, la MISMA que usa `MediaUpload` al subir) contra el esquema DESCUBIERTO —
	 * nunca una copia local de las constraints.
	 *
	 * **Pista del texto alternativo (audit del 23 sep, lámina pieza 3)**: solo en imágenes, bajo el
	 * campo `alt`, y sigue a lo que se ESCRIBE (`altDraft`), no al valor guardado: vacío → aviso en
	 * `--warning` con icono («un lector de pantalla leerá «nombre-del-fichero»», que es lo que de
	 * verdad pasa, `mediaImgAlt`); en cuanto hay texto → ayuda neutra. Nunca bloquea «Guardar».
	 * `aria-describedby` la ata al campo, así que se oye al enfocarlo.
	 *
	 * **Punto focal (audit del 23 sep, tarea 2)**: con `canSetFocal` (la `vega_media` descubierta
	 * tiene el campo `focal`, lo decide la ruta) y una imagen con vista previa, la vista previa
	 * entera es un `<button>` que abraza a la imagen: su caja ES la de la imagen, así que la fracción
	 * del clic es la fracción de la imagen (`mediaFocalFromPointer`). Clic = fijar el punto ahí. Con
	 * teclado, las flechas mueven un punto PENDIENTE (marca discontinua; Mayúsculas afina) y
	 * Intro/Espacio —la activación nativa del botón, `detail === 0`— lo fija; `Esc` suelta el
	 * pendiente antes de cerrar nada, y salir del botón también. La marca fija siempre se ve (en el
	 * centro si no hay punto); la línea de estado, `aria-live`, dice dónde está o adónde se mueve.
	 * «Centrar» lo borra (`null` = centro). Todo es borrador hasta «Guardar», como `alt`/`title`, y
	 * cuenta para `dirty`. Sin `canSetFocal` no se pinta nada de esto y el guardado no manda `focal`:
	 * una biblioteca anterior al campo sigue funcionando igual.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { RecordId, VegaRecord } from '$lib/backend/types';
	import Icon from '$lib/icons/Icon.svelte';
	import UsedInPanel from '$lib/integrity/UsedInPanel.svelte';
	import { addTag, normalizeTagInput, removeTag, tagsEqual } from './media-tags';
	import { classifyMediaAssetType, mediaMissingAlt } from './media-card';
	import {
		mediaFocalEquals,
		mediaFocalFromPointer,
		mediaFocalPercent,
		mediaFocalToFieldValue,
		moveMediaFocal,
		type MediaFocalPoint
	} from './media-focal';
	import { mediaDisplayName, mediaImgAlt, toMediaItemView, type MediaItemView } from './media-item';
	import { resolveMediaFullSrc } from './media-thumb';
	import { findMediaFileFieldSchema, validateMediaFile } from './media-upload';
	import MediaDeleteConfirm from './MediaDeleteConfirm.svelte';
	import MediaReplaceConfirm from './MediaReplaceConfirm.svelte';

	interface Props {
		/** `null` = diálogo cerrado. El grid nunca abre uno nuevo sin cerrar el anterior, pero este
		 *  componente no depende de esa disciplina: cada cambio de `item` reasienta los drafts. */
		item: MediaItemView | null;
		onClose: () => void;
		/** El registro `vega_media` YA actualizado (fuente de verdad tras `update`): el llamador
		 *  refresca su copia local (grid) con `toMediaItemView(saved)`, no con los drafts locales. */
		onSaved: (updated: MediaItemView) => void;
		/** Tras un borrado con ÉXITO (Fase 6d): el llamador refresca el grid (la celda ya no existe,
		 *  mismo mecanismo que `onSaved`). */
		onDeleted: (id: RecordId) => void;
		/** Destino de foco de reserva para `MediaDeleteConfirm` (ver su cabecera): el `<h1>` de
		 *  `/media/+page.svelte`, `tabindex="-1"` — estable frente a un borrado con éxito, que se
		 *  lleva por delante este panel ENTERO (y con él, el botón "Borrar" al que restauraría el
		 *  foco por defecto). */
		fallbackFocusEl: HTMLElement | null;
		/** Permisos EFECTIVOS sobre `vega_media` (`#lote-shell`), ya compuestos por la ruta
		 *  (`permissionsFor`, `$lib/backend/access`): sin permiso de actualización el panel es de
		 *  solo lectura (drafts deshabilitados, sin "Guardar" ni "Reemplazar"); sin permiso de
		 *  borrado, no se pinta "Borrar". Default `true` en ambos — un llamador que no los pase se
		 *  comporta EXACTAMENTE como antes de este lote. */
		canUpdate?: boolean;
		canDelete?: boolean;
		/** La `vega_media` descubierta tiene el campo `focal` (ver cabecera). Default `false`: sin él
		 *  el panel se comporta exactamente como antes del campo. */
		canSetFocal?: boolean;
	}

	let {
		item,
		onClose,
		onSaved,
		onDeleted,
		fallbackFocusEl,
		canUpdate = true,
		canDelete = true,
		canSetFocal = false
	}: Props = $props();

	const ctx = getVegaContext();

	let altDraft = $state('');
	let titleDraft = $state('');
	let tagsDraft = $state<string[]>([]);
	let tagInput = $state('');
	/** Punto focal en borrador (`null` = centro) y el punto PENDIENTE que mueven las flechas antes
	 *  de fijarlo con Intro (`null` = no se está moviendo). Ver cabecera. */
	let focalDraft = $state<MediaFocalPoint | null>(null);
	let focalPending = $state<MediaFocalPoint | null>(null);
	let focalImageEl = $state<HTMLImageElement | null>(null);
	let saving = $state(false);

	/** Controles de edición inertes (`#lote-shell`): mientras se guarda, como siempre, y también
	 *  cuando las reglas del backend no dejan actualizar este asset — ahí el panel sigue siendo
	 *  útil (ver el fichero, su URL y sus metadatos), solo que no se puede tocar. */
	const editingDisabled = $derived(saving || !canUpdate);
	let saveError = $state<string | null>(null);

	// ————— Borrado (Fase 6d) —————
	/** `true` mientras se pide confirmar el borrado del asset abierto (abre `MediaDeleteConfirm`). */
	let confirmingDelete = $state(false);
	/** `true` mientras `ctx.port.delete` está en vuelo (deshabilita el botón "Borrar" de aquí y pasa
	 *  a `MediaDeleteConfirm.deleting`, que evita un doble envío por su lado). */
	let deletingAsset = $state(false);

	// ————— Reemplazar fichero (`#lote-integridad`, Fase A) —————
	/** El campo `file` de `vega_media` YA resuelto contra el esquema DESCUBIERTO (ver cabecera):
	 *  `null` solo de forma defensiva (en la práctica, si este panel está montado la colección
	 *  existe) — sin él, "Reemplazar" sube sin pre-validar (el backend re-valida igual, §4.4). */
	const mediaFileSchema = $derived(findMediaFileFieldSchema(ctx.model.types.map((t) => t.schema)));
	let replaceInputEl = $state<HTMLInputElement | null>(null);
	/** Fichero YA elegido y pre-validado, a la espera de que se confirme en `MediaReplaceConfirm`. */
	let pendingReplaceFile = $state<File | null>(null);
	/** Motivo del último rechazo de la pre-validación cliente (mismos motivos que la subida,
	 *  `MediaFileRejectionReason`), o `null` sin rechazo pendiente que mostrar. */
	let replaceRejection = $state<'tooLarge' | 'invalidType' | null>(null);
	let confirmingReplace = $state(false);
	/** `true` mientras `ctx.port.update` (reemplazo) está en vuelo. */
	let replacingAsset = $state(false);

	let dialogEl = $state<HTMLElement | null>(null);
	let altInputEl = $state<HTMLInputElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	// Reasienta los drafts (baseline fresco) cada vez que se abre para `item`: única fuente de
	// "abrir" es `item` pasando de `null` a un valor.
	$effect(() => {
		if (!item) return;
		altDraft = item.alt;
		titleDraft = item.title;
		tagsDraft = item.tags;
		tagInput = '';
		focalDraft = item.focal;
		focalPending = null;
		saveError = null;
	});

	const dirty = $derived(
		item !== null &&
			(altDraft !== item.alt ||
				titleDraft !== item.title ||
				!tagsEqual(tagsDraft, item.tags) ||
				(canSetFocal && !mediaFocalEquals(focalDraft, item.focal)))
	);

	const fullSrc = $derived(item ? resolveMediaFullSrc(ctx.port, item) : null);

	/** La pista del alt solo existe para imágenes (ver cabecera). */
	const isImage = $derived(item !== null && classifyMediaAssetType(item.fileName) === 'image');
	/** Sigue al borrador, no al valor guardado (ver cabecera). */
	const altDraftMissing = $derived(
		item !== null && mediaMissingAlt({ alt: altDraft, fileName: item.fileName })
	);

	// ————— Punto focal (ver cabecera) —————

	/** El gesto existe: campo en el esquema, imagen y vista previa que pinchar. */
	const focalEnabled = $derived(canSetFocal && isImage && fullSrc !== null);
	/** Posición de las marcas en porcentaje: la fija (el borrador; centro si no hay) y la pendiente
	 *  de las flechas, si se está moviendo. */
	const focalMarkPercent = $derived(mediaFocalPercent(focalDraft));
	const focalPendingPercent = $derived(focalPending ? mediaFocalPercent(focalPending) : null);
	/** Línea de estado (`aria-live`): adónde se mueve, o dónde está. */
	const focalStatus = $derived.by(() => {
		if (focalPendingPercent) return ctx.t('media.focal.pending', focalPendingPercent);
		if (focalDraft === null) return ctx.t('media.focal.center');
		return ctx.t('media.focal.value', focalMarkPercent);
	});

	/** Clic en la imagen fija el punto ahí; la activación por TECLADO del mismo botón (Intro o
	 *  Espacio, `detail === 0` porque no hubo puntero) fija el pendiente de las flechas. */
	function handleFocalClick(event: MouseEvent): void {
		if (editingDisabled) return;
		if (event.detail === 0) {
			if (focalPending) focalDraft = focalPending;
			focalPending = null;
			return;
		}
		if (!focalImageEl) return;
		const point = mediaFocalFromPointer(
			event.clientX,
			event.clientY,
			focalImageEl.getBoundingClientRect()
		);
		if (point) focalDraft = point;
		focalPending = null;
	}

	function handleFocalKeydown(event: KeyboardEvent): void {
		if (editingDisabled) return;
		const moved = moveMediaFocal(focalPending ?? focalDraft, event.key, event.shiftKey);
		if (!moved) return;
		event.preventDefault(); // las flechas no desplazan el diálogo mientras se mueve el punto
		focalPending = moved;
	}

	function resetFocal(): void {
		focalDraft = null;
		focalPending = null;
	}

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>('button, input'));
	}

	function handleKeydown(event: KeyboardEvent): void {
		// Ver cabecera del componente ("Doble trampa de foco"): mientras `MediaDeleteConfirm`/
		// `MediaReplaceConfirm` están abiertos, ES SU trampa la que debe reaccionar a Esc/Tab, no
		// la de este diálogo — todos instalan un listener en `document`, y sin este guard `Escape`
		// dispararía varios a la vez.
		if (confirmingDelete || confirmingReplace) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			// Un punto focal a medio mover se suelta primero; el siguiente `Esc` ya cierra.
			if (focalPending) {
				focalPending = null;
				return;
			}
			requestClose();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = focusableItems();
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!item) return;

		previouslyFocused = document.activeElement as HTMLElement | null;
		altInputEl?.focus();

		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
		};
	});

	/** Cierra el diálogo — con cambios sin guardar, reutiliza el guard de salida de P5 (ver
	 *  cabecera). Ignorado mientras `saving` está en vuelo (mismo guard que `DeleteConfirm`). */
	function requestClose(): void {
		if (saving) return;
		if (dirty && !window.confirm(ctx.t('editor.leaveConfirm'))) return;
		onClose();
	}

	function handleAddTag(): void {
		tagsDraft = addTag(tagsDraft, tagInput);
		tagInput = '';
	}

	/** `Enter`/`,` añaden el tag en curso en vez de enviar el formulario (el `<form>` de abajo SÍ
	 *  guarda con `Enter` en `alt`/`title` — es el gesto esperado en un formulario corto; aquí se
	 *  intercepta explícitamente para que "añadir etiqueta" no dispare un guardado a medio teclear). */
	function handleTagInputKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			handleAddTag();
		}
	}

	function handleRemoveTag(tag: string): void {
		tagsDraft = removeTag(tagsDraft, tag);
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!item || saving) return;
		saving = true;
		saveError = null;
		try {
			// LANDMINE (Svelte 5, cazada en e2e): `tagsDraft` es un `$state<string[]>` — Svelte 5
			// proxifica los arrays reactivos, y el adaptador `memory` clona el registro escrito con
			// `structuredClone` (`toVegaRecord`), que NO sabe clonar un `Proxy` (`DataCloneError` en
			// runtime, silencioso salvo por el `catch` de abajo → `reportError` con un mensaje que no
			// apuntaba a la causa real). `[...tagsDraft]` desproxifica a un array plano ANTES de que
			// cruce la frontera del puerto — mismo criterio que `to-record-input.ts` documenta para
			// otros widgets de P5 (un `$state` nunca cruza tal cual al puerto).
			// `focal` solo si la colección tiene el campo (ver cabecera); `mediaFocalToFieldValue`
			// devuelve un objeto plano nuevo, mismo motivo que `[...tagsDraft]`.
			const saved: VegaRecord = await ctx.port.update('vega_media', item.id, {
				alt: altDraft,
				title: titleDraft,
				tags: [...tagsDraft],
				...(canSetFocal ? { focal: mediaFocalToFieldValue(focalDraft) } : {})
			});
			ctx.feedback.toast(ctx.t('media.detail.saveSuccess'), { kind: 'success' });
			onSaved(toMediaItemView(saved));
			onClose();
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al guardar el medio', err);
			if (vegaErr.kind === 'validation') {
				saveError = vegaErr.message;
			} else {
				ctx.feedback.reportError(vegaErr, { action: 'media:detail:save' });
			}
		} finally {
			saving = false;
		}
	}

	/** Abre `MediaDeleteConfirm` (ver cabecera del componente). Guard defensivo (mismo criterio que
	 *  `requestDelete` de P4, `/c/[type]/+page.svelte`): con un guardado, un borrado o un reemplazo
	 *  YA en vuelo (o su confirmación abierta), ignora la petición. */
	function requestDeleteAsset(): void {
		if (saving || deletingAsset || confirmingReplace || replacingAsset) return;
		confirmingDelete = true;
	}

	/** "Cancelar" o `Esc` en `MediaDeleteConfirm`: no borra nada. */
	function cancelDeleteAsset(): void {
		if (deletingAsset) return; // ignora mientras el borrado está en vuelo
		confirmingDelete = false;
	}

	/**
	 * Confirma el borrado (ver cabecera del componente, D-P6.5/audit H3). `label` se captura ANTES
	 * del `await` (mismo motivo que `confirmDelete` de P4: el toast de éxito debe quedar correcto
	 * pase lo que pase con `item` mientras el borrado está en vuelo).
	 */
	async function confirmDeleteAsset(): Promise<void> {
		if (!item || deletingAsset) return;
		const { id } = item;
		const label = mediaDisplayName(item);
		deletingAsset = true;
		try {
			await ctx.port.delete('vega_media', id);
			ctx.feedback.toast(ctx.t('media.delete.success', { label }), { kind: 'success' });
			confirmingDelete = false;
			onDeleted(id);
			onClose();
		} catch (err) {
			// Cualquier `kind` (incluidos 'forbidden'/'network') va a `reportError` (global, nunca
			// pantalla blanca): el asset NUNCA se quita de forma optimista, sigue en el grid tras
			// cerrar este diálogo.
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al borrar el medio', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:detail:delete' });
			confirmingDelete = false;
		} finally {
			deletingAsset = false;
		}
	}

	// ————— Reemplazar fichero (`#lote-integridad`, Fase A) —————

	/** Abre el selector de fichero nativo (mismo patrón `bind:this`+`.click()` que
	 *  `MediaUpload.openFilePicker`). Guard simétrico a `requestDeleteAsset`. */
	function requestReplaceFile(): void {
		if (saving || deletingAsset || confirmingDelete || replacingAsset) return;
		replaceRejection = null;
		replaceInputEl?.click();
	}

	/**
	 * Fichero elegido en el `<input type="file">` oculto: pre-valida contra el esquema DESCUBIERTO
	 * (`validateMediaFile`, la MISMA validación que la subida — ver cabecera del componente) antes
	 * de abrir `MediaReplaceConfirm`. Un rechazo se pinta en contexto y NUNCA llega a abrir el
	 * diálogo de confirmación (nada que confirmar sobre un fichero que de todos modos no se va a
	 * subir). `input.value` se limpia SIEMPRE: sin esto, elegir el MISMO fichero dos veces seguidas
	 * no dispararía un segundo `change` (§4.4-alike, mismo gesto que `MediaUpload`).
	 */
	function handleReplaceFileChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;

		if (mediaFileSchema) {
			const rejection = validateMediaFile(mediaFileSchema, file);
			if (rejection) {
				replaceRejection = rejection;
				return;
			}
		}
		replaceRejection = null;
		pendingReplaceFile = file;
		confirmingReplace = true;
	}

	/** "Cancelar" o `Esc` en `MediaReplaceConfirm`: no sube nada, el fichero elegido se descarta. */
	function cancelReplace(): void {
		if (replacingAsset) return;
		confirmingReplace = false;
		pendingReplaceFile = null;
	}

	/**
	 * Confirma el reemplazo (§4 del contrato): `update('vega_media', id, { file })` conserva id y
	 * metadatos (`alt`/`title`/`tags` intactos, nunca se reenvían) — el backend sustituye SOLO el
	 * campo `file`. Éxito → toast + `onSaved`/`onClose` (mismo camino que guardar metadatos: el
	 * llamador refresca el grid con el registro REAL, este panel se cierra). Fallo → `reportError`
	 * global (nunca deja el fichero "a medio subir" en un estado ambiguo).
	 */
	async function confirmReplace(): Promise<void> {
		if (!item || !pendingReplaceFile || replacingAsset) return;
		replacingAsset = true;
		try {
			const saved = await ctx.port.update('vega_media', item.id, { file: pendingReplaceFile });
			ctx.feedback.toast(ctx.t('media.replace.success'), { kind: 'success' });
			confirmingReplace = false;
			pendingReplaceFile = null;
			onSaved(toMediaItemView(saved));
			onClose();
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al reemplazar el fichero', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:detail:replace' });
			confirmingReplace = false;
		} finally {
			replacingAsset = false;
		}
	}
</script>

{#if item}
	<div class="vega-media-detail-backdrop">
		<div
			class="vega-media-detail-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-media-detail-title"
			bind:this={dialogEl}
		>
			<div class="vega-media-detail-header">
				<h2 id="vega-media-detail-title">{ctx.t('media.detail.title')}</h2>
				<button
					type="button"
					class="vega-media-detail-close"
					onclick={requestClose}
					aria-label={ctx.t('common.close')}
				>
					<Icon id="close" />
				</button>
			</div>

			<div class="vega-media-detail-preview">
				{#if fullSrc && focalEnabled}
					<!-- Punto focal (ver cabecera): el botón abraza a la imagen, su caja ES la imagen.
					     `aria-label` le da nombre propio; la ayuda y el estado lo describen. -->
					<button
						type="button"
						class="vega-media-focal"
						aria-label={ctx.t('media.focal.label')}
						aria-describedby="vega-media-focal-status vega-media-focal-help"
						disabled={editingDisabled}
						onclick={handleFocalClick}
						onkeydown={handleFocalKeydown}
						onblur={() => (focalPending = null)}
						data-media-focal
					>
						<img
							src={fullSrc}
							alt={mediaImgAlt(item)}
							class="vega-media-detail-image"
							bind:this={focalImageEl}
						/>
						<span
							class="vega-media-focal-mark"
							style:left="{focalMarkPercent.x}%"
							style:top="{focalMarkPercent.y}%"
							data-media-focal-mark
							aria-hidden="true"
						></span>
						{#if focalPendingPercent}
							<span
								class="vega-media-focal-mark vega-media-focal-mark--pending"
								style:left="{focalPendingPercent.x}%"
								style:top="{focalPendingPercent.y}%"
								data-media-focal-pending
								aria-hidden="true"
							></span>
						{/if}
					</button>
				{:else if fullSrc}
					<img src={fullSrc} alt={mediaImgAlt(item)} class="vega-media-detail-image" />
				{:else}
					<Icon id="document" size={48} title={mediaImgAlt(item)} />
				{/if}
			</div>

			{#if focalEnabled}
				<div class="vega-media-focal-row">
					<p
						id="vega-media-focal-status"
						class="vega-media-focal-status"
						aria-live="polite"
						data-media-focal-status
					>
						{focalStatus}
					</p>
					<button
						type="button"
						class="vega-media-focal-reset"
						onclick={resetFocal}
						disabled={editingDisabled || (focalDraft === null && focalPending === null)}
					>
						{ctx.t('media.focal.reset')}
					</button>
				</div>
				<p id="vega-media-focal-help" class="vega-media-focal-help">
					{ctx.t('media.focal.help')}
				</p>
			{/if}

			<!-- Reemplazar fichero (`#lote-integridad`, Fase A): control de fichero REAL, oculto
			     VISUALMENTE (mismo patrón que `MediaUpload.svelte` — nunca `display: none`, sigue en
			     el árbol de accesibilidad). El botón visible dispara `.click()` sobre él. -->
			<div class="vega-media-detail-replace" hidden={!canUpdate}>
				<label class="vega-media-detail-replace-sr" for="vega-media-detail-replace-input">
					{ctx.t('media.detail.replace')}
				</label>
				<input
					id="vega-media-detail-replace-input"
					type="file"
					class="vega-media-detail-replace-sr"
					bind:this={replaceInputEl}
					accept={mediaFileSchema?.mimeTypes?.join(',') || undefined}
					disabled={saving || deletingAsset || replacingAsset}
					onchange={handleReplaceFileChange}
				/>
				<button
					type="button"
					onclick={requestReplaceFile}
					disabled={saving || deletingAsset || confirmingDelete || replacingAsset}
				>
					{ctx.t('media.detail.replace')}
				</button>
				{#if replaceRejection}
					<p class="vega-media-detail-error" role="alert">
						{replaceRejection === 'tooLarge'
							? ctx.t('media.replace.rejectedTooLarge')
							: ctx.t('media.replace.rejectedInvalidType')}
					</p>
				{/if}
			</div>

			<form onsubmit={handleSubmit} novalidate>
				{#if saveError}
					<p class="vega-media-detail-error" role="alert">{saveError}</p>
				{/if}

				<div class="vega-media-detail-field">
					<label for="vega-media-detail-alt">{ctx.t('media.detail.alt')}</label>
					<input
						id="vega-media-detail-alt"
						type="text"
						bind:value={altDraft}
						bind:this={altInputEl}
						disabled={editingDisabled}
						aria-describedby={isImage ? 'vega-media-detail-alt-hint' : undefined}
					/>
					{#if isImage}
						{#if altDraftMissing}
							<p
								id="vega-media-detail-alt-hint"
								class="vega-media-detail-alt-hint vega-media-detail-alt-hint--warn"
								data-media-alt-hint="missing"
							>
								<Icon id="warning" size={12} />
								<span>{ctx.t('media.detail.altMissingHint', { name: item.fileName })}</span>
							</p>
						{:else}
							<p
								id="vega-media-detail-alt-hint"
								class="vega-media-detail-alt-hint"
								data-media-alt-hint="help"
							>
								{ctx.t('media.detail.altHelp')}
							</p>
						{/if}
					{/if}
				</div>

				<div class="vega-media-detail-field">
					<label for="vega-media-detail-title">{ctx.t('media.detail.titleLabel')}</label>
					<input
						id="vega-media-detail-title"
						type="text"
						bind:value={titleDraft}
						disabled={editingDisabled}
					/>
				</div>

				<div class="vega-media-detail-field">
					<span id="vega-media-detail-tags-label">{ctx.t('media.detail.tags')}</span>
					{#if tagsDraft.length > 0}
						<ul class="vega-media-detail-tags" aria-labelledby="vega-media-detail-tags-label">
							{#each tagsDraft as tag (tag)}
								<li class="vega-media-tag">
									{tag}
									<button
										type="button"
										onclick={() => handleRemoveTag(tag)}
										disabled={editingDisabled}
										aria-label={ctx.t('media.detail.removeTag', { tag })}
									>
										×
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="vega-media-detail-tag-input">
						<input
							type="text"
							bind:value={tagInput}
							onkeydown={handleTagInputKeydown}
							disabled={editingDisabled}
							placeholder={ctx.t('media.detail.tagPlaceholder')}
							aria-label={ctx.t('media.detail.tagInputLabel')}
						/>
						<button
							type="button"
							onclick={handleAddTag}
							disabled={editingDisabled || normalizeTagInput(tagInput) === ''}
						>
							{ctx.t('media.detail.addTag')}
						</button>
					</div>
				</div>

				<!-- "Se usa en" (`#lote-integridad`, Fase A): colapsado por defecto, ver
				     `UsedInPanel.svelte`. `targetFileRef` alimenta la vía "url" del motor — el picker de
				     media COPIA el binario, así que la vía "relation" casi nunca encuentra nada aquí. -->
				<div class="vega-media-detail-field">
					<UsedInPanel
						targetCollection="vega_media"
						targetId={item.id}
						targetFileRef={item.fileRef}
					/>
				</div>

				<div class="vega-media-detail-actions">
					{#if canDelete}
						<button
							type="button"
							class="vega-media-detail-delete"
							onclick={requestDeleteAsset}
							disabled={saving || deletingAsset}
						>
							{ctx.t('media.detail.delete')}
						</button>
					{/if}
					<div class="vega-media-detail-actions-primary">
						<button type="button" onclick={requestClose} disabled={saving}>
							{ctx.t('common.cancel')}
						</button>
						{#if canUpdate}
							<button type="submit" disabled={saving}>
								{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
							</button>
						{/if}
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Montado SIEMPRE (nunca dentro del `{#if item}` de arriba) — ver la cabecera de
     `MediaDeleteConfirm.svelte`: un borrado con éxito cierra ESTE panel entero en el mismo tick en
     que se cierra el diálogo de confirmación, y ambos deben poder completar su propia limpieza de
     foco sin que uno destruya al otro a mitad de esa carrera. -->
<MediaDeleteConfirm
	open={confirmingDelete}
	assetLabel={item ? mediaDisplayName(item) : ''}
	targetId={item?.id ?? null}
	targetFileRef={item?.fileRef ?? null}
	deleting={deletingAsset}
	{fallbackFocusEl}
	onConfirm={confirmDeleteAsset}
	onCancel={cancelDeleteAsset}
/>

<!-- Montado SIEMPRE, mismo motivo que `MediaDeleteConfirm` arriba (§ carrera de foco). -->
<MediaReplaceConfirm
	open={confirmingReplace}
	assetLabel={item ? mediaDisplayName(item) : ''}
	newFileName={pendingReplaceFile?.name ?? ''}
	targetId={item?.id ?? ''}
	targetFileRef={item?.fileRef ?? null}
	replacing={replacingAsset}
	{fallbackFocusEl}
	onConfirm={confirmReplace}
	onCancel={cancelReplace}
/>

<style>
	.vega-media-detail-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
		   check-theme-coverage.mjs, mismo criterio que DeleteConfirm/ReloginModal/Sidebar. */
		background: rgb(15 17 21 / 55%);
	}

	.vega-media-detail-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: 100%;
		max-width: 26rem;
		max-height: calc(100vh - 2 * var(--vega-space-gutter));
		overflow-y: auto;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-media-detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.vega-media-detail-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-media-detail-close {
		border: none;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		padding: 0.2rem;
	}

	.vega-media-detail-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 8rem;
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--ink-2);
		overflow: hidden;
	}

	.vega-media-detail-image {
		max-width: 100%;
		max-height: 16rem;
		object-fit: contain;
	}

	/* Punto focal (ver cabecera): el botón abraza a la imagen (sin padding, borde ni interlineado),
	   así que su caja es la de la imagen y la marca se posiciona en % de ella. */
	.vega-media-focal {
		position: relative;
		display: inline-block;
		max-width: 100%;
		padding: 0;
		border: 0;
		background: none;
		line-height: 0;
		cursor: crosshair;
	}

	.vega-media-focal:disabled {
		cursor: default;
	}

	/* Hacia DENTRO: la vista previa recorta (`overflow: hidden`) y una imagen a todo lo ancho se
	   comería un anillo exterior — mismo criterio que la celda de `MediaGrid`. */
	.vega-media-focal:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.vega-media-focal .vega-media-detail-image {
		display: block;
	}

	/* La marca tiene que verse sobre CUALQUIER foto: anillo de acento con un filo de papel por
	   dentro y por fuera, en vez de un color que alguna imagen se tragaría. */
	.vega-media-focal-mark {
		position: absolute;
		width: 18px;
		height: 18px;
		border: 2px solid var(--accent);
		border-radius: 50%;
		box-shadow:
			0 0 0 2px var(--paper),
			inset 0 0 0 2px var(--paper);
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.vega-media-focal-mark--pending {
		border-style: dashed;
	}

	.vega-media-focal-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.vega-media-focal-status {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}

	.vega-media-focal-reset {
		flex-shrink: 0;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-media-focal-reset:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-focal-help {
		margin: -0.5rem 0 0;
		font-size: 0.82rem;
		color: var(--ink-2);
	}

	.vega-media-detail-replace {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
	}

	.vega-media-detail-replace button {
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-media-detail-replace button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	/* Oculto VISUALMENTE, presente para teclado y lectores de pantalla (mismo patrón que
	   `MediaUpload.svelte`, nunca `display: none`). */
	.vega-media-detail-replace-sr {
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

	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.vega-media-detail-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}

	.vega-media-detail-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.vega-media-detail-field label,
	.vega-media-detail-field > span {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-2);
	}

	.vega-media-detail-field input[type='text'] {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	/* Pista del alt (lámina del audit, pieza 3): ayuda neutra en `--ink-2` (AA, mismo criterio que
	   `.vega-field-help`), aviso en `--warning` con icono delante. */
	.vega-media-detail-alt-hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.vega-media-detail-alt-hint--warn {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		color: var(--warning);
		font-weight: 550;
	}

	.vega-media-detail-alt-hint--warn :global(svg) {
		flex-shrink: 0;
		margin-top: 0.15rem;
	}

	.vega-media-detail-field input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-media-detail-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-media-tag {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 0.8rem;
	}

	.vega-media-tag button {
		border: none;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
		padding: 0;
	}

	.vega-media-detail-tag-input {
		display: flex;
		gap: 0.4rem;
	}

	.vega-media-detail-tag-input input {
		flex: 1;
	}

	.vega-media-detail-tag-input button {
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-media-detail-tag-input button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-detail-actions {
		display: flex;
		/* "Borrar" (danger) a la izquierda, Cancelar/Guardar agrupados a la derecha (D-P6.5/6d): la
		   acción destructiva vive separada del par cancelar/guardar, nunca adyacente a "Guardar". */
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.vega-media-detail-actions-primary {
		display: flex;
		gap: 0.5rem;
	}

	.vega-media-detail-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-media-detail-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-detail-actions button[type='submit'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}

	/* Rol `danger` (mismos tokens que `DeleteConfirm`/P4, L-P4.11-alike). */
	.vega-media-detail-delete {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
		font-weight: 600;
	}
</style>
