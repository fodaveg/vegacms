<script lang="ts">
	/**
	 * `ReviewMediaDialog.svelte` (lote 13, decisión 4): «Describir la imagen…» de un aviso
	 * `media.alt-missing` abre la ficha de Medios (`MediaDetail.svelte`, la MISMA de `/media`)
	 * encima del formulario o del editor visual, con el foco en «Texto alternativo» (lo pone la
	 * propia ficha al abrirse). El alt vive en `vega_media`, no en la página: ir al bloque no
	 * dejaría arreglarlo.
	 *
	 * Esta pieza solo hace lo que `/media/+page.svelte` hace por su cuenta antes de montar la ficha:
	 * leer el registro por su id (`ctx.port.get`), resolver los permisos efectivos sobre `vega_media`
	 * (`ResolvedContentType.permissions`, ya compuestos por el modelo) y si la biblioteca descubierta
	 * tiene `focal`. `MediaDetail` no sabe que lo monta otra pantalla: recibe lo de siempre.
	 *
	 * `mediaId` es el único mando: `null` = cerrada. Al guardar, `onSaved(item)` entrega la ficha ya
	 * escrita para que la revisión la sustituya en su mapa (`ReviewState.updateMedia`) y el aviso
	 * desaparezca sin releer nada; `MediaDetail` cierra por su cuenta tras guardar o borrar
	 * (`onClose`). Si el registro no se puede leer, se reporta al feedback global y se cierra: nunca
	 * una ficha vacía.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { RecordId } from '$lib/backend/types';
	import { VEGA_MEDIA_COLLECTION } from '$lib/media/media-collection';
	import { toMediaItemView, type MediaItemView } from '$lib/media/media-item';
	import MediaDetail from '$lib/media/MediaDetail.svelte';

	interface Props {
		/** La ficha a abrir; `null` = cerrada. */
		mediaId: RecordId | null;
		onClose: () => void;
		/** La ficha YA guardada (ver cabecera). */
		onSaved: (item: MediaItemView) => void;
		/** Tras borrar el medio desde la ficha: quien monta decide qué releer. */
		onDeleted: (id: RecordId) => void;
		/** Destino de foco de reserva de `MediaDeleteConfirm` (ver `MediaDetail`). */
		fallbackFocusEl: HTMLElement | null;
	}

	let { mediaId, onClose, onSaved, onDeleted, fallbackFocusEl }: Props = $props();

	const ctx = getVegaContext();

	let item = $state<MediaItemView | null>(null);

	const mediaType = $derived(
		ctx.model.types.find((type) => type.name === VEGA_MEDIA_COLLECTION.name) ?? null
	);
	const canSetFocal = $derived(
		mediaType?.schema.fields.some((field) => field.name === 'focal') ?? false
	);

	// Lee la ficha cuando llega un id; una respuesta de un id que ya no es el abierto se descarta.
	$effect(() => {
		const id = mediaId;
		if (id === null) {
			item = null;
			return;
		}
		let current = true;
		ctx.port
			.get(VEGA_MEDIA_COLLECTION.name, id)
			.then((record) => {
				if (current) item = toMediaItemView(record);
			})
			.catch((err: unknown) => {
				if (!current) return;
				ctx.feedback.reportError(
					err instanceof VegaError ? err : VegaError.backend('No se pudo abrir el medio', err),
					{ action: 'review:media' }
				);
				onClose();
			});
		return () => {
			current = false;
		};
	});
</script>

<MediaDetail
	{item}
	{onClose}
	{onSaved}
	{onDeleted}
	{fallbackFocusEl}
	canUpdate={mediaType?.permissions.update ?? true}
	canDelete={mediaType?.permissions.delete ?? true}
	{canSetFocal}
/>
