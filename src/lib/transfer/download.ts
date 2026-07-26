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
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
	} finally {
		URL.revokeObjectURL(url);
	}
}
