/**
 * Mapeo de esquema PocketBase → Vega (§6 del contrato) y, para `ensureCollections` (Anexo A),
 * el mapeo inverso mínimo (`CollectionFieldSpec` → payload de creación de campo PB).
 */

import type { CollectionModel, CollectionField } from 'pocketbase';
import type { AccessLevel, Field, ContentType, TypeAccess } from '../../types';
import type { CollectionFieldSpec } from '../../collections';

/**
 * Inclusión/exclusión normativa (§4.2): excluye colecciones de sistema (`system: true`,
 * nombres `_*`) y las de tipo `auth` (D-P1.1) — esto último cubre tanto `_superusers`
 * (ya excluida por `system`) como `users` (la colección auth por defecto de PB, que NO es
 * `system` pero sí `type: 'auth'`; verificado contra 0.39.6, un install nuevo la trae de serie).
 */
export function isExcludedCollection(collection: CollectionModel): boolean {
	return (
		collection.system === true || collection.type === 'auth' || collection.name.startsWith('_')
	);
}

/**
 * Convierte TODAS las colecciones crudas de PB en `ContentType[]` normalizados, ya filtradas
 * y ordenadas alfabéticamente (§4.2). Las `relation` cuyo target no esté expuesto (excluido o
 * inexistente) degradan a `unsupported` (§6, §9.10) — de ahí que necesitemos el conjunto
 * COMPLETO de colecciones para resolver `collectionId → name` antes de mapear cada campo.
 */
