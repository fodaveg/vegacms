/**
 * Residencia y ciclo de vida del manifiesto (§6 del contrato P2): lectura vía `loadContentModel`
 * y escritura vía `saveManifest`, ambas contra el `BackendPort`. Único módulo bajo
 * `src/lib/model/` (junto a `editor/`, Fase 3) que puede importar el puerto — el resto sigue
 * puro (guardarraíl del contrato, §1); `pocketbase` sigue sin poder importarse aquí tampoco.
 */

import type { BackendPort } from '$lib/backend/port';
import type { JsonValue } from '$lib/backend/types';
import { VEGA_COLLECTION } from '$lib/backend/collections';
import type { ContentModel } from './types';
import { resolveContentModel } from './resolve';
import { validateManifestStrict, type ManifestValidationErrorEntry } from './validate';
import { multipleVegaRecords } from './warnings';

/** Nombre del campo `json` del registro `vega` (§6.1). */
const MANIFEST_FIELD = 'manifest';

/**
 * Rechazo de `saveManifest` cuando el manifiesto no pasa `validateManifestStrict` (§6.3.1): la
 * red NUNCA se toca en este caso. `errors` son los mismos `{ path, message }` del validador.
 */
export class ManifestValidationError extends Error {
	readonly errors: ManifestValidationErrorEntry[];

	constructor(errors: ManifestValidationErrorEntry[]) {
		super('El manifiesto no es válido contra el schema v1 de Vega.');
		this.name = 'ManifestValidationError';
		this.errors = errors;
	}
}

/**
 * API pública de P2 (§2, §6.2): conveniencia `listContentTypes` + lectura del registro único de
 * `vega` + `resolveContentModel`.
 *
 * - Si `vega` no está entre los tipos descubiertos ⇒ manifiesto ausente (modo sin manifiesto).
 * - `list('vega', { perPage: 2 })`: 0 registros ⇒ ausente; 1 ⇒ su campo `manifest` es el
 *   `manifestRaw`; >1 ⇒ se usa el PRIMERO (orden por defecto del puerto, determinista) + warning
 *   `multiple-vega-records` con el recuento real (`page.totalItems`, no limitado por `perPage`).
 * - Los `VegaError` de transporte del puerto (red/auth/backend) en `listContentTypes`/`list` se
 *   PROPAGAN tal cual: son fallos de transporte, no de contenido (§2 del contrato).
 */
export async function loadContentModel(
	port: BackendPort,
	opts?: { knownIcons?: readonly string[] }
): Promise<ContentModel> {
	const types = await port.listContentTypes();

	if (!types.some((t) => t.name === VEGA_COLLECTION.name)) {
		return resolveContentModel({ types, manifestRaw: null, knownIcons: opts?.knownIcons });
	}

	const page = await port.list(VEGA_COLLECTION.name, { perPage: 2 });

	let manifestRaw: JsonValue | null = null;
	if (page.items.length > 0) {
		manifestRaw = page.items[0].values[MANIFEST_FIELD] ?? null;
	}

	const model = resolveContentModel({ types, manifestRaw, knownIcons: opts?.knownIcons });
	if (page.totalItems <= 1) return model;

	return { ...model, warnings: [...model.warnings, multipleVegaRecords(page.totalItems)] };
}

/**
 * API pública de P2 (§2, §6.3): escritor ESTRICTO (L4).
 *
 * 1. `validateManifestStrict` primero: inválido ⇒ lanza `ManifestValidationError` SIN tocar red.
 * 2. Fuerza `schemaVersion: 1` (guardar = migrar a la versión que este código escribe).
 * 3. `update` del registro único de `vega`, o `create` si aún no hay ninguno. Si la colección
 *    `vega` todavía no existe (bootstrap de primera vez, §6.6), la crea antes vía
 *    `ensureCollections` (Anexo A de P1, D-P2.2 firmada) — nunca la modifica si ya existe.
 *
 * No re-resuelve el modelo: el llamador (el editor, Fase 3) vuelve a llamar a
 * `loadContentModel` tras guardar para ver los warnings resultantes (§6.3.4).
 */
export async function saveManifest(port: BackendPort, manifest: JsonValue): Promise<void> {
	const validation = validateManifestStrict(manifest);
	if (!validation.ok) throw new ManifestValidationError(validation.errors);

	// Seguro tras `validation.ok`: el schema exige `type: "object"` en la raíz.
	const versioned: JsonValue = { ...(manifest as Record<string, JsonValue>), schemaVersion: 1 };

	const types = await port.listContentTypes();
	if (!types.some((t) => t.name === VEGA_COLLECTION.name)) {
		await port.ensureCollections([VEGA_COLLECTION]);
	}

	const page = await port.list(VEGA_COLLECTION.name, { perPage: 1 });
	if (page.items.length > 0) {
		await port.update(VEGA_COLLECTION.name, page.items[0].id, { [MANIFEST_FIELD]: versioned });
	} else {
		await port.create(VEGA_COLLECTION.name, { [MANIFEST_FIELD]: versioned });
	}
}
