/**
 * Presentación de UNA tarjeta de la biblioteca de medios (rediseño de `/media`, mockup
 * `aquelarre-medios.html`): módulo PURO — sin Svelte, sin el puerto, sin reloj global — consumido
 * por `MediaGrid.svelte`, `MediaUpload.svelte` y `/media/+page.svelte`. Mismo reparto que el resto
 * de `media/`: los `.svelte` pintan, la decisión (qué tipo es, qué matiz le toca, cómo se escribe
 * un tamaño) vive aquí y se testea sin DOM.
 *
 * **Clasificación por EXTENSIÓN, no por MIME**: el puerto no expone el mime de una `FileRef` ya
 * almacenada (§4.4 del contrato de backend) — es la MISMA limitación que ya documentan
 * `classifyMediaFile` (`media-item.ts`) y `matchesAccept` (`media-picker.ts`), y por eso los chips
 * de tipo de la toolbar filtran por la extensión del nombre de fichero. `'document'` es el CAJÓN
 * por defecto (todo lo que no es imagen ni vídeo, extensiones desconocidas incluidas): con solo
 * tres chips, ningún asset puede quedar invisible en todos ellos.
 *
 * **El matiz del placeholder es DETERMINISTA** (`mediaThumbTone`): el mockup pinta las miniaturas
 * sin bitmap con cuatro degradados de rol (`--accent-soft`/`--info-soft`/`--success-soft`/
 * `--warning-soft`). Se elige por hash del id del asset, nunca al azar — la misma tarjeta tiene
 * SIEMPRE el mismo matiz entre renders, recargas y páginas (un color que baila en cada repintado
 * sería ruido, no información).
 */

import type { Locale } from '$lib/i18n';
import type { MediaItemView } from './media-item';
import type { MediaAssetMetrics } from './media-metrics';

/** Tipo de asset a efectos de UI (icono de la miniatura + chips de la toolbar). */
export type MediaAssetType = 'image' | 'video' | 'document';

/** Valor del filtro de tipo de la toolbar: los tres tipos + "Todos". */
export type MediaTypeFilter = 'all' | MediaAssetType;

/** Los cuatro matices de placeholder del mockup (`.ph-a`…`.ph-d`), en orden. */
export type MediaThumbTone = 'a' | 'b' | 'c' | 'd';

// Mismo set que `IMAGE_EXTENSIONS` de `media-item.ts` (que decide `<img>` vs icono): se repite
// aquí a propósito, porque esta clasificación tiene TRES cajones y aquella solo dos — mezclarlas
// obligaría a una de las dos a hablar el vocabulario de la otra.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'ogv']);

/** Extensión en minúsculas y sin punto de `fileName` (`''` si no tiene). */
function extensionOf(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	if (dot <= 0 || dot === fileName.length - 1) return '';
	return fileName.slice(dot + 1).toLowerCase();
}

/**
 * Extensión tal cual se pinta en la badge `.ext` de la miniatura (mockup: "JPG", "MP4", "PDF"):
 * mayúsculas, sin punto, `''` si el nombre no tiene extensión (la badge no se pinta).
 */
export function mediaExtensionBadge(fileName: string): string {
	return extensionOf(fileName).toUpperCase();
}

/** Clasifica un nombre de fichero en uno de los tres tipos de la toolbar (ver cabecera). */
export function classifyMediaAssetType(fileName: string): MediaAssetType {
	const ext = extensionOf(fileName);
	if (IMAGE_EXTENSIONS.has(ext)) return 'image';
	if (VIDEO_EXTENSIONS.has(ext)) return 'video';
	return 'document';
}

/** `true` si `fileName` pasa el chip de tipo activo (`'all'` no filtra nada). */
export function matchesMediaTypeFilter(fileName: string, filter: MediaTypeFilter): boolean {
	return filter === 'all' || classifyMediaAssetType(fileName) === filter;
}

/**
 * `true` si `fileName` contiene `query` (case-insensitive, espacios recortados). Una búsqueda en
 * blanco no filtra nada. Deliberadamente sobre el NOMBRE DE FICHERO y nada más: es lo que promete
 * el placeholder del buscador ("Buscar por nombre de archivo…") — el buscador por `alt`/`title`,
 * server-side, es el del picker (`buildMediaListQuery`, 6e), otro gesto y otro contrato.
 */
