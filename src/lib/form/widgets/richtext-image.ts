/**
 * `richtext-image.ts`: qué se escribe en el `<img>` del texto enriquecido cuando la imagen se elige
 * en la biblioteca de medios. Puro (solo necesita `port.fileUrl`), con test.
 *
 * **Una URL, no una copia.** El selector de medios (`MediaPicker.svelte`) entrega los BYTES de lo
 * elegido porque su consumidor original, el campo de fichero, copia el fichero al registro
 * (invariante L-P6.8). El texto enriquecido no tiene dónde guardar un fichero: su valor es HTML, y
 * un `<img>` solo puede llevar una dirección. Por eso aquí se usa la URL pública del fichero en la
 * biblioteca, la que da `port.fileUrl` para el registro de `vega_media`, sin miniatura. Los bytes
 * que trae el selector no se usan; de ese `File` solo se lee el nombre, que es el `FileRef` del
 * medio (`fileFromMediaAsset`, `$lib/media/media-file-from-url`, lo construye así).
 *
 * Consecuencia que conviene saber: si el medio se borra o se reemplaza en la biblioteca, la imagen
 * del texto deja de verse. El campo de fichero no tiene ese problema porque copia.
 */

import type { BackendPort } from '$lib/backend/port';
import { MEDIA_FILE_FIELD } from '$lib/media/media-item';
import type { MediaPickResult } from '$lib/media/media-picker';

/** Colección de la biblioteca de medios (D-P6.1). */
const MEDIA_COLLECTION = 'vega_media';

export interface RichtextImage {
	/** Lo que va al `src`: la URL pública del fichero en la biblioteca. */
	src: string;
	/** El texto alternativo del medio, recortado; `''` si no tiene. */
	alt: string;
	fileName: string;
}

/**
 * Traduce lo elegido en el selector de medios a los atributos del `<img>`. Propaga lo que lance
 * `port.fileUrl` (en `memory`, un `FileRef` sin fichero sembrado lanza `not-found`).
 */
export function richtextImageFromPick(
	port: Pick<BackendPort, 'fileUrl'>,
	pick: Pick<MediaPickResult, 'file' | 'mediaId' | 'alt'>
): RichtextImage {
	const fileName = pick.file.name;
	return {
		src: port.fileUrl({ type: MEDIA_COLLECTION, id: pick.mediaId }, MEDIA_FILE_FIELD, fileName),
		alt: pick.alt.trim(),
		fileName
	};
}
