/**
 * Cálculo PURO de `collectionState` frente al bootstrap del Anexo A (§A.4.6): dado el esquema
 * descubierto y si el adaptador puede crear colecciones (`Capabilities.schemaBootstrap`), decide
 * si una colección reservada concreta ya existe, se puede crear, o hay que importarla a mano.
 *
 * Nació en `settings/collection-state.ts` (P3 §3.5) hardcodeado a `VEGA_COLLECTION`; P6 (§9 del
 * contrato) necesita el MISMO cálculo para `vega_media` — de ahí que viva aquí, en `backend/`
 * (módulo neutral, sin conocer ni `/settings` ni `/media`) y no bajo `settings/`. Cada llamador
 * (P3 en `/settings`, P6 en `/media`) pasa su propio nombre de colección; ninguno clona esta
 * lógica.
 */

import type { Capabilities, ContentType } from './types';

/**
 * `'present'`: `collectionName` ya está entre los tipos descubiertos.
 * `'creatable'`: no está, pero `capabilities.schemaBootstrap` permite crearla (el llamador ofrece
 * el gate de confirmación del Anexo A, §A.4.6).
 * `'manual'`: no está y el adaptador no puede crearla (el llamador muestra el JSON de importación).
 */
export type CollectionState = 'present' | 'creatable' | 'manual';

/**
 * `types` viene de `port.listContentTypes()`; `schemaBootstrap` de `Capabilities`. Ninguno de
 * los dos se consulta aquí (módulo puro): el llamador los trae ya resueltos.
 */
export function computeCollectionState(
	types: readonly ContentType[],
	collectionName: string,
	schemaBootstrap: Capabilities['schemaBootstrap']
): CollectionState {
	if (types.some((type) => type.name === collectionName)) return 'present';
	return schemaBootstrap ? 'creatable' : 'manual';
}