export function mapCollectionsToContentTypes(collections: CollectionModel[]): ContentType[] {
	const exposedNameById = new Map<string, string>();
	for (const c of collections) {
		if (!isExcludedCollection(c)) exposedNameById.set(c.id, c.name);
	}

	const result: ContentType[] = [];
	for (const c of collections) {
		if (isExcludedCollection(c)) continue;
		result.push(mapCollectionToContentType(c, exposedNameById));
	}
	return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function mapCollectionToContentType(
	collection: CollectionModel,
	exposedNameById: Map<string, string>
): ContentType {
	const fields: Field[] = [];
	for (const raw of collection.fields) {
		// system (incl. `id`, `tokenKey`…) y la primary key se excluyen de `fields` (§6, §2.2).
		if (raw.system || raw.primaryKey) continue;
		fields.push(mapField(raw, exposedNameById, hasUniqueIndex(collection, raw.name as string)));
	}
	return {
		name: collection.name,
		readonly: collection.type === 'view',
		fields,
		access: mapCollectionAccess(collection)
	};
}

/**
 * Traduce una API rule de PocketBase a `AccessLevel` (`#lote-shell`). Las tres formas que
 * distingue PB, **medidas contra 0.39.6 real** (`tests/contract/pocketbase.contract.test.ts`), no
 * supuestas:
 * - `null` ⇒ la operación está reservada a superusers ⇒ `'denied'` para cualquier sesión normal.
 * - `''` (cadena VACÍA) ⇒ abierta a todo el mundo ⇒ `'allowed'`. Ojo con el orden de las
 *   comprobaciones: `null` y `''` son ambos falsy y confundirlos invierte el significado de la
 *   regla más peligrosa que hay ("solo superuser" pasaría a leerse como "cualquiera").
 * - Cualquier expresión (`@request.auth.id != ''`, `autor = @request.auth.id`…) ⇒
 *   `'conditional'`: solo el backend sabe si se cumple para ESTE registro y ESTE usuario.
 *
 * El SDK tipa las reglas como `string | undefined`; una regla ausente del JSON se trata igual que
 * `null` (lo más restrictivo), que es lo que hace el propio PocketBase con una regla sin definir.
 */
function mapRule(rule: string | null | undefined): AccessLevel {
	if (rule === null || rule === undefined) return 'denied';
	return rule === '' ? 'allowed' : 'conditional';
}

/**
 * Las cinco reglas de la colección ya traducidas. Una colección `view` (`readonly: true`) NO
 * puede crear/actualizar/borrar por construcción —PocketBase ni siquiera expone esos endpoints—
 * así que sus tres reglas de escritura salen `'denied'` sin mirar el JSON: son `null` de todas
 * formas, pero dejarlo escrito evita que un futuro cambio de forma en PB las vuelva "conditional"
 * y la UI ofrezca crear registros en una vista.
 */
function mapCollectionAccess(collection: CollectionModel): TypeAccess {
	const isView = collection.type === 'view';
	return {
		list: mapRule(collection.listRule),
		view: mapRule(collection.viewRule),
		create: isView ? 'denied' : mapRule(collection.createRule),
		update: isView ? 'denied' : mapRule(collection.updateRule),
		delete: isView ? 'denied' : mapRule(collection.deleteRule)
	};
}

/** `true` si el adaptador puede determinar unicidad mono-columna (mejor-esfuerzo, §2.2). */
function hasUniqueIndex(collection: CollectionModel, fieldName: string): boolean {
	const pattern = new RegExp(`\\(\`?${fieldName}\`?\\)`, 'i');
	return collection.indexes.some(
		(idx) => /create\s+unique\s+index/i.test(idx) && pattern.test(idx)
	);
}

function mapField(
	raw: CollectionField,
	exposedNameById: Map<string, string>,
	unique: boolean
): Field {
	const base = {
		name: raw.name as string,
		required: !!raw.required,
		readonly: false,
		presentable: !!raw.presentable,
		hidden: !!raw.hidden,
		unique
	};

	switch (raw.type) {
		case 'text':
			return {
				...base,
				type: 'text',
				subtype: 'plain',
				// Verificado 0.39.6: en `text`, 0 es el centinela de "sin límite" (no un límite de 0).
				minLength: raw.min > 0 ? raw.min : undefined,
				maxLength: raw.max > 0 ? raw.max : undefined,
				pattern: raw.pattern || undefined
			};

		case 'editor':
			// El campo PB `editor` (richtext) DEBE emitirse con subtype 'html' (§2.2 D2).
			return { ...base, type: 'richtext', subtype: 'html' };

		case 'number':
			// Verificado 0.39.6: en `number`, el centinela de "sin límite" es `null` (NO 0: un
			// campo puede legítimamente requerir min/max 0, p.ej. `rating` 0–5).
			return {
				...base,
				type: 'number',
				integer: !!raw.onlyInt,
				min: raw.min ?? undefined,
				max: raw.max ?? undefined
			};

		case 'bool':
			return { ...base, type: 'bool' };

		case 'email':
			return {
				...base,
				type: 'email',
				onlyDomains: raw.onlyDomains ?? undefined,
				exceptDomains: raw.exceptDomains ?? undefined
			};

		case 'url':
			return {
				...base,
				type: 'url',
				onlyDomains: raw.onlyDomains ?? undefined,
				exceptDomains: raw.exceptDomains ?? undefined
			};

		case 'date':
			// Verificado 0.39.6: en `date`, el centinela de "sin límite" es `''` (como los valores).
			return {
				...base,
				type: 'date',
				min: raw.min || undefined,
				max: raw.max || undefined
			};

		case 'autodate':
			// `readonly: true`; el adaptador nunca lo envía en escrituras (§6).
			return { ...base, readonly: true, type: 'date' };

		case 'select': {
			// Verificado 0.39.6: `multiple = maxSelect > 1` (el contrato original decía
			// "maxSelect ≠ 1" para relation, pero el binario real trata maxSelect 0 y 1 como
			// single para select Y relation por igual — ver README/nota de esta Fase 2).
			const maxSelect = typeof raw.maxSelect === 'number' ? raw.maxSelect : 0;
			return {
				...base,
				type: 'select',
				options: Array.isArray(raw.values) ? raw.values : [],
				multiple: maxSelect > 1,
				maxSelect: maxSelect > 0 ? maxSelect : undefined
			};
		}

		case 'relation': {
			const maxSelect = typeof raw.maxSelect === 'number' ? raw.maxSelect : 0;
			const target = exposedNameById.get(raw.collectionId as string);
			if (!target) {
				// Target inexistente o no expuesto (colección excluida): degrada a unsupported,
				// el resto del ContentType sigue funcionando (§6, §9.10). Nunca crashea (L11).
				return { ...base, type: 'unsupported', backendType: 'relation' };
			}
			return {
				...base,
				type: 'relation',
				target,
				multiple: maxSelect > 1,
				maxSelect: maxSelect > 0 ? maxSelect : undefined,
				minSelect: raw.minSelect || undefined,
				cascadeDelete: !!raw.cascadeDelete
			};
		}

		case 'file': {
			const maxSelect = typeof raw.maxSelect === 'number' ? raw.maxSelect : 0;
			return {
				...base,
				type: 'file',
				multiple: maxSelect > 1,
				maxSelect: maxSelect > 0 ? maxSelect : undefined,
				maxSizeBytes: raw.maxSize > 0 ? raw.maxSize : undefined,
				mimeTypes:
					Array.isArray(raw.mimeTypes) && raw.mimeTypes.length > 0 ? raw.mimeTypes : undefined,
				protected: !!raw.protected
			};
		}

		case 'json':
			return { ...base, type: 'json' };

		case 'geoPoint':
			return { ...base, type: 'unsupported', backendType: 'geoPoint' };

		case 'password':
			// Solo aparece en colecciones auth, ya excluidas en v1; el mapeo queda fijado (§6).
			return { ...base, type: 'unsupported', backendType: 'password' };

		default:
			// Tipo de campo PB desconocido/futuro: nunca rompe `listContentTypes` (L11, §6).
			return { ...base, type: 'unsupported', backendType: String(raw.type) };
	}
}

/**
 * Compila el vocabulario REDUCIDO de `CollectionFieldSpec` (Anexo A §A.3) al payload de campo
 * que espera `POST /api/collections` (inverso parcial del mapeo de arriba). Devuelve un objeto
 * suelto (no tipado por el SDK, que declara `fields` como `any[]`).
 */
export function collectionFieldSpecToPbField(
	spec: CollectionFieldSpec,
	relationCollectionId?: string
): Record<string, unknown> {
	switch (spec.type) {
		case 'json':
			return { name: spec.name, type: 'json' };
		case 'text':
			return {
				name: spec.name,
				type: 'text',
				required: spec.required ?? false,
				max: spec.max ?? 0
			};
		case 'select':
			return {
				name: spec.name,
				type: 'select',
				required: spec.required ?? false,
				values: spec.options,
				maxSelect: spec.multiple ? 99 : 1
			};
		case 'file':
			return {
				name: spec.name,
				type: 'file',
				required: spec.required ?? false,
				// v1 no expone un número de tope en CollectionFieldSpec: 99 es un límite
				// generoso por defecto para "multiple"; P6 podrá ajustar con su propio contrato.
				maxSelect: spec.multiple ? 99 : 1,
				maxSize: spec.maxSizeBytes ?? 0,
				mimeTypes: spec.mimeTypes ?? [],
				// `thumbs: []` es inocuo para PB (equivale a omitirlo = sin miniaturas
				// predefinidas); ver landmine C1 en la cabecera de `CollectionFieldSpec`.
				thumbs: spec.thumbs ?? []
			};
		case 'bool':
			return { name: spec.name, type: 'bool', required: spec.required ?? false };
		case 'number':
			// LANDMINE de PocketBase (verificada en producción): un `number` `required` rechaza
			// el valor 0 (PB trata "campo requerido" como "valor distinto del cero-valor", y 0
			// ES el cero-valor de `number`). El puerto no bloquea la combinación —hay rangos
			// legítimos que necesitan 0 como mínimo válido (p.ej. una valoración 0–5)—, pero
			// `SchemaAuthoringPanel.svelte` avisa inline cuando el operador marca `required` en
			// un campo `number` nuevo.
			return { name: spec.name, type: 'number', required: spec.required ?? false };
		case 'date':
			return { name: spec.name, type: 'date', required: spec.required ?? false };
		case 'relation':
			if (!relationCollectionId) {
				throw new Error(
					`No se resolvió el collectionId de la relación "${spec.name}" → "${spec.target}"`
				);
			}
			return {
				name: spec.name,
				type: 'relation',
				required: spec.required ?? false,
				collectionId: relationCollectionId,
				maxSelect: spec.multiple ? 99 : 1,
				cascadeDelete: spec.cascadeDelete
			};
		case 'autodate':
			// Enmienda del contrato P6 (§9): `onCreate: true` siempre (es la semántica que P6
			// necesita, "creado el"); `onUpdate` por defecto `false` — el llamador puede pedir
			// también auto-touch al actualizar (p.ej. "modificado el"), fuera de alcance de P6·6a.
			return {
				name: spec.name,
				type: 'autodate',
				onCreate: true,
				onUpdate: spec.onUpdate ?? false
			};
	}
}
