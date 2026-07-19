/**
 * `fileFromMediaAsset` (Fase P6·6e, INVARIANTE L-P6.8): descarga los BYTES de un asset de
 * `vega_media` y los envuelve en un `File` real — el ÚNICO objeto que el picker puede entregar a
 * un widget destino (nunca el `FileRef` del asset, ver `media-picker.ts`). `fetch` + `Blob` +
 * `File`, sin Svelte: testeable con `fetch` mockeado (en `memory`, `port.fileUrl` ya es un `data:`
 * URI — `fetch` lo resuelve SIN red de verdad, y `Blob.type` hereda el mime declarado en el propio
 * URI).
 *
 * A propósito NO usa `resolveMediaGridSrc`/`resolveMediaFullSrc` (`media-thumb.ts`): esas dos
 * devuelven `null` para cualquier asset que no sea imagen (pensadas para decidir un `<img src>`,
 * `media-thumb.ts` §Fase P6·6b) — el picker necesita los bytes de CUALQUIER asset (un pdf incluido),
 * así que llama a `port.fileUrl` directamente, sin pasar por esa decisión imagen-vs-otro.
 *
 * **LANDMINE CORS (audit H4)**: en self-host con PocketBase en un origen DISTINTO al de la SPA,
 * este `fetch` exige que el endpoint de ficheros de PB responda con cabeceras CORS válidas para ese
 * origen — el supuesto por defecto de Vega es mismo-origen (PB sirviendo también la SPA estática,
 * `pb_public/`). Un despliegue con la SPA en un dominio/puerto distinto necesita configurar CORS en
 * PocketBase para que "Elegir de la biblioteca" funcione; sin ello, este `fetch` rechaza con un
 * error de red que aquí se traduce a un `MediaFileFetchError` con mensaje CLARO (nunca deja subir
 * el `TypeError` crudo del navegador) — `MediaPicker.svelte` lo captura y lo pinta EN CONTEXTO
 * (dentro del propio diálogo), sin tumbar el resto de la app.
 */

import type { BackendPort } from '$lib/backend/port';
import { MEDIA_FILE_FIELD, type MediaItemView } from './media-item';

/** Fallo al descargar un asset de la biblioteca (red/CORS/HTTP no-ok/sin `fileRef`) — nunca un
 *  `VegaError` (esto no es un fallo del `BackendPort`, es el `fetch` posterior a `fileUrl`). */
export class MediaFileFetchError extends Error {}

/**
 * Descarga `item` (su `fileRef`, vía `port.fileUrl`) y devuelve un `File` con el mismo nombre y el
 * mime que reporte la respuesta (o `application/octet-stream` si viniera vacío, defensivo). Lanza
 * `MediaFileFetchError` si el asset no tiene `fileRef`, si `fetch` falla (red/CORS, ver cabecera) o
 * si la respuesta no es `ok`.
 */
export async function fileFromMediaAsset(
	port: Pick<BackendPort, 'fileUrl'>,
	item: Pick<MediaItemView, 'id' | 'fileRef'>
): Promise<File> {
	if (item.fileRef === null) {
		throw new MediaFileFetchError('El asset elegido no tiene ningún fichero asociado.');
	}
	const fileRef = item.fileRef;
	const url = port.fileUrl({ type: 'vega_media', id: item.id }, MEDIA_FILE_FIELD, fileRef);

	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		throw new MediaFileFetchError(
			`No se pudo descargar "${fileRef}" de la biblioteca (red o CORS — ver la cabecera de este módulo).`,
			{ cause: err }
		);
	}
	if (!response.ok) {
		throw new MediaFileFetchError(
			`No se pudo descargar "${fileRef}" de la biblioteca (HTTP ${response.status}).`
		);
	}

	const blob = await response.blob();
	return new File([blob], fileRef, { type: blob.type || 'application/octet-stream' });
}
