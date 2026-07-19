/**
 * Lógica PURA del editor mínimo del manifiesto (§6.4 del contrato P2). Sin Svelte, sin puerto,
 * sin red: dado el texto crudo del `<textarea>` y los `ContentType[]` descubiertos, produce un
 * `EditorState` completo — parseo, validación ESTRICTA (`validateManifestStrict`) y el dry-run
 * de `resolveContentModel` contra el esquema real, que es la "killer feature" del editor (§6.4:
 * "muestra los errores estrictos Y los warnings que ese manifiesto produciría... ANTES de
 * guardar"). `ManifestEditor.svelte` (componente fino) SOLO cablea UI ↔ este módulo.
 *
 * Import estricto: nada de `$lib/backend/port` ni `pocketbase` — reutiliza únicamente las
 * funciones puras que ya existen en `src/lib/model/` (Fases 1-2).
 */

import type { ContentType, JsonValue } from '$lib/backend/types';
import { isReservedCollectionName, VEGA_COLLECTION } from '$lib/backend/collections';
import type { ModelWarning } from '../types';
import { resolveContentModel } from '../resolve';
import { validateManifestStrict, type ManifestValidationErrorEntry } from '../validate';
import { humanizeLabel } from '../conventions';

/** Estado completo del editor para un texto de borrador dado (§6.4). */
export interface EditorState {
	/** `JSON.parse(rawText)` falló: el texto ni siquiera es JSON. `null` si parseó. */
	parseError: { message: string } | null;
	/** Errores de `validateManifestStrict` sobre el JSON parseado; `[]` si `parseError` o si es válido. */
	strictErrors: ManifestValidationErrorEntry[];
	/** Warnings que produciría `resolveContentModel` con este borrador contra el esquema real
	 *  (§4/§5 del contrato): el dry-run. Se calcula siempre que el texto parsea, aunque el
	 *  borrador sea estrictamente inválido — es la vista previa de "qué pasaría si guardaras". */
	dryRunWarnings: ModelWarning[];
	/** `true` SOLO si el texto parsea Y `strictErrors` está vacío (§6.4: "Guardar" solo con
	 *  validación estricta en verde). */
	canSave: boolean;
}

/**
 * Calcula el `EditorState` para el texto crudo del `<textarea>` (§6.4). Nunca lanza: un texto
 * no-JSON produce `parseError`, no una excepción.
 *
 * `knownIcons` es opcional (§4.8, paridad con runtime): si se pasa, el dry-run valida los
 * `icon` declarados contra ese set igual que `resolveContentModel` en producción, y un icono
 * fuera del set produce el warning `icon-unknown`. Sin `knownIcons` (comportamiento por
 * defecto) el dry-run no valida iconos, como antes.
 */
export function computeEditorState(
	rawText: string,
	types: ContentType[],
	knownIcons?: readonly string[]
): EditorState {
	let parsed: JsonValue;
	try {
		parsed = JSON.parse(rawText) as JsonValue;
	} catch (err) {
		return {
			parseError: { message: err instanceof Error ? err.message : 'El texto no es JSON válido.' },
			strictErrors: [],
			dryRunWarnings: [],
			canSave: false
		};
	}

	const validation = validateManifestStrict(parsed);
	const strictErrors = validation.ok ? [] : validation.errors;

	// Dry-run: `resolveContentModel` es tolerante y nunca lanza (L3), así que se puede calcular
	// incluso sobre un borrador que aún no pasa el escritor estricto — el editor enseña de una
	// vez lo que rechazaría `saveManifest` (schema) Y lo que degradaría en runtime (esquema real).
	const dryRunWarnings = resolveContentModel({ types, manifestRaw: parsed, knownIcons }).warnings;

	return {
		parseError: null,
		strictErrors,
		dryRunWarnings,
		canSave: validation.ok
	};
}

