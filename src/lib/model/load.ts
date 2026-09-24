/**
 * Residencia y ciclo de vida del manifiesto (§6 del contrato P2): lectura vía `loadContentModel`
 * y escritura vía `saveManifest`, ambas contra el `BackendPort`. También el del snapshot de
 * esquema que viaja en el mismo registro `vega` (`syncSchemaSnapshot`, `withSchemaSnapshotSync`).
 * Único módulo bajo `src/lib/model/` (junto a `editor/`, Fase 3) que puede importar el puerto —
 * el resto sigue puro (guardarraíl del contrato, §1); `pocketbase` sigue sin poder importarse aquí
 * tampoco: `schema-snapshot.ts`, la comparación, es puro por eso.
 */

import type { BackendPort } from '$lib/backend/port';
import type {
	ContentType,
	JsonValue,
	RecordInput,
	ScheduledPublishingState,
	VegaRecord
} from '$lib/backend/types';
import { withServerFeatures } from '$lib/backend/scheduled-publishing';
import type { Query } from '$lib/backend/query';
import {
	VEGA_COLLECTION,
	VEGA_MANIFEST_VERSION_FIELD,
	VEGA_PROJECT_KEY,
	VEGA_PROJECT_KEY_FIELD,
	type AddFieldsResult,
	type CollectionFieldSpec,
	type CollectionSpec,
	type EnsureResult
} from '$lib/backend/collections';
import { schemaSnapshotMatches } from './schema-snapshot';
import type { ContentModel } from './types';
import { resolveContentModel } from './resolve';
import { validateManifestStrict, type ManifestValidationErrorEntry } from './validate';
import { blockTypesUnrendered, multipleVegaRecords } from './warnings';

/** Nombre del campo `json` del registro `vega` (§6.1). */
const MANIFEST_FIELD = 'manifest';

/** Nombre del campo `json` de snapshot de esquema del registro `vega` (L6b): ver cabecera de
 *  `saveManifest` para cuándo se escribe. */
const SCHEMA_SNAPSHOT_FIELD = 'schemaSnapshot';

async function unsupportedBlockTypeWarnings(
	port: BackendPort,
	model: ContentModel
): Promise<ContentModel['warnings']> {
	if (port.renderedBlockTypes === null || port.renderedBlockTypes === undefined) return [];

	const rendered = new Set(port.renderedBlockTypes);
	const unsupported = model.blockTypes.filter((blockType) => !rendered.has(blockType.name));
	if (unsupported.length === 0) return [];

	const sources = new Map<string, string>();
	for (const type of model.types) {
		const blocks = type.blocks;
		if (!blocks?.typeField) continue;
		sources.set(blocks.collection, blocks.typeField);
	}

	const unsupportedNames = unsupported.map((blockType) => blockType.name);
	try {
		// Una consulta de COUNT filtrada por colección, no una lectura por tipo ni un recorrido de
		// `data`: `totalItems` lo calcula PocketBase sobre la columna real `typeField`, y `in`
		// agrupa todos los tipos que el sitio no sabe pintar en la misma consulta.
		const counts = await Promise.all(
			Array.from(sources, ([collection, typeField]) =>
				port.list(collection, {
					perPage: 1,
					filter: {
						kind: 'cond',
						field: typeField,
						op: 'in',
						value: unsupportedNames
					}
				})
			)
		);
		const affected = counts.reduce((sum, page) => sum + page.totalItems, 0);
		return [blockTypesUnrendered(unsupportedNames, affected)];
	} catch {
		return [blockTypesUnrendered(unsupportedNames, null)];
	}
}

/** Query exacta del registro canónico. Servidores anteriores a este contrato no
 * tienen `key`; para ellos conserva temporalmente la lectura del primer registro. */
export function manifestRecordQuery(
	vegaType: ContentType,
	perPage: number,
	manifestKey = VEGA_PROJECT_KEY
): Query {
	if (!vegaType.fields.some((field) => field.name === VEGA_PROJECT_KEY_FIELD)) return { perPage };
	return {
		perPage,
		filter: {
			kind: 'cond',
			field: VEGA_PROJECT_KEY_FIELD,
			op: 'eq',
			value: manifestKey
		}
	};
}

/** Lee primero el registro estable y, si la coleccion ya tiene `key` pero sus
 * registros son anteriores al contrato, recupera el primer registro legacy. */
