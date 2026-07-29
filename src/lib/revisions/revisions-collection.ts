/**
 * Esquema canónico de la colección `vega_revisions` (`#lote-integridad`, Fase B §1): almacena la
 * PRE-IMAGEN de cada escritura interceptada por el decorador `withRevisions` (`with-revisions.ts`)
 * — calcado del patrón de `media/media-collection.ts` (bootstrap perezoso + JSON de importación
 * determinista), incluida su reutilización de `computeCollectionState` genérico (`backend/
 * collection-state.ts`, audit H6 de P6: NO se clona el cálculo de `/settings`/`/media`).
 *
 * Namespace INTERNO de Vega (`vega_*`): `isReservedCollectionName` (`backend/collections.ts`) ya
 * la cubre sin tocar nada, así que nunca aparece en el sidebar ni en `model/resolve.ts` — Fase B
 * §1 es explícita en que no hace falta ningún caso especial para ocultarla.
 *
 * Campos (§1 del contrato de Fase B):
 * - `collection`/`recordId`: identidad del registro de origen. El id NO va dentro de `values`
 *   (`VegaRecord.values` no lo incluye, §2 de `backend/types.ts`) — va aparte, como estos dos
 *   campos propios.
 * - `kind`: `'update'` | `'delete'`, TEXTO PLANO. Ojo, la razón CAMBIÓ: `CollectionFieldSpec` ya
 *   soporta `select` desde el lote del sembrado (29 jul 2026), así que esto no es una limitación
 *   sino una elección — `kind` es un valor interno de Vega, no un vocabulario que el operador edite,
 *   y encerrarlo en un `select` obligaría a migrar el esquema cada vez que se añada un tipo de
 *   revisión. Lo que no cambia es la consecuencia: como `kind` es texto plano, PB no valida su
 *   vocabulario, así que un valor fuera de ese conjunto cerrado se trata como dato hostil en
 *   cualquier lectura (`parseRevisionRecord` en
 *   `revision.ts`), nunca se confía en que PB lo valide por nosotros. Fase B1 solo escribe
 *   `'update'` — el gancho de `'delete'` queda preparado en `with-revisions.ts` pero sin usar.
 * - `values`: la PRE-IMAGEN completa (`VegaRecord.values` tal cual, antes de la escritura) —
 *   INVARIANTE 1 del lote (§2 del contrato de Fase B), el corazón de todo el diseño.
 * - `label`: etiqueta legible del registro EN ESE MOMENTO, para pintar el historial/la papelera
 *   sin resolver nada contra el esquema vivo (heurístico en `record-label.ts`).
 * - `author`: email de quien escribió, cadena vacía si no hay sesión (no debería pasar en la
 *   práctica, pero el puerto nunca exige que `currentSession()` no sea `null`).
 * - `created`: `autodate` (`onCreate: true, onUpdate: false`) — el ÚNICO orden temporal fiable:
 *   los ids que genera PB no son ordenables por tiempo (misma razón documentada en
 *   `VEGA_MEDIA_COLLECTION`).
 */

import type { CollectionFieldSpec, CollectionSpec, EnsureResult } from '$lib/backend/collections';
import { computeCollectionState, type CollectionState } from '$lib/backend/collection-state';
import type { BackendPort } from '$lib/backend/port';
import type { Capabilities, ContentType } from '$lib/backend/types';

export const VEGA_REVISIONS_COLLECTION: CollectionSpec = {
	name: 'vega_revisions',
	fields: [
		{ name: 'collection', type: 'text', required: true },
		{ name: 'recordId', type: 'text', required: true },
		{ name: 'kind', type: 'text', required: true },
		{ name: 'values', type: 'json' },
		{ name: 'label', type: 'text' },
		{ name: 'author', type: 'text' },
		{ name: 'created', type: 'autodate' }
	]
};

/**
 * `collectionState` de `vega_revisions` frente al bootstrap: llamada directa al cálculo genérico
 * con el nombre de ESTA colección — mismo patrón que `computeMediaCollectionState`.
 */
export function computeRevisionsCollectionState(
	types: readonly ContentType[],
	schemaBootstrap: Capabilities['schemaBootstrap']
): CollectionState {
	return computeCollectionState(types, VEGA_REVISIONS_COLLECTION.name, schemaBootstrap);
}

/**
 * Único punto de llamada a `ensureCollections` para `vega_revisions` (mismo invariante que
 * `ensureMediaCollection`): la `spec` que llega al puerto contiene SIEMPRE y SOLO
 * `VEGA_REVISIONS_COLLECTION`, nunca junto a otras colecciones.
 */
export function ensureRevisionsCollection(port: BackendPort): Promise<EnsureResult> {
	return port.ensureCollections([VEGA_REVISIONS_COLLECTION]);
}

/**
 * Compila un campo de `VEGA_REVISIONS_COLLECTION.fields` al payload que espera "Import
 * collections" del Admin de PocketBase. Espejo intencionado de `collectionFieldSpecToPbImportField`
 * (privado en `media/media-collection.ts`, y a su vez espejo del de `model/editor/editor-state.ts`)
 * — cada área compila su propio JSON de importación a partir de SU spec canónico, sin depender de
 * las otras (mismo razonamiento documentado en `media-collection.ts`). Exhaustivo sobre TODO el
 * vocabulario de `CollectionFieldSpec`, aunque esta colección solo use
 * `text`/`json`/`autodate`; para `relation` falla alto porque un JSON de importación necesitaría
 * resolver un `collectionId` real y esta spec canónica nunca declara ese tipo.
 */
function collectionFieldSpecToPbImportField(spec: CollectionFieldSpec): Record<string, unknown> {
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
		case 'bool':
			return { name: spec.name, type: 'bool', required: spec.required ?? false };
		case 'number':
			return { name: spec.name, type: 'number', required: spec.required ?? false };
		case 'date':
			return { name: spec.name, type: 'date', required: spec.required ?? false };
		case 'relation':
			throw new Error(
				'VEGA_REVISIONS_COLLECTION no puede serializar relation sin resolver su collectionId'
			);
		case 'file':
			return {
				name: spec.name,
				type: 'file',
				required: spec.required ?? false,
				maxSelect: spec.multiple ? 99 : 1,
				maxSize: spec.maxSizeBytes ?? 0,
				mimeTypes: spec.mimeTypes ?? [],
				thumbs: spec.thumbs ?? []
			};
		case 'autodate':
			return {
				name: spec.name,
				type: 'autodate',
				onCreate: true,
				onUpdate: spec.onUpdate ?? false
			};
	}
}

/**
 * JSON de importación de `vega_revisions` para el Admin de PocketBase (`collectionState`
 * `'manual'`, sin bootstrap disponible). Determinista a partir de `VEGA_REVISIONS_COLLECTION`,
 * pretty-printed para pegar directamente en Collections → Import collections.
 */
export function buildRevisionsBootstrapImportJson(): string {
	const importPayload = [
		{
			name: VEGA_REVISIONS_COLLECTION.name,
			type: 'base',
			fields: VEGA_REVISIONS_COLLECTION.fields.map(collectionFieldSpecToPbImportField)
		}
	];

	return JSON.stringify(importPayload, null, 2);
}
