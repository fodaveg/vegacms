/**
 * Medidas REALES de un asset de `vega_media` para el subtítulo de su tarjeta (mockup
 * `aquelarre-medios.html`, «2880×1800 · 1,2 MB»): el registro no guarda ni dimensiones ni tamaño
 * (§4.4: el puerto solo expone la `FileRef`, que es el nombre del binario), así que ambos datos se
 * obtienen del propio fichero, sin tocar el esquema de la colección:
 *
 * - **Dimensiones**: las pone el `<img>` que la miniatura ya carga de todos modos
 *   (`naturalWidth`/`naturalHeight` en su evento `load`) — coste cero y exactas. Eso vive en
 *   `MediaGrid.svelte`, que es quien tiene el elemento; aquí solo se define su forma.
 * - **Tamaño**: `HEAD` a la URL del fichero y `Content-Length` de la respuesta — nunca se descarga
 *   el cuerpo. La URL la construye SIEMPRE `resolveMediaFileUrl` (`media-thumb.ts`), el mismo
 *   camino que la miniatura: es el único que sabe de tokens/rutas de cada adaptador.
 * - **Adaptador `memory`** (demo y showcase): sus ficheros son data-URIs, donde no hay red que
 *   consultar — el tamaño sale de la longitud del base64, que codifica exactamente 3 bytes por
 *   cada 4 caracteres. Sin este caso, el escaparate se quedaría sin números.
 *
 * **Falla en SILENCIO, por diseño**: un `HEAD` bloqueado por CORS, un backend que no manda
 * `Content-Length`, una respuesta 4xx o una petición abortada devuelven `null` — nunca una
 * excepción ni una línea en consola. El subtítulo es información SECUNDARIA: si no se puede medir,
 * la tarjeta cae al texto de siempre (`mediaCardSubtitle`) y ahí acaba la historia; ensuciar la
 * consola por cada asset de una rejilla de 24 sería peor que no medir.
 *
 * Módulo puro respecto a Svelte y al DOM: `fetch` se inyecta (`opts.fetch`) para poder testearlo
 * sin red, mismo criterio que el resto de `media/` con el `BackendPort`.
 */

/** Medidas conocidas de UN asset. Todo opcional: llegan por caminos distintos y en momentos
 *  distintos (las dimensiones al pintar la miniatura, el tamaño al responder el `HEAD`), y
 *  cualquiera de las dos puede no llegar nunca. */
export interface MediaAssetMetrics {
	width?: number;
	height?: number;
	bytes?: number;
}

/** Opciones de `fetchAssetByteSize`. */
export interface FetchAssetByteSizeOptions {
	/** Cancela la petición (cambio de página/filtro, desmontaje): la respuesta tardía nunca debe
	 *  escribir sobre una rejilla que ya no es la suya. */
	signal?: AbortSignal;
	/** `fetch` inyectable (tests). Por defecto, el global — ausente en algún entorno de test sin
	 *  DOM, de ahí la comprobación defensiva. */
	fetch?: typeof globalThis.fetch;
}

/**
 * Bytes que codifica un data-URI en base64 (`data:<mime>;base64,<payload>`): 3 bytes por cada 4
 * caracteres del payload, menos el relleno (`=`/`==`). `null` si `url` no es un data-URI base64
 * (p.ej. `data:text/plain,hola`, texto plano URL-encoded: ahí la longitud en caracteres no es la
 * longitud en bytes, y no merece la pena decodificar para adivinarla).
 */
export function dataUrlByteLength(url: string): number | null {
	if (!url.startsWith('data:')) return null;
	const comma = url.indexOf(',');
	if (comma === -1) return null;
	const meta = url.slice(5, comma);
	if (!meta.split(';').includes('base64')) return null;
	const payload = url.slice(comma + 1);
	if (payload === '') return 0;
	const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
	const bytes = Math.floor((payload.length * 3) / 4) - padding;
	return bytes >= 0 ? bytes : null;
}

/**
 * Tamaño en bytes del binario que hay en `url`, sin descargarlo: data-URI → cálculo local
 * (`dataUrlByteLength`); cualquier otra → `HEAD` + `Content-Length`. `null` en CUALQUIER caso en
 * que no se pueda saber (ver cabecera: siempre en silencio).
 */
export async function fetchAssetByteSize(
	url: string,
	opts?: FetchAssetByteSizeOptions
): Promise<number | null> {
	if (url.startsWith('data:')) return dataUrlByteLength(url);

	const doFetch = opts?.fetch ?? globalThis.fetch;
	if (typeof doFetch !== 'function') return null;

	try {
		const response = await doFetch(url, { method: 'HEAD', signal: opts?.signal });
		if (!response.ok) return null;
		const raw = response.headers.get('content-length');
		if (raw === null || raw.trim() === '') return null;
		const bytes = Number(raw);
		return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
	} catch {
		// Red caída, CORS, `AbortError`… — todo es lo mismo aquí: no hay medida (ver cabecera).
		return null;
	}
}