export async function listManifestRecords(
	port: BackendPort,
	vegaType: ContentType,
	perPage: number
) {
	const canonical = await port.list(
		VEGA_COLLECTION.name,
		manifestRecordQuery(vegaType, perPage, port.manifestKey?.trim() || VEGA_PROJECT_KEY)
	);
	if (
		canonical.items.length > 0 ||
		!vegaType.fields.some((field) => field.name === VEGA_PROJECT_KEY_FIELD)
	) {
		return canonical;
	}
	return port.list(VEGA_COLLECTION.name, { perPage });
}

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

	const vegaType = types.find((t) => t.name === VEGA_COLLECTION.name);
	if (!vegaType) {
		return resolveContentModel({
			types,
			manifestRaw: null,
			knownIcons: opts?.knownIcons,
			accessBypass: port.capabilities.accessBypass
		});
	}

	const page = await listManifestRecords(port, vegaType, 2);

	let manifestRaw: JsonValue | null = null;
	if (page.items.length > 0) {
		manifestRaw = page.items[0].values[MANIFEST_FIELD] ?? null;
	}

	const model = resolveContentModel({
		types,
		manifestRaw,
		knownIcons: opts?.knownIcons,
		accessBypass: port.capabilities.accessBypass
	});
	// Superuser entrando (o `reloadModel()`): si el snapshot de los editores ya no describe el
	// esquema vivo (cambio hecho en el Admin de PocketBase, por ejemplo), se reescribe aquí mismo
	// con lo que esta carga YA leyó — sin lecturas extra, y en paralelo con los recuentos de
	// abajo. Nunca rompe la carga del modelo.
	const [discoveryWarnings, scheduledPublishing] = await Promise.all([
		unsupportedBlockTypeWarnings(port, model),
		scheduledPublishingFor(port, model),
		syncSchemaSnapshotSafely(port, { types, vegaType, record: page.items[0] ?? null })
	]);
	const cardinalityWarnings = page.totalItems <= 1 ? [] : [multipleVegaRecords(page.totalItems)];
	const withScheduling: ContentModel =
		scheduledPublishing === null ? model : { ...model, scheduledPublishing };
	if (discoveryWarnings.length === 0 && cardinalityWarnings.length === 0) return withScheduling;

	return {
		...withScheduling,
		warnings: [...model.warnings, ...discoveryWarnings, ...cardinalityWarnings]
	};
}

/**
 * `ContentModel.scheduledPublishing`: solo se pregunta al puerto si algún tipo declara
 * `publishAtField` — sin fecha programable el dato no se pinta en ningún sitio, y devolver `null`
 * deja el modelo con la misma forma de siempre. Un puerto sin el método equivale a `'unknown'`.
 */
async function scheduledPublishingFor(
	port: BackendPort,
	model: ContentModel
): Promise<ScheduledPublishingState | null> {
	if (!model.types.some((type) => type.publishAtField)) return null;
	return port.scheduledPublishing ? port.scheduledPublishing() : 'unknown';
}

/**
 * Lo que se guarda en `vega.schemaSnapshot`: el esquema más lo que un editor no puede comprobar
 * por sí mismo del servidor (`ContentType.serverFeatures` en la entrada `vega`, ver
 * `backend/scheduled-publishing.ts`). Solo lo llama quien escribe el snapshot, que es siempre una
 * sesión con introspección real (superusuario).
 */
