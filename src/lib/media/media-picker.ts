/**
 * `media-picker.ts` (Fase P6·6e, D-P6.6): tipos y utilidades PURAS del picker de biblioteca — el
 * contrato que `ctx.mediaPicker` (`$lib/app-context.ts`) publica y que `FileInput.svelte` (widget
 * `file`, P5) consume para insertar assets de `vega_media` en un campo file de un registro.
 * `MediaPicker.svelte` es el ÚNICO componente que instancia este servicio (vía
 * `media-picker-state.svelte.ts`); este módulo no sabe de Svelte ni del puerto.
 *
 * **INVARIANTE CENTRAL (L-P6.8, no negociable)**: por `filePerRecord` (§4.4 del contrato de
 * backend), un registro de contenido de usuario NUNCA referencia un `vega_media` — solo puede
 * tener sus PROPIOS `FileRef`, ajenos a la biblioteca. El picker por tanto COPIA bytes:
 * `MediaPickResult.file` es un `File` real (descargado de la biblioteca, ver
 * `media-file-from-url.ts`), nunca el `FileRef` del asset de `vega_media`. `mediaId` viaja SOLO
 * para que la UI pinte "elegido en esta sesión del picker" (dedupe visual) — JAMÁS cruza a
 * `onChange`/al valor persistible del widget: hacerlo recrearía la referencia fantasma que el
 * audit H3 declara inexistente. `file-guards.ts` ya rechazaría un `FileRef` ajeno colado por error
 * (`foreignFileRef`), pero el picker está diseñado para que ese camino ni se alcance — lo único
 * que sale de aquí hacia el widget destino es `File` (ver la suite de este módulo, describe
 * "invariante L-P6.8").
 */

import type { FileRef, RecordId } from '$lib/backend/types';

/** Opciones de apertura del picker (`ctx.mediaPicker.open`, D-P6.6): las deriva `FileInput.svelte`
 *  del `Field` file destino (`multiple`/`mimeTypes`). */
export interface MediaPickerOpenOptions {
	/** `true`: selección 1..N; `false`: como mucho un asset (elegir otro reemplaza al anterior). */
	multiple: boolean;
	/** Mismo vocabulario que `Field.file.mimeTypes` (comodín `tipo/*`) — filtra el grid del picker
	 *  CLIENTE (ver `matchesAccept`). `undefined`/vacío = sin restricción (todos los assets). */
	accept?: string[];
}

/** Lo que `MediaPicker.svelte` resuelve al pulsar "Insertar": un elemento por asset elegido, en el
 *  mismo orden de selección. Cancelar (Esc/"Cancelar") resuelve `null` (D-P6.6). */
export interface MediaPickResult {
	/** Los BYTES del asset, ya descargados (`fileFromMediaAsset`) — lo ÚNICO que el widget destino
	 *  puede fusionar en su valor (ver INVARIANTE L-P6.8 en la cabecera). */
	file: File;
	/** El id de `vega_media` de origen — SOLO UI (dedupe visual dentro de la sesión del picker),
	 *  NUNCA se persiste (ver cabecera del módulo). */
	mediaId: RecordId;
	/** El `alt` del asset, si lo tenía — metadato opcional; `FileInput.svelte` lo ignora si el
	 *  campo destino no tiene dónde ponerlo (ver [SUP-5] en su cabecera). */
	alt: string;
}

// ————— Filtrado client-side por `accept` (audit H1) —————
//
// El mime NO es un dato consultable del backend (`file` solo admite `empty`/`notEmpty` en
// `Query`, `$lib/backend/query.ts`) — filtrar por `accept` tiene que hacerse en el CLIENTE,
// aproximando el mime por la EXTENSIÓN del `FileRef`. Mismo criterio, deliberadamente duplicado,
// que `classifyMediaFile` (`media-item.ts`) / `validateMediaFile` (`media-upload.ts`): cada
// módulo de `media/` mantiene su propia tabla mínima en vez de compartir una "fuente de verdad"
// extensión→mime que ningún otro punto del contrato necesita.
const EXTENSION_MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	avif: 'image/avif',
	bmp: 'image/bmp',
	pdf: 'application/pdf',
	txt: 'text/plain'
};

/** Aproxima el mime de `ref` por su extensión. `null` = extensión desconocida (fuera de la tabla). */
function guessMimeType(ref: FileRef): string | null {
	const ext = ref.split('.').pop()?.toLowerCase() ?? '';
	return EXTENSION_MIME[ext] ?? null;
}

/** `true` si `mime` matchea alguno de `patterns` (comodín `tipo/*`, mismo criterio que
 *  `matchesMimePattern` de `file-value.ts`/`media-upload.ts`). */
function matchesMimePattern(mime: string, patterns: string[]): boolean {
	return patterns.some((pattern) =>
		pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : mime === pattern
	);
}

/**
 * `true` si el asset `ref` pasa el filtro `accept` del picker. Sin `accept` (`undefined`/vacío) →
 * todos pasan. Con `accept` y una extensión NO reconocida por `guessMimeType` → se EXCLUYE
 * (conservador: mejor ocultar un asset ambiguo que dejar elegir uno que probablemente no encaje —
 * el filtro es solo-UX, nunca la única barrera: `validateNewFile`/el backend re-validan de verdad
 * el `File` ya descargado en cuanto el widget lo fusiona en su valor).
 */
export function matchesAccept(ref: FileRef, accept: string[] | undefined): boolean {
	if (!accept || accept.length === 0) return true;
	const mime = guessMimeType(ref);
	if (mime === null) return false;
	return matchesMimePattern(mime, accept);
}
