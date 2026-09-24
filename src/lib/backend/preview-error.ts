/**
 * Clasifica el error de una petición de preview (`preview-client.ts#requestPreview`) para que
 * `PreviewPanel.svelte` y `VisualEditorScreen.svelte` —las DOS superficies que lo consumen (ver
 * la cabecera de `preview-client.ts`: nunca lanza `VegaError`, sus errores son `Error` planos y
 * cada consumidor traduce con su propio criterio)— decidan el MISMO mensaje ante el MISMO tipo de
 * fallo, en vez de duplicar la distinción (hallazgo p3, lote "formularios y medios").
 *
 * `preview-client.ts` lanza un `Error` PLANO con un mensaje YA legible (código de estado incluido)
 * cuando la respuesta HTTP no es `2xx` o su cuerpo no tiene forma válida — ese mensaje se conserva
 * tal cual. Un fallo de RED (el propio `fetch()` rechazando: DNS, CORS, conexión rehusada, sin
 * conexión…) nunca llega a construir ese `Error`: el navegador rechaza la promesa con un
 * `TypeError` cuyo mensaje ("Failed to fetch", "Load failed", "NetworkError when attempting to
 * fetch resource"…) varía por motor y NUNCA es apto para enseñárselo a un usuario en crudo — de
 * ahí la distinción: `kind: 'network'` no trae mensaje, el consumidor pinta uno genérico YA
 * traducido (`common.networkError`).
 */

export type PreviewErrorKind = 'network' | 'http' | 'unknown';

export interface ClassifiedPreviewError {
	kind: PreviewErrorKind;
	/** Mensaje YA legible del `Error` lanzado por `preview-client.ts` (`kind: 'http'`); `null`
	 *  para `'network'` (mensaje del motor, no apto para el usuario) y `'unknown'` (lo lanzado ni
	 *  siquiera era un `Error`, caso defensivo que hoy no debería darse en la práctica). */
	message: string | null;
}

export function classifyPreviewError(err: unknown): ClassifiedPreviewError {
	if (err instanceof TypeError) return { kind: 'network', message: null };
	if (err instanceof Error) return { kind: 'http', message: err.message };
	return { kind: 'unknown', message: null };
}