async function snapshotPayload(port: BackendPort, types: ContentType[]): Promise<ContentType[]> {
	const state = port.scheduledPublishing ? await port.scheduledPublishing() : 'unknown';
	return withServerFeatures(types, state);
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
 *
 * L6b (rol editor): además del manifiesto, persiste el `ContentType[]` recién descubierto en
 * `schemaSnapshot` del MISMO registro — una sola escritura, sin duplicar la llamada de red. Es
 * el snapshot que el adaptador `pocketbase` sirve en modo editor (`schemaDiscovery: false`,
 * `GET /api/collections` vedado a no-superusers). Solo se escribe si `capabilities.schemaDiscovery`
 * es `true` (introspección REAL, no ya-servida-desde-snapshot): en modo editor `types` vendría
 * del propio snapshot (circular), así que reescribirlo sería, en el mejor caso, un no-op y, en
 * el peor, congelar un esquema potencialmente obsoleto bajo apariencia de estar actualizándose.
 *
 * Devuelve el `manifest` YA versionado (`schemaVersion: 1` forzado) tal cual quedó escrito en el
 * campo `manifest` del registro — fix de code-review (`/settings` tiene DOS escritores del
 * manifiesto, `ManifestEditor` y `RevisionsSettings`; sin este valor de vuelta, el llamador solo
 * podía refrescar su copia local releyendo la red o confiando en el objeto que le pasó a esta
 * misma función, ambos caminos con su propio riesgo de arrastrar una copia obsoleta).
 */
export async function saveManifest(port: BackendPort, manifest: JsonValue): Promise<JsonValue> {
	const validation = validateManifestStrict(manifest);
	if (!validation.ok) throw new ManifestValidationError(validation.errors);

	// Seguro tras `validation.ok`: el schema exige `type: "object"` en la raíz.
	const versioned: JsonValue = { ...(manifest as Record<string, JsonValue>), schemaVersion: 1 };

	let types = await port.listContentTypes();
	if (!types.some((t) => t.name === VEGA_COLLECTION.name)) {
		await port.ensureCollections([VEGA_COLLECTION]);
		// Fix de code-review (L6b, bug BLOQUEANTE): RE-lee `types` tras crear `vega` — el
		// snapshot que se persiste abajo DEBE incluir la propia colección `vega` (así lo vería
		// una introspección real en vivo, §4.2). Sin este refresco, el primer guardado desde
		// `/settings` (bootstrap) dejaba un `schemaSnapshot` SIN `vega`; un editor (modo
		// snapshot, `schemaDiscovery: false`) leería ESE snapshot vía `fetchContentTypesFromSnapshot` y
		// `loadContentModel` (arriba, §6.2) decidiría "manifiesto ausente" pese a que el
		// manifiesto SÍ existe — rompía el caso central de L6b.
		types = await port.listContentTypes();
	}

	const vegaType = types.find((type) => type.name === VEGA_COLLECTION.name)!;
	const body: RecordInput = { [MANIFEST_FIELD]: versioned };
	if (vegaType.fields.some((field) => field.name === VEGA_PROJECT_KEY_FIELD)) {
		body[VEGA_PROJECT_KEY_FIELD] = port.manifestKey?.trim() || VEGA_PROJECT_KEY;
	}
	if (vegaType.fields.some((field) => field.name === VEGA_MANIFEST_VERSION_FIELD)) {
		body[VEGA_MANIFEST_VERSION_FIELD] = 1;
	}
	if (port.capabilities.schemaDiscovery) {
		body[SCHEMA_SNAPSHOT_FIELD] = (await snapshotPayload(port, types)) as unknown as JsonValue;
	}

	const page = await listManifestRecords(port, vegaType, 1);
	if (page.items.length > 0) {
		await port.update(VEGA_COLLECTION.name, page.items[0].id, body);
	} else {
		await port.create(VEGA_COLLECTION.name, body);
	}

	return versioned;
}

/** Qué hizo `syncSchemaSnapshot`: `skipped` = no aplica (ver sus condiciones). */
export type SchemaSnapshotSyncResult = 'written' | 'unchanged' | 'skipped';

/**
 * Reescribe `vega.schemaSnapshot` si ya no describe el esquema vivo (audit de rendimiento del
 * 23 sep 2026, p2). Antes solo se regeneraba al guardar el manifiesto desde `/settings`, así que un
 * cambio de esquema dejaba a los editores con un esquema viejo hasta que alguien se acordara de
 * guardar. Ahora se llama desde dos sitios:
 *
 * - `loadContentModel`, al entrar un superuser (y en cada `reloadModel()`), con `known` = lo que
 *   esa carga ya leyó, para no pagar ninguna lectura más.
 * - `withSchemaSnapshotSync`, tras cada escritura de esquema hecha desde Vega.
 *
 * Solo ESCRIBE si hay diferencia (`schemaSnapshotMatches`, comparación por contenido que no
 * depende del orden de claves) y solo el campo `schemaSnapshot` del registro existente — el
 * manifiesto no se toca. No aplica (`skipped`) sin introspección real
 * (`capabilities.schemaDiscovery`: en modo editor el esquema SALE del snapshot, mismo motivo que
 * en `saveManifest`), sin colección `vega`, con una `vega` anterior a L6b sin el campo, o sin
 * registro: el snapshot vive junto al manifiesto y crear un registro solo para él cambiaría lo que
 * `loadContentModel` entiende por "manifiesto ausente". Los fallos se propagan; quien no deba
 * romperse por esto usa `syncSchemaSnapshotSafely`.
 */
export async function syncSchemaSnapshot(
	port: BackendPort,
	known?: { types: ContentType[]; vegaType: ContentType; record: VegaRecord | null }
): Promise<SchemaSnapshotSyncResult> {
	if (!port.capabilities.schemaDiscovery) return 'skipped';

	let types: ContentType[];
	let vegaType: ContentType | undefined;
	let record: VegaRecord | null;
	if (known) {
		({ types, vegaType, record } = known);
	} else {
		types = await port.listContentTypes();
		vegaType = types.find((type) => type.name === VEGA_COLLECTION.name);
		if (!vegaType) return 'skipped';
		record = (await listManifestRecords(port, vegaType, 1)).items[0] ?? null;
	}
	if (!vegaType.fields.some((field) => field.name === SCHEMA_SNAPSHOT_FIELD)) return 'skipped';
	if (!record) return 'skipped';

	const payload = await snapshotPayload(port, types);
	if (schemaSnapshotMatches(payload, record.values[SCHEMA_SNAPSHOT_FIELD])) return 'unchanged';
	await port.update(VEGA_COLLECTION.name, record.id, {
		[SCHEMA_SNAPSHOT_FIELD]: payload as unknown as JsonValue
	});
	return 'written';
}

/**
 * `syncSchemaSnapshot` para los caminos que NO deben fallar por él (cargar el modelo, una
 * escritura de esquema que ya se hizo): el fallo no se propaga, pero tampoco se pierde — queda en
 * consola, y la próxima entrada de un superuser lo vuelve a intentar.
 */
async function syncSchemaSnapshotSafely(
	port: BackendPort,
	known?: Parameters<typeof syncSchemaSnapshot>[1]
): Promise<void> {
	try {
		await syncSchemaSnapshot(port, known);
	} catch (err) {
		console.warn(
			'[vega:schemaSnapshot] No se pudo actualizar el esquema que ven los editores; se ' +
				'reintentará en la próxima carga del modelo con superusuario.',
			err
		);
	}
}

/**
 * Decorador de `BackendPort` (se aplica en `session/backend.ts#createInstance`, en las dos ramas,
 * por DEBAJO de `withRevisions`, cuya `resetRevisionsLatch` va por identidad del puerto más
 * externo): tras `ensureCollections`/`addCollectionFields`, regenera el snapshot de los editores.
 * Un decorador y no una llamada en cada pantalla porque esos cambios salen de al menos cinco
 * sitios (autoría de esquema en `/settings`, sembrado de sitio y los bootstraps de `vega`,
 * `vega_media` y `vega_revisions`), y `/media` ni siquiera recarga el modelo después.
 *
 * Con éxito sin cambios (todo `skipped`) no hay nada que sincronizar. Con fallo se sincroniza
 * igual: el lote no hace rollback y puede haber creado algo antes de fallar. El resultado o el
 * error originales llegan intactos al llamador.
 */
export function withSchemaSnapshotSync(port: BackendPort): BackendPort {
	async function afterSchemaWrite<T>(
		write: () => Promise<T>,
		changed: (result: T) => boolean
	): Promise<T> {
		let result: T;
		try {
			result = await write();
		} catch (err) {
			await syncSchemaSnapshotSafely(port);
			throw err;
		}
		if (changed(result)) await syncSchemaSnapshotSafely(port);
		return result;
	}

	return {
		...port,
		ensureCollections(specs: CollectionSpec[]): Promise<EnsureResult> {
			return afterSchemaWrite(
				() => port.ensureCollections(specs),
				(result) => result.created.length > 0
			);
		},
		addCollectionFields(
			collectionName: string,
			fields: CollectionFieldSpec[]
		): Promise<AddFieldsResult> {
			return afterSchemaWrite(
				() => port.addCollectionFields(collectionName, fields),
				(result) => result.added.length > 0
			);
		}
	};
}
