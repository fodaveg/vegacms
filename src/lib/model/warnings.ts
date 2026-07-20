/**
 * Fábricas de `ModelWarning` (§2/§5 del contrato P2): un helper por `WarningCode`, mensaje
 * humano en español y accionable, con `collection`/`field`/`path` (JSON Pointer) cuando
 * aplica. `resolve.ts` y `conventions.ts` SOLO construyen warnings a través de aquí, para que
 * el texto sea consistente en todo el resolutor.
 */

import type { ModelWarning } from './types';

/** JSON Pointer a una colección: `/collections/<c>`. */
function collectionPath(collection: string): string {
	return `/collections/${collection}`;
}

/** JSON Pointer a un campo de una colección: `/collections/<c>/fields/<f>`. */
function fieldPath(collection: string, field: string): string {
	return `${collectionPath(collection)}/fields/${field}`;
}

/** `manifest-unreadable` — el campo `manifest` no es JSON válido o su raíz no es un objeto. */
export function manifestUnreadable(): ModelWarning {
	return {
		code: 'manifest-unreadable',
		message:
			'El manifiesto no es un JSON válido (o su raíz no es un objeto); se ha ignorado y se usan los valores por defecto.'
	};
}

/** `manifest-version-newer` — `schemaVersion` es mayor que la que este Vega entiende. */
export function manifestVersionNewer(schemaVersion: number): ModelWarning {
	return {
		code: 'manifest-version-newer',
		message: `El manifiesto declara schemaVersion ${schemaVersion}, más nueva que la soportada (1); se han leído solo las claves conocidas.`,
		path: '/schemaVersion'
	};
}

/** `manifest-invalid-key` — clave conocida con tipo o valor inválido: se ignora esa clave. */
export function manifestInvalidKey(path: string, message: string): ModelWarning {
	return { code: 'manifest-invalid-key', message, path };
}

/** `orphan-collection` — `collections.<name>` no existe en el esquema descubierto. */
export function orphanCollection(collection: string): ModelWarning {
	return {
		code: 'orphan-collection',
		message: `El manifiesto configura la colección "${collection}", que no existe en el esquema; se ha ignorado.`,
		collection,
		path: collectionPath(collection)
	};
}

/** `orphan-field` — `collections.<c>.fields.<f>` no existe en los campos del tipo. */
export function orphanField(collection: string, field: string): ModelWarning {
	return {
		code: 'orphan-field',
		message: `El manifiesto configura el campo "${field}" de "${collection}", que no existe en el tipo; se ha ignorado.`,
		collection,
		field,
		path: fieldPath(collection, field)
	};
}

/** `widget-incompatible` — override de widget imposible para el tipo real del campo. */
export function widgetIncompatible(
	collection: string,
	field: string,
	requestedWidget: string
): ModelWarning {
	return {
		code: 'widget-incompatible',
		message: `El widget "${requestedWidget}" no es compatible con el campo "${field}" de "${collection}"; se usa el widget por defecto.`,
		collection,
		field,
		path: `${fieldPath(collection, field)}/widget`
	};
}

/** `title-field-invalid` — `titleField` inexistente o no representable; sigue la cascada §4.4. */
export function titleFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'title-field-invalid',
		message: `El campo título "${requestedField}" declarado para "${collection}" no existe o no es representable como texto; se sigue la cascada por convención.`,
		collection,
		path: `${collectionPath(collection)}/titleField`
	};
}

/** `status-field-invalid` — `statusField` que no cumple la convención §4.5. */
export function statusFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'status-field-invalid',
		message: `El campo de publicación "${requestedField}" declarado para "${collection}" no es un select simple con las opciones "draft"/"published"; se sigue la convención por nombre.`,
		collection,
		path: `${collectionPath(collection)}/statusField`
	};
}

/** `order-field-invalid` — `orderField` inexistente o no numérico; se desactiva el reorder manual. */
export function orderFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'order-field-invalid',
		message: `El campo de orden manual "${requestedField}" declarado para "${collection}" no existe o no es numérico; se desactiva el reorder manual.`,
		collection,
		path: `${collectionPath(collection)}/orderField`
	};
}

/** `preview-url-invalid` — placeholder desconocido o no escalar en `previewUrl`. */
export function previewUrlInvalid(collection: string): ModelWarning {
	return {
		code: 'preview-url-invalid',
		message: `La plantilla previewUrl de "${collection}" referencia un campo inexistente o no escalar; se desactiva el botón "Ver en el sitio".`,
		collection,
		path: `${collectionPath(collection)}/previewUrl`
	};
}

