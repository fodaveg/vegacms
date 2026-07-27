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

/** `subtitle-field-invalid` — `subtitleField` inexistente o no escalar; sin línea secundaria. */
export function subtitleFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'subtitle-field-invalid',
		message: `El campo subtítulo "${requestedField}" declarado para "${collection}" no existe o no es escalar; se ignora (sin línea secundaria en el listado).`,
		collection,
		path: `${collectionPath(collection)}/subtitleField`
	};
}

/** `slug-field-invalid` — `slugField` inexistente o no representable como texto; el editor no
 *  pinta la fila de slug (control mono + "Regenerar"). Mismo criterio de "representable" que
 *  `titleFieldInvalid` (§4.4, solo `text`/`email`/`url`) y NO el más laxo de `subtitleField`: un
 *  slug se ESCRIBE en un control de texto, no solo se muestra, así que un `number`/`date` no vale
 *  aunque su celda tenga texto. */
export function slugFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'slug-field-invalid',
		message: `El campo slug "${requestedField}" declarado para "${collection}" no existe o no es un campo de texto; se ignora (el editor no ofrece regenerarlo).`,
		collection,
		path: `${collectionPath(collection)}/slugField`
	};
}

/** `default-sort-field-invalid` — `defaultSort.field` inexistente o no escalar; sin orden por
 *  defecto (mismo criterio de "escalar" que `subtitleFieldInvalid`, no el más estricto de
 *  `titleFieldInvalid`). */
export function defaultSortFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'default-sort-field-invalid',
		message: `El campo de orden por defecto "${requestedField}" declarado para "${collection}" no existe o no es escalar; se ignora (el listado arranca sin orden por defecto).`,
		collection,
		path: `${collectionPath(collection)}/defaultSort/field`
	};
}

/** `status-labels-unknown-value` — una clave de `statusLabels` no corresponde a ninguna opción
 *  del `statusField` resuelto de `collection`. NO se descarta esa entrada (la clave puede
 *  corresponder a un valor legítimo que el `select` admite pero que la convención de publicación
 *  no exige, o a un valor que llegará más adelante): solo se avisa, mismo criterio "informativo,
 *  no destructivo" que un manifiesto tolerante. */