export function matchesMediaNameQuery(fileName: string, query: string): boolean {
	const term = query.trim().toLowerCase();
	if (term === '') return true;
	return fileName.toLowerCase().includes(term);
}

const THUMB_TONES: readonly MediaThumbTone[] = ['a', 'b', 'c', 'd'];

/**
 * Matiz del placeholder de miniatura para `seed` (el id del asset): hash entero estable —
 * multiplicación por 31 + `>>> 0` para no salirse de los 32 bits sin signo, el clásico de
 * `String.hashCode` — repartido en los cuatro matices. Determinista por definición (ver cabecera).
 */
export function mediaThumbTone(seed: string): MediaThumbTone {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
	}
	return THUMB_TONES[hash % THUMB_TONES.length];
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Escribe `bytes` como tamaño legible (mockup `.asset-sub`/`.dropzone .max`: "412 KB", "1,2 MB").
 * Base 1024 con las etiquetas cortas de siempre (KB/MB, no KiB/MiB: es lo que espera cualquiera
 * que mire una biblioteca de ficheros, y es la unidad en la que se declara `maxSizeBytes`). Un
 * decimal solo por debajo de 10 en la unidad elegida (10 MB, pero 1,2 MB); los bytes crudos nunca
 * llevan decimales. `''` para un valor no finito o negativo — nunca "NaN B".
 */
export function formatFileSize(bytes: number, locale: Locale): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '';
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	const maximumFractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1;
	const text = new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
	return `${text} ${SIZE_UNITS[unitIndex]}`;
}

/**
 * Subtítulo de la tarjeta (mockup `.asset-sub`, en `--mono`): el DATO CANÓNICO que complementa al
 * nombre visible, nunca una repetición suya.
 *
 * Degradación en CASCADA, según lo que se haya podido medir del fichero real (`metrics`, ver
 * `media-metrics.ts` — llegan de forma asíncrona y cada una por su lado):
 * 1. dimensiones + tamaño → "2880×1800 · 1,2 MB", exactamente el mockup;
 * 2. solo dimensiones (la miniatura cargó, el `HEAD` no dijo nada) → "2880×1800";
 * 3. solo tamaño (pdf, vídeo: sin bitmap que medir) → "1,2 MB";
 * 4. nada medido todavía (o nunca) → el dato que SÍ trae el registro, que además nunca está vacío,
 *    para que la tarjeta no cambie de alto cuando lleguen las medidas:
 *    - con `title`/`alt` editorial (la tarjeta muestra ese texto): el nombre de fichero crudo, que
 *      de otro modo no se vería en ninguna parte de la rejilla;
 *    - sin metadatos (la tarjeta ya muestra el nombre de fichero): la fecha de alta (`created`), en
 *      formato medio del locale — mismo criterio que `formatDateCell` de la tabla (`list/cell.ts`).
 *
 * `''` solo en el caso residual de un registro sin nada de lo anterior (sin `created`, defensivo).
 *
 * Las dimensiones NO se formatean por locale a propósito (nunca "2.880×1.800"): un tamaño en
 * píxeles es un par de valores técnicos, no una cantidad que se lea en prosa — el mockup las pinta
 * igual, pegadas al signo `×`.
 */
export function mediaCardSubtitle(
	item: Pick<MediaItemView, 'title' | 'alt' | 'fileName' | 'created'>,
	locale: Locale,
	metrics?: MediaAssetMetrics | null
): string {
	const parts: string[] = [];
	if (metrics?.width !== undefined && metrics.height !== undefined) {
		parts.push(`${metrics.width}×${metrics.height}`);
	}
	if (metrics?.bytes !== undefined) {
		const size = formatFileSize(metrics.bytes, locale);
		if (size !== '') parts.push(size);
	}
	if (parts.length > 0) return parts.join(' · ');

	if (item.title !== '' || item.alt !== '') return item.fileName;
	if (item.created === null) return '';
	const ms = Date.parse(item.created);
	if (Number.isNaN(ms)) return '';
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(ms));
}
