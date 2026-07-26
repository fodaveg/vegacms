/**
 * Trae el binario de un `{ file, url }` exportado (§4.4 del contrato de `#lote-esquema`, ver la
 * cabecera de `export-collection.ts`): `fetch(url)` del ORIGEN → `File`, listo para ir en el mismo
 * `create`/`update` del destino. Único punto de red de la Fase 2 fuera de `BackendPort` — separado
 * de `record-deserializer.ts` (que lo recibe inyectado) para que ese módulo y `import-preview.ts`
 * (que usa esta misma función para comprobar si un `file` `required` es traíble ANTES de escribir,
 * §4.2) puedan testearse con un doble sin tocar `fetch` real.
 *
 * **Nunca lanza**: red caída, CORS, 404 o cualquier otra forma de "no se puede traer" resuelven
 * igual a `null` — es al llamador (`record-deserializer.ts`/`import-preview.ts`) a quien le toca
 * decidir qué significa `null` en su contexto (campo vacío vs registro BLOQUEADO). Distinguir el
 * motivo exacto del fallo no aporta nada aquí: el desenlace para el usuario es el mismo,
 * "esta imagen no se pudo traer, resúbela a mano" (§4.4, "el texto es lo caro de rehacer, una
 * imagen se resube").
 */

import type { TransferFileValue } from './record-serializer';

/**
 * Trae `file.url` y lo envuelve en un `File` con el nombre original (`file.file`, el `FileRef` de
 * origen) — el destino le asignará su propio nombre al guardarlo (PocketBase renombra todo
 * fichero subido, landmine conocida, ver cabecera de `export-collection.ts`), así que el nombre
 * aquí es solo para que el `File` sea válido y legible en depuración, nunca una promesa de que se
 * conserva.
 */
export async function fetchTransferFile(file: TransferFileValue): Promise<File | null> {
	try {
		const response = await fetch(file.url);
		if (!response.ok) return null;
		const blob = await response.blob();
		return new File([blob], file.file, { type: blob.type || undefined });
	} catch {
		return null;
	}
}
