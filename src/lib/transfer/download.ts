/**
 * Descarga de `TransferDocument` en el cliente (§3 del contrato: "descarga el JSON como fichero.
 * No se sube nada a ningún sitio", ver la cabecera de `export-collection.ts`). Efecto de DOM puro
 * (crear un `<a download>` sintético, mismo patrón mínimo que cualquier "descargar" del
 * navegador, sin librería): deliberadamente sin test unitario (no hay nada que afirmar sobre un
 * click sintético que no sea re-implementar jsdom) — lo ejercita el e2e de exportar
 * (`e2e/transfer.spec.ts`), que sí puede observar el `download` real que dispara Playwright.
 */

import type { TransferDocument } from './transfer-format';

/** Sirve `doc` como descarga `filename` (`application/json`), vía un `Blob` + un `<a>` temporal
 *  nunca insertado de forma visible. `URL.revokeObjectURL` en un `finally`: si `a.click()`
 *  lanzara (no debería, pero es una API de navegador), la URL del objeto no se queda huérfana. */
export function downloadTransferDocument(doc: TransferDocument, filename: string): void {
	const json = JSON.stringify(doc, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	try {
		downloadFromUrl(url, filename);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * Abre `url` como descarga `filename` con el mismo `<a download>` temporal. Para ficheros que ya
 * sirve el backend (las copias de seguridad de `/copias`, con su token en la URL): el navegador
 * los baja directamente, sin pasar el contenido por memoria. Si la URL es de otro origen, el
 * atributo `download` no cuenta y manda la cabecera `Content-Disposition` del servidor, que
 * PocketBase envía como adjunto con el nombre de la copia (medido contra 0.39.6).
 */
export function downloadFromUrl(url: string, filename: string): void {
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = 'noopener';
	anchor.click();
}
