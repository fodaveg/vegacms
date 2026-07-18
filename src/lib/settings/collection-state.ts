/**
 * Cálculo PURO de `collectionState` para el `ManifestEditor` de P2 en `/settings` (§3.5 del
 * contrato P3). P3 es quien decide este dato — el editor solo lo consume, no lo recalcula.
 */

import { VEGA_COLLECTION, type Capabilities, type ContentType } from '$lib/backend';

/**
 * `'present'`: la colección `vega` ya está entre los tipos descubiertos.
 * `'creatable'`: no está, pero `capabilities.schemaBootstrap` permite crearla (el editor ofrece
 * el gate de confirmación del Anexo A, §A.4.6 — P3 no lo duplica).
 * `'manual'`: no está y el adaptador no puede crearla (el editor muestra el JSON de importación).
 */
export type CollectionState = 'present' | 'creatable' | 'manual';

/**
 * `types` viene de `port.listContentTypes()`; `schemaBootstrap` de `Capabilities`. Ninguno de
 * los dos se consulta aquí (módulo puro): la Fase 2 los trae ya resueltos.
 */
export function computeCollectionState(
	types: readonly ContentType[],
	schemaBootstrap: Capabilities['schemaBootstrap']
): CollectionState {
	if (types.some((type) => type.name === VEGA_COLLECTION.name)) return 'present';
	return schemaBootstrap ? 'creatable' : 'manual';
}
