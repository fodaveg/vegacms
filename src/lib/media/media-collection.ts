/**
 * Esquema canónico de la colección `vega_media` (D-P6.1 opción A, contrato P6 §3/§9): la única
 * especificación que `ensureCollections` puede crear para P6 — L-P6.10 exige que la `spec` que
 * llega al puerto contenga ÚNICAMENTE `'vega_media'` (nunca junto a otras colecciones).
 *
 * `computeMediaCollectionState` reutiliza el cálculo genérico de `$lib/backend/collection-state`
 * (audit H6: NO se clona el gemelo de `/settings`, solo se llama con el nombre de esta colección).
 */

import type { CollectionSpec, EnsureResult } from '$lib/backend/collections';
import { computeCollectionState, type CollectionState } from '$lib/backend/collection-state';
import type { BackendPort } from '$lib/backend/port';
import type { Capabilities, ContentType } from '$lib/backend/types';

/** Tamaño máximo de fichero (D-P6.1): 10 MiB. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Campos de `vega_media` (vocabulario `CollectionFieldSpec`, Anexo A §A.3 + enmienda `autodate`
 * de P6 §9):
 * - `file`: el binario en sí. REQUIRED (D-P6.1 opción A: un registro de media sin fichero no
 *   tiene sentido). Mimes deliberadamente SIN `image/svg+xml` (D-P6.3, cambio del audit): PB
 *   sirve los ficheros subidos desde su propio origen, sin sandboxing — un SVG puede llevar
 *   `<script>` y ejecutar en el contexto de ese origen (XSS almacenado). El resto de tipos
 *   (raster + PDF) no ejecutan script al servirse tal cual.
 * - `alt` / `title`: metadatos de texto libre (accesibilidad y listado).
 * - `tags`: `json` — lista de etiquetas libres; el picker/filtro de 6b/6e la interpreta.
 * - `created`: `autodate` (onCreate, sin onUpdate) — el campo que habilita "ordenar por más
 *   reciente" en la biblioteca (los ids que genera PB no son ordenables por tiempo).
 *
 * `file.thumbs` declara los tres tamaños EXACTOS que Vega solicita en toda la app (landmine C1,
 * shakedown 2026-07-19): sin ellos, PB devuelve el original completo en cada miniatura (200, sin
 * error, sin `<img>` roto — despeñaría el ancho de banda en silencio). `300x300` lo pide el
 * grid propio de `/media` (`MEDIA_GRID_THUMB_SPEC`, `media-thumb.ts`); `120x120`/`28x28` se
 * declaran de forma DEFENSIVA — la UI actual de `/media` solo pide `300x300`, pero los otros dos
 * entrarían en juego si un día un picker/listado renderiza `vega_media` con el widget file
 * (`FileInput.svelte`, 120×120) o en una celda de tabla (`RecordTable.svelte`, 28×28). Los tres
 * son `crop` → `compileThumbSpec` (`adapters/pocketbase/files.ts`) los compila a `WxH` plano.
 */
export const VEGA_MEDIA_COLLECTION: CollectionSpec = {
	name: 'vega_media',
	fields: [
		{
			name: 'file',
			type: 'file',
			required: true,
			multiple: false,
			maxSizeBytes: MAX_FILE_SIZE_BYTES,
			mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'],
			thumbs: ['300x300', '120x120', '28x28']
		},
		{ name: 'alt', type: 'text' },
		{ name: 'title', type: 'text' },
		{ name: 'tags', type: 'json' },
		{ name: 'created', type: 'autodate' }
	]
};

/**
 * `collectionState` de `vega_media` frente al bootstrap (§A.4.6): llamada directa al cálculo
 * genérico con el nombre de ESTA colección — el bootstrap de `/media` (6a) lo usa igual que
 * `/settings` usa el suyo con `VEGA_COLLECTION.name`.
 */
export function computeMediaCollectionState(
	types: readonly ContentType[],
	schemaBootstrap: Capabilities['schemaBootstrap']
): CollectionState {
	return computeCollectionState(types, VEGA_MEDIA_COLLECTION.name, schemaBootstrap);
}

/**
 * Único punto de llamada a `ensureCollections` para P6 (L-P6.10, §A.4.3): la `spec` que llega al
 * puerto contiene SIEMPRE y SOLO `VEGA_MEDIA_COLLECTION`, nunca junto a otras colecciones. `/media`
 * (6a) invoca este wrapper en vez de llamar a `port.ensureCollections` directo, precisamente para
 * que ese invariante quede fijado en un único sitio comprobable por test, no repetido en el
 * `+page.svelte`.
 */
export function ensureMediaCollection(port: BackendPort): Promise<EnsureResult> {
	return port.ensureCollections([VEGA_MEDIA_COLLECTION]);
}

/**
 * Compila un campo de `VEGA_MEDIA_COLLECTION.fields` al payload que espera "Import collections"
 * del Admin de PocketBase. Espejo intencionado de `collectionFieldSpecToPbImportField` (privado,
 * `model/editor/editor-state.ts`, P2 §6.4): esa función no se reutiliza aquí porque vive bajo
 * `model/`, que L1 mantiene sin conocer nada de `media/` (y viceversa) — cada área compila su
 * propio JSON de importación a partir de SU spec canónico, sin depender de la otra. Incluye
 * `autodate` (enmienda P6 §9, ausente en `VEGA_COLLECTION`) y `file.required`.
 */
function collectionFieldSpecToPbImportField(
	spec: (typeof VEGA_MEDIA_COLLECTION)['fields'][number]
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
		case 'bool':
			return { name: spec.name, type: 'bool' };
		case 'number':
			return { name: spec.name, type: 'number' };
		case 'date':
			return { name: spec.name, type: 'date' };
		case 'file':
			return {
				name: spec.name,
				type: 'file',
				required: spec.required ?? false,
				maxSelect: spec.multiple ? 99 : 1,
				maxSize: spec.maxSizeBytes ?? 0,
				mimeTypes: spec.mimeTypes ?? [],
				// `thumbs: []` es inocuo para PB (= sin miniaturas predefinidas); ver
				// landmine C1 en la cabecera de `CollectionFieldSpec` (`backend/collections.ts`).
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
 * JSON de importación de `vega_media` para el Admin de PocketBase (L-P6.5: `collectionState`
 * `'manual'`, sin bootstrap disponible). Determinista a partir de `VEGA_MEDIA_COLLECTION`,
 * pretty-printed para pegar directamente en Collections → Import collections.
 */
export function buildMediaBootstrapImportJson(): string {
	const importPayload = [
		{
			name: VEGA_MEDIA_COLLECTION.name,
			type: 'base',
			fields: VEGA_MEDIA_COLLECTION.fields.map(collectionFieldSpecToPbImportField)
		}
	];

	return JSON.stringify(importPayload, null, 2);
}