/** `list-field-unknown` — un nombre de `listFields` no existe en el tipo; se omite. */
export function listFieldUnknown(collection: string, field: string, index: number): ModelWarning {
	return {
		code: 'list-field-unknown',
		message: `listFields de "${collection}" incluye el campo "${field}", que no existe; se ha omitido de la lista.`,
		collection,
		field,
		path: `${collectionPath(collection)}/listFields/${index}`
	};
}

/** `icon-unknown` — el icono declarado no está en `knownIcons`. */
export function iconUnknown(collection: string, icon: string): ModelWarning {
	return {
		code: 'icon-unknown',
		message: `El icono "${icon}" de "${collection}" no existe en el set de iconos de Vega; se usa el icono genérico.`,
		collection,
		path: `${collectionPath(collection)}/icon`
	};
}

/** `singleton-invalid` — `singleton: true` sobre un tipo `readonly` (view). */
export function singletonInvalid(collection: string): ModelWarning {
	return {
		code: 'singleton-invalid',
		message: `"${collection}" es de solo lectura (vista) y no puede marcarse como singleton; se ignora.`,
		collection,
		path: `${collectionPath(collection)}/singleton`
	};
}

/**
 * `multiple-vega-records` — la colección `vega` tiene más de un registro. La emite
 * `loadContentModel` (§6.2, Fase 2), no `resolveContentModel`; vive aquí porque el
 * vocabulario de warnings es único para todo P2.
 */
export function multipleVegaRecords(count: number): ModelWarning {
	return {
		code: 'multiple-vega-records',
		message: `La colección "vega" tiene ${count} registros; se usa el primero. Borra los sobrantes desde el Admin de PocketBase.`,
		collection: 'vega'
	};
}

// ————— mergedViews (L7a) —————

/** JSON Pointer a una vista fusionada: `/mergedViews/<id>`. */
function mergedViewPath(viewId: string): string {
	return `/mergedViews/${viewId}`;
}

/** JSON Pointer a una source de una vista fusionada: `/mergedViews/<id>/sources/<index>`. */
function mergedSourcePath(viewId: string, index: number): string {
	return `${mergedViewPath(viewId)}/sources/${index}`;
}

/** `merged-view-invalid` — la vista fusionada `viewId` se descarta por no tener NINGUNA source
 *  válida (todas huérfanas y/o sin orderField resoluble). */
export function mergedViewInvalid(viewId: string): ModelWarning {
	return {
		code: 'merged-view-invalid',
		message: `La vista fusionada "${viewId}" no tiene ninguna source válida; se ha descartado la vista entera.`,
		mergedView: viewId,
		path: mergedViewPath(viewId)
	};
}

/**
 * `merged-source-orphan` — la source `index` de `viewId` no resuelve a una colección usable:
 * `collection === null` significa que la clave está ausente o no es un texto no vacío (queda sin
 * declarar); en el resto de casos `collection` es el nombre que declaró y `reserved` distingue
 * "no existe en el esquema" de "es una colección reservada de Vega" (`vega`/`vega_*`, L7). En los
 * tres casos la source se descarta.
 */
export function mergedSourceOrphan(
	viewId: string,
	index: number,
	collection: string | null,
	reserved: boolean
): ModelWarning {
	const subject = `La source ${index} de la vista fusionada "${viewId}"`;
	const message =
		collection === null
			? `${subject} no declara una colección válida; se ha descartado esa source.`
			: reserved
				? `${subject} referencia la colección "${collection}", que es reservada de Vega; se ha descartado esa source.`
				: `${subject} referencia la colección "${collection}", que no existe en el esquema; se ha descartado esa source.`;
	return {
		code: 'merged-source-orphan',
		message,
		mergedView: viewId,
		...(collection !== null ? { collection } : {}),
		path: mergedSourcePath(viewId, index)
	};
}

/**
 * `merged-source-order-invalid` — la source `index` de `viewId` (colección `collection`) no
 * tiene un `orderField` resoluble: ni ella ni la vista declaran uno (`requestedField === null`)
 * o el nombre declarado no existe / no es numérico en `collection`. La source se descarta: sin
 * orden manual no se puede pintar como fila ordenable de la vista fusionada.
 */