export function statusLabelUnknownValue(collection: string, value: string): ModelWarning {
	return {
		code: 'status-labels-unknown-value',
		message: `statusLabels de "${collection}" declara una etiqueta para "${value}", que no es una opción del campo de publicación; se conserva la etiqueta por si acaso pero revisa el valor.`,
		collection,
		path: `${collectionPath(collection)}/statusLabels/${value}`
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
 * `blocks-invalid` — `collections.<c>.blocks` no resuelve contra el esquema real: la colección
 * hija declarada no existe (o es reservada), el `parentField` no es una relación NO-múltiple de
 * esa hija de vuelta a `collection`, o el `orderField` no existe/no es numérico en ella. Las tres
 * causas comparten código (mismo criterio "todo o nada" que `merged-view-invalid`: sin las tres
 * piezas válidas no hay semántica parcial de bloques que conservar) pero cada una tiene su propio
 * mensaje y su propio `path`, para que quien lea el warning sepa exactamente cuál de las tres
 * claves corregir sin tener que adivinarlo del texto genérico.
 */
export function blocksInvalid(
	collection: string,
	reason: 'collection' | 'parentField' | 'orderField',
	requestedValue: string
): ModelWarning {
	const message =
		reason === 'collection'
			? `blocks de "${collection}" declara la colección hija "${requestedValue}", que no existe en el esquema (o es reservada de Vega); se ignora la capacidad de bloques.`
			: reason === 'parentField'
				? `blocks de "${collection}" declara el campo padre "${requestedValue}", que no es una relación simple (no múltiple) de vuelta a "${collection}" en la colección hija; se ignora la capacidad de bloques.`
				: `blocks de "${collection}" declara el orderField "${requestedValue}", que no existe o no es numérico en la colección hija; se ignora la capacidad de bloques.`;
	return {
		code: 'blocks-invalid',
		message,
		collection,
		path: `${collectionPath(collection)}/blocks/${reason}`
	};
}

/**
 * `blocks-heterogeneous-invalid` — la pareja `typeField`/`dataField` de `blocks` no vale: solo una
 * de las dos se declaró, o alguna no resuelve contra el esquema real de la colección hija
 * (`typeField` debe ser `text`, `dataField` debe ser `json`). A diferencia de `blocksInvalid`, esto
 * NUNCA invalida `blocks` entero — `collection`/`parentField`/`orderField` ya se validaron aparte y
 * siguen en pie; solo la pareja cae a `null`/`null` (modo homogéneo, el histórico).
 */
export function blocksHeterogeneousInvalid(collection: string): ModelWarning {
	return {
		code: 'blocks-heterogeneous-invalid',
		message: `blocks de "${collection}" declara typeField/dataField a medias o inválidos (deben ser, las DOS o ninguna, un campo "text" y un campo "json" reales de la colección hija); se degrada al modo homogéneo (una sola plantilla de bloque, sin vocabulario de tipos).`,
		collection,
		path: `${collectionPath(collection)}/blocks`
	};
}

/** JSON Pointer a un tipo de bloque: `/blockTypes/<t>`. */
function blockTypePath(name: string): string {
	return `/blockTypes/${name}`;
}

/**
 * `block-type-invalid` — `blockTypes.<name>` se descarta ENTERO: la clave no casa el patrón
 * `^[a-z][a-z0-9-]*$` (`reason: 'name'`, viaja tal cual al nombre de componente Astro y al
 * documento de discovery, de ahí lo estricto), la declaración no es un objeto (`'shape'`), le falta
 * un `label` de 1 a 60 caracteres (`'label'`), o se queda sin NINGÚN campo válido tras filtrar los
 * inválidos de `fields` (`'fields'`, cada campo descartado ya emitió su propio
 * `block-type-field-invalid`). Las cuatro comparten código (mismo criterio "todo o nada" que
 * `blocksInvalid`) pero cada motivo tiene su propio mensaje, para que quien lea el warning sepa
 * exactamente qué corregir.
 */
export function blockTypeInvalid(
	name: string,
	reason: 'name' | 'shape' | 'label' | 'fields'
): ModelWarning {
	const message =
		reason === 'name'
			? `blockTypes declara el tipo de bloque "${name}", cuya clave no cumple el patrón ^[a-z][a-z0-9-]*$ (ese nombre viaja al componente Astro y al documento de discovery del sitio); se ignora ese tipo de bloque.`
			: reason === 'shape'
				? `blockTypes.${name} no es un objeto; se ignora ese tipo de bloque.`
				: reason === 'label'
					? `blockTypes.${name} no declara un label de 1 a 60 caracteres; se ignora ese tipo de bloque.`
					: `blockTypes.${name} se queda sin ningún campo válido tras descartar los inválidos; se ignora ese tipo de bloque.`;
	return { code: 'block-type-invalid', message, blockType: name, path: blockTypePath(name) };
}

/**
 * `block-type-field-invalid` — el item `index` de `blockTypes.<typeName>.fields` se descarta. Dos
 * motivos, mismo código porque la consecuencia es la misma (ese campo no llega al formulario y el
 * tipo de bloque SOBREVIVE con el resto):
 *
 * - `'shape'`: le falta `name`/`label`/`widget`, alguno tiene forma inválida, o `widget` cae fuera
 *   del subconjunto permitido dentro de un bloque (`relation`/`file`/`unsupported`, ver
 *   `BLOCK_FIELD_WIDGET_IDS` en `types.ts`, excluidos porque dentro de un JSON no hay relaciones ni
 *   gestión de ficheros de PocketBase).
 * - `'duplicate'`: su `name` ya lo declaró un campo ANTERIOR del mismo tipo. `name` es la clave
 *   dentro del `data` JSON del bloque, así que dos campos con el mismo `name` no son dos campos:
 *   son dos filas del formulario escribiendo la MISMA clave, donde editar una pisa a la otra sin
 *   que nada lo diga. Gana el primero (el orden de `fields` es el del formulario, así que el
 *   primero es el que el autor del manifiesto vio primero).
 */
export function blockTypeFieldInvalid(
	typeName: string,
	index: number,
	reason: 'shape' | 'duplicate' = 'shape',
	duplicateName?: string
): ModelWarning {
	const message =
		reason === 'duplicate'
			? `El campo ${index} de blockTypes.${typeName} repite el name "${duplicateName}" de un campo anterior; dentro de un bloque el name es la clave del JSON, así que se ignora ese campo (gana el primero).`
			: `El campo ${index} de blockTypes.${typeName} no es válido (name/label/widget ausente o con forma inválida, o un widget fuera del subconjunto permitido dentro de un bloque); se ignora ese campo.`;
	return {
		code: 'block-type-field-invalid',
		message,
		blockType: typeName,
		path: `${blockTypePath(typeName)}/fields/${index}`
	};
}

/**
 * `icon-unknown` (reutilizado) — el icono `icon` declarado en `blockTypes.<typeName>` no está en
 * `knownIcons`. Mismo criterio que `mergedViewIconUnknown`: `path` apunta a
 * `/blockTypes/<typeName>/icon`, no a `/collections/<typeName>/icon` (un tipo de bloque no es una
 * colección), y usa `blockType` en vez de `collection`.
 */
export function blockTypeIconUnknown(typeName: string, icon: string): ModelWarning {
	return {
		code: 'icon-unknown',
		message: `El icono "${icon}" del tipo de bloque "${typeName}" no existe en el set de iconos de Vega; se usa el icono genérico.`,
		blockType: typeName,
		path: `${blockTypePath(typeName)}/icon`
	};
}

/** `social-title-field-invalid` — `social.titleField` inexistente o no representable; se cae a
 *  la cascada de `titleField` del tipo (§4.4), igual que si la clave no se hubiera declarado. */
export function socialTitleFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'social-title-field-invalid',
		message: `El campo de título social "${requestedField}" declarado para "${collection}" no existe o no es representable como texto; se usa el titleField del tipo.`,
		collection,
		path: `${collectionPath(collection)}/social/titleField`
	};
}

