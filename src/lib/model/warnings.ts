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