export function mergedSourceOrderInvalid(
	viewId: string,
	index: number,
	collection: string,
	requestedField: string | null
): ModelWarning {
	const message =
		requestedField !== null
			? `El orderField "${requestedField}" de la source ${index} ("${collection}") de la vista fusionada "${viewId}" no existe o no es numérico; se ha descartado esa source.`
			: `La source ${index} ("${collection}") de la vista fusionada "${viewId}" no declara orderField (ni ella ni la vista); se ha descartado esa source.`;
	return {
		code: 'merged-source-order-invalid',
		message,
		mergedView: viewId,
		collection,
		path: `${mergedSourcePath(viewId, index)}/orderField`
	};
}

/**
 * `icon-unknown` (reutilizado, L7a) — el icono `icon` declarado en la vista fusionada `viewId`
 * no está en `knownIcons`. A diferencia de `iconUnknown` (colecciones), NO pone `collection`
 * (`viewId` no es una colección; colarlo ahí podría colisionar con una colección real del mismo
 * nombre) y el `path` apunta a `/mergedViews/<viewId>/icon`, no a `/collections/<viewId>/icon`.
 */
export function mergedViewIconUnknown(viewId: string, icon: string): ModelWarning {
	return {
		code: 'icon-unknown',
		message: `El icono "${icon}" de la vista fusionada "${viewId}" no existe en el set de iconos de Vega; se usa el icono genérico.`,
		mergedView: viewId,
		path: `${mergedViewPath(viewId)}/icon`
	};
}

/**
 * `title-field-invalid` (reutilizado, L7a) — el override `titleField` de la source `index`
 * (colección `collection`) de la vista fusionada `viewId` no existe o no es representable en esa
 * colección; se cae al `titleField` ya resuelto del tipo (§4.4, misma cascada que `collections`).
 * A diferencia de `titleFieldInvalid` (colecciones), el `path` apunta dentro de la source
 * (`/mergedViews/<viewId>/sources/<index>/titleField`, no `/collections/<collection>/titleField`
 * — esa clave no es la que falló aquí) y lleva `mergedView` además de `collection`.
 */
export function mergedSourceTitleFieldInvalid(
	viewId: string,
	index: number,
	collection: string,
	requestedField: string
): ModelWarning {
	return {
		code: 'title-field-invalid',
		message: `El campo título "${requestedField}" declarado para la source ${index} ("${collection}") de la vista fusionada "${viewId}" no existe o no es representable como texto; se usa el titleField resuelto del tipo.`,
		mergedView: viewId,
		collection,
		path: `${mergedSourcePath(viewId, index)}/titleField`
	};
}

/**
 * `merged-view-name-collision` — el id de la vista fusionada `viewId` coincide con el `name` de
 * una colección del esquema (visible o no: el nombre sigue reservado igualmente). Gana la
 * colección: la vista se descarta ENTERA (no llega a `ContentModel.mergedViews` ni a `nav`), no
 * hay merge posible (L7e). Comparado contra TODAS las colecciones, no solo las visibles, porque
 * `buildNav` solo pliega las visibles pero el namespace de rutas (`/c/:type`) sigue siendo del
 * tipo aunque esté oculto.
 */
export function mergedViewNameCollision(viewId: string): ModelWarning {
	return {
		code: 'merged-view-name-collision',
		message: `La vista fusionada "${viewId}" usa un id que ya pertenece a una colección; se ha descartado la vista (renómbrala en el manifiesto).`,
		mergedView: viewId,
		path: mergedViewPath(viewId)
	};
}

/**
 * `merged-where-invalid` — la condición `prop` del `where` de la source `index` de `viewId`
 * (colección `collection`) referencia un campo inexistente en esa colección, o uno que no admite
 * el operador `eq` (§4.6 del contrato de query, misma ley que `search.ts`); se ignora SOLO esa
 * condición, el resto del `where` (y la source) sigue en pie.
 */
export function mergedWhereInvalid(
	viewId: string,
	index: number,
	collection: string,
	prop: string
): ModelWarning {
	return {
		code: 'merged-where-invalid',
		message: `La condición "${prop}" del where de la source ${index} ("${collection}") de la vista fusionada "${viewId}" referencia un campo inexistente o que no admite "eq"; se ha ignorado esa condición.`,
		mergedView: viewId,
		collection,
		field: prop,
		path: `${mergedSourcePath(viewId, index)}/where/${prop}`
	};
}
