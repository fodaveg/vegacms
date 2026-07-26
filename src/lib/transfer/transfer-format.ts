/**
 * El fichero `.vega.json` (§2 del contrato de `#lote-esquema`, ver la cabecera de
 * `export-collection.ts` para el contrato completo): los tipos de la cabecera del documento y su
 * constructor puro. `TransferRecord`/`TransferFieldValue` viven en `record-serializer.ts` (cada
 * módulo posee sus tipos, mismo criterio que el resto del repo — ver p.ej. `model/types.ts`).
 */

import type { TransferRecord } from './record-serializer';

/**
 * Versión DEL FORMATO (§2, distinta de `VEGA_VERSION`): la fase 2 (importar) rechazará cualquier
 * `vegaTransfer` que no reconozca. `1` es la única versión que esta entrega produce o consumirá.
 */
export const TRANSFER_FORMAT_VERSION = 1;

export interface TransferCollection {
	type: string;
	records: TransferRecord[];
}

/** Metadatos de origen (§2): puramente informativos, la fase 2 nunca los valida ni los escribe.
 *  `backendUrl` es mejor-esfuerzo (ver `export-collection.ts`, no hay una fuente única y fiable
 *  del backend conectado en `VegaAppContext`) — un dato de contexto para quien abra el fichero a
 *  mano, no una promesa de que apunta exactamente al backend que sirvió cada registro. */
export interface TransferOrigin {
	backendUrl: string;
	vegaVersion: string;
}

export interface TransferDocument {
	vegaTransfer: typeof TRANSFER_FORMAT_VERSION;
	/** ISO 8601 UTC del instante de exportación (no confundir con `created`/`updated` de cada
	 *  registro, que viajan dentro de `values` tal cual estaban en origen). */
	exported: string;
	origin: TransferOrigin;
	collections: TransferCollection[];
}

/** Construye el documento completo (§2): `now` inyectable para tests deterministas, por defecto
 *  el instante real. */
export function buildTransferDocument(
	collections: TransferCollection[],
	origin: TransferOrigin,
	now: Date = new Date()
): TransferDocument {
	return {
		vegaTransfer: TRANSFER_FORMAT_VERSION,
		exported: now.toISOString(),
		origin,
		collections
	};
}

/** Nombre de fichero de descarga para una colección (§3: "descarga el JSON como fichero"): un
 *  fichero por exportación, con la extensión que el contrato reserva para el formato entero. */
export function transferFilename(collectionType: string): string {
	return `${collectionType}.vega.json`;
}