/**
 * Formatea un texto JSON con indentación de 2 espacios (`JSON.stringify(…, null, 2)`), para
 * poblar el `<textarea>` al cargar el editor (§6.4). Si `raw` no parsea, lo devuelve TAL CUAL
 * (nunca lanza; deja que `computeEditorState` reporte el `parseError` sobre el texto real que
 * ve el usuario, en vez de perder o mutar contenido no válido).
 */
export function prettyPrint(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw) as JsonValue, null, 2);
	} catch {
		return raw;
	}
}

/**
 * Compila un `CollectionFieldSpec` de `VEGA_COLLECTION` al payload de campo que espera
 * `POST /api/collections` de PocketBase (y, por tanto, el "Import collections" del Admin, que
 * acepta el mismo formato). Es un DUPLICADO deliberadamente pequeño de
 * `collectionFieldSpecToPbField` (`backend/adapters/pocketbase/schema.ts`): ese vive en el
 * adaptador y este módulo no puede importarlo sin romper el guardarraíl "sin puerto, sin
 * pocketbase" (§6.4). Solo cubre los tipos que `VEGA_COLLECTION` usa hoy (`json`); si el spec
 * canónico crece, este switch crece con él.
 */
function collectionFieldSpecToPbImportField(
	spec: (typeof VEGA_COLLECTION)['fields'][number]
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
				maxSelect: spec.multiple ? 99 : 1,
				maxSize: spec.maxSizeBytes ?? 0,
				mimeTypes: spec.mimeTypes ?? [],
				// `VEGA_COLLECTION` no tiene campo file hoy, pero mantiene el switch coherente
				// con el vocabulario COMPLETO de `CollectionFieldSpec` (thumbs, landmine C1).
				thumbs: spec.thumbs ?? []
			};
		case 'autodate':
			// `VEGA_COLLECTION` no usa `autodate` hoy, pero el switch debe seguir siendo
			// exhaustivo contra el vocabulario COMPLETO de `CollectionFieldSpec` (enmienda P6 §9).
			return {
				name: spec.name,
				type: 'autodate',
				onCreate: true,
				onUpdate: spec.onUpdate ?? false
			};
	}
}

/**
 * Genera el JSON de importación de colecciones para el Admin de PocketBase (Collections →
 * Import collections), a partir del spec canónico `VEGA_COLLECTION` (§A.5 del Anexo A del
 * contrato P1). Es la única fuente de verdad para este JSON: antes lo pasaba P3 como prop de
 * texto libre, ahora lo calcula el editor de forma DETERMINISTA y siempre coherente con
 * `VEGA_COLLECTION`. Pretty-printed, para pegar directamente en el Admin.
 */
export function buildBootstrapImportJson(): string {
	const importPayload = [
		{
			name: VEGA_COLLECTION.name,
			type: 'base',
			fields: VEGA_COLLECTION.fields.map(collectionFieldSpecToPbImportField)
		}
	];

	return JSON.stringify(importPayload, null, 2);
}

/**
 * Genera el esqueleto de "Insertar plantilla" (§6.4): el ejemplo §3 adaptado, con los NOMBRES
 * REALES de las colecciones descubiertas. Cada colección visible-decorable recibe una entrada
 * mínima (`label` humanizado); las colecciones reservadas `vega`/`vega_*` se omiten (L7: su
 * visibilidad no es anulable por manifiesto, decorarlas en la plantilla no tendría efecto y
 * solo añadiría ruido). Pretty-printed y SIEMPRE estrictamente válido contra
 * `validateManifestStrict` (verificado en tests): es una plantilla, no debe fallar el dry-run.
 */
export function buildTemplate(types: ContentType[]): string {
	const collections: Record<string, JsonValue> = {};
	for (const type of types) {
		if (isReservedCollectionName(type.name)) continue;
		collections[type.name] = { label: humanizeLabel(type.name) };
	}

	const manifest: JsonValue = {
		schemaVersion: 1,
		site: { name: 'Vega' },
		collections
	};

	return JSON.stringify(manifest, null, 2);
}