/** `social-description-field-invalid` — `social.descriptionField` inexistente o no es
 *  `text`/`richtext`; la tarjeta social se pinta sin descripción (SIN fallback posible). */
export function socialDescriptionFieldInvalid(
	collection: string,
	requestedField: string
): ModelWarning {
	return {
		code: 'social-description-field-invalid',
		message: `El campo de descripción social "${requestedField}" declarado para "${collection}" no existe o no es un campo de texto; se ignora (la tarjeta se pinta sin descripción).`,
		collection,
		path: `${collectionPath(collection)}/social/descriptionField`
	};
}

/** `social-image-field-invalid` — `social.imageField` inexistente o no es `file` NO múltiple; la
 *  tarjeta social se pinta sin imagen (SIN fallback posible). */
export function socialImageFieldInvalid(collection: string, requestedField: string): ModelWarning {
	return {
		code: 'social-image-field-invalid',
		message: `El campo de imagen social "${requestedField}" declarado para "${collection}" no existe o no es un campo de fichero no múltiple; se ignora (la tarjeta se pinta sin imagen).`,
		collection,
		path: `${collectionPath(collection)}/social/imageField`
	};
}

/** `social-url-invalid` — `social.urlTemplate` con un placeholder desconocido o no escalar
 *  (misma validación que `previewUrl`, §4.7); se cae al `previewUrl` ya resuelto del tipo. */
export function socialUrlInvalid(collection: string): ModelWarning {
	return {
		code: 'social-url-invalid',
		message: `La plantilla social.urlTemplate de "${collection}" referencia un campo inexistente o no escalar; se usa el previewUrl del tipo.`,
		collection,
		path: `${collectionPath(collection)}/social/urlTemplate`
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
