/**
 * Orquesta la Fase 2 (importar, §4.2/§4.3/§4.4 del contrato de `#lote-esquema`, ver la cabecera de
 * `export-collection.ts` para el contrato completo): resuelve contra el puerto lo que
 * `import-preview.ts` necesita para clasificar (§4.2: existencia por lotes, relaciones colgantes,
 * ficheros `required` traíbles) y luego escribe (§4.3/§4.4). Simétrico a `export-collection.ts` en
 * el reparto: este módulo toca red, `import-preview.ts`/`import-format.ts`/
 * `record-deserializer.ts` son puros.
 *
 * `ImportDialog.svelte` llama primero a `buildImportPreview` (nada se escribe todavía) y, tras la
 * confirmación del usuario, a `runImport` con el MISMO `ImportPreview` — las dos funciones
 * comparten un `fetchFile` cacheado por URL (`createCachingFileFetcher`) para que un campo `file`
 * `required` ya comprobado en la vista previa NO se vuelva a traer de origen al escribir.
 */

import type { BackendPort } from '$lib/backend/port';
import type { Field, RecordId } from '$lib/backend/types';
import { MAX_PER_PAGE } from '$lib/backend/query';
import type { ResolvedContentType } from '$lib/model/types';
import type { ResolvedImportCollection } from './import-format';
import {
	isTransferFileValue,
	type TransferFileValue,
	type TransferRecord
} from './record-serializer';
import { deserializeRecord } from './record-deserializer';
import { fetchTransferFile } from './import-media';
import {
	classifyCollectionImport,
	isNonEmpty,
	partitionByOutgoingRelations,
	type ImportEntry
} from './import-preview';

/** Subconjunto del puerto que esta Fase necesita — mismo criterio `Pick` que `export-collection.ts`
 *  para que los tests fabriquen un doble mínimo sin construir ningún adaptador real. */
export type ImportPort = Pick<BackendPort, 'list' | 'create' | 'update'>;

export type FetchTransferFileFn = (file: TransferFileValue) => Promise<File | null>;

/** Envuelve `fetchFile` (por defecto `fetchTransferFile`, red real) con una caché por `url`: el
 *  mismo fichero nunca se trae dos veces aunque `buildImportPreview` (comprobación de `required`,
 *  §4.2) y `runImport` (escritura real, §4.4) lo pidan las dos. Un `null` (no se pudo traer) se
 *  cachea igual que un éxito — repetir la petición no lo va a arreglar dentro de la misma sesión de
 *  import, y CORS/404 no son transitorios en la escala de "unos segundos" que dura un import. */
export function createCachingFileFetcher(
	fetchFile: FetchTransferFileFn = fetchTransferFile
): FetchTransferFileFn {
	const cache = new Map<string, File | null>();
	return async (file: TransferFileValue) => {
		if (cache.has(file.url)) return cache.get(file.url) ?? null;
		const result = await fetchFile(file);
		cache.set(file.url, result);
		return result;
	};
}

export interface ImportCollectionPreview {
	type: string;
	contentType: ResolvedContentType;
	/** En el MISMO orden que `entries` (uno a uno) — `ImportDialog.svelte` los pinta emparejados. */
	records: TransferRecord[];
	entries: ImportEntry[];
}

export interface ImportPreview {
	collections: ImportCollectionPreview[];
}

/** Trocea `ids` en lotes de `MAX_PER_PAGE` (§4.2 "en lotes") y devuelve el subconjunto que YA
 *  existe en `type` — SIEMPRE `list` filtrado por el pseudo-campo `id` con `in`, nunca un `get`
 *  por registro. `ids` vacío no toca red (bucle de 0 vueltas). */
async function resolveExistingIds(
	list: ImportPort['list'],
	type: string,
	ids: readonly RecordId[]
): Promise<Set<RecordId>> {
	const existing = new Set<RecordId>();
	for (let i = 0; i < ids.length; i += MAX_PER_PAGE) {
		const batch = ids.slice(i, i + MAX_PER_PAGE);
		const page = await list(type, {
			filter: { kind: 'cond', field: 'id', op: 'in', value: batch },
			perPage: batch.length
		});
		for (const record of page.items) existing.add(record.id);
	}
	return existing;
}

function isRelationField(field: Field): field is Field & { type: 'relation'; target: string } {
	return field.type === 'relation';
}

function isRequiredFileField(field: Field): field is Field & { type: 'file'; required: true } {
	return field.type === 'file' && field.required;
}

/** ids de cada colección del FICHERO, por nombre de colección — la mitad "viaja en el fichero" de
 *  la condición de relación colgante (§4.2). */
function collectFileIds(
	collections: readonly ResolvedImportCollection[]
): Map<string, Set<RecordId>> {
	const byType = new Map<string, Set<RecordId>>();
	for (const { collection } of collections) {
		byType.set(collection.type, new Set(collection.records.map((r) => r.id)));
	}
	return byType;
}

/** ids referenciados por CUALQUIER campo `relation` de CUALQUIER registro de `collections`,
 *  agrupados por colección DESTINO (`field.target`) — el universo a comprobar (§4.2). */
function collectRelationTargets(
	collections: readonly ResolvedImportCollection[]
): Map<string, Set<RecordId>> {
	const byTarget = new Map<string, Set<RecordId>>();
	for (const { collection, contentType } of collections) {
		const relationFields = contentType.schema.fields.filter(isRelationField);
		for (const record of collection.records) {
			for (const field of relationFields) {
				const raw = record.values[field.name];
				const ids = Array.isArray(raw) ? raw : isNonEmpty(raw) ? [raw] : [];
				for (const id of ids) {
					if (typeof id !== 'string' || id === '') continue;
					const set = byTarget.get(field.target) ?? new Set<RecordId>();
					set.add(id);
					byTarget.set(field.target, set);
				}
			}
		}
	}
	return byTarget;
}

/**
 * Resuelve, para cada colección DESTINO de una relación, qué ids "existen" en el sentido de §4.2:
 * viajan en el propio fichero (cualquier colección) O ya existen en destino (`list` en lotes). Un
 * `id` referenciado que no aparece en ninguna de las dos fuentes es una relación COLGANTE.
 *
 * Si `list` del target falla (colección inexistente, sin permiso…), NINGUNO de los ids pendientes
 * de esa consulta se da por existente — fallo cerrado: mejor bloquear en la vista previa un
 * registro que sí se podría haber escrito, que arriesgarse a un `create` que PocketBase rechazaría
 * a mitad del import.
 */
async function buildRelationExistence(
	port: Pick<ImportPort, 'list'>,
	collections: readonly ResolvedImportCollection[]
): Promise<(targetType: string, id: RecordId) => boolean> {
	const fileIds = collectFileIds(collections);
	const targets = collectRelationTargets(collections);
	const confirmed = new Map<string, Set<RecordId>>();

	await Promise.all(
		[...targets].map(async ([targetType, ids]) => {
			const inFile = fileIds.get(targetType) ?? new Set<RecordId>();
			const need = [...ids].filter((id) => !inFile.has(id));
			let inDestination = new Set<RecordId>();
			if (need.length > 0) {
				try {
					inDestination = await resolveExistingIds(port.list, targetType, need);
				} catch {
					// Ver cabecera: fallo cerrado, `inDestination` se queda vacío.
				}
			}
			confirmed.set(targetType, new Set([...inFile, ...inDestination]));
		})
	);

	return (targetType, id) => confirmed.get(targetType)?.has(id) ?? false;
}

/**
 * Comprueba, SOLO para campos `file` `required` con un valor no vacío, si se pueden traer de
 * origen (§4.2/§4.4) — el resto de campos `file` nunca se prueba aquí, se resuelve perezosamente
 * en la escritura. Clave del mapa devuelto: `"<tipo>\0<id>\0<campo>"`. Un campo `multiple`
 * `required` cuenta como traíble si AL MENOS una de sus entradas se trae (mismo criterio que
 * `record-deserializer.ts`: el campo queda con lo que se pudo traer, nunca vacío del todo si algo
 * sí llegó).
 */
async function buildRequiredFileReachability(
	collections: readonly ResolvedImportCollection[],
	fetchFile: FetchTransferFileFn
): Promise<Map<string, boolean>> {
	const reachable = new Map<string, boolean>();
	const tasks: Promise<void>[] = [];

	for (const { collection, contentType } of collections) {
		const requiredFileFields = contentType.schema.fields.filter(isRequiredFileField);
		if (requiredFileFields.length === 0) continue;

		for (const record of collection.records) {
			for (const field of requiredFileFields) {
				const raw = record.values[field.name];
				if (!isNonEmpty(raw)) continue; // vacío: no es esta comprobación la que lo bloquea
				const entries = (Array.isArray(raw) ? raw : [raw]).filter(isTransferFileValue);
				const key = `${collection.type} ${record.id} ${field.name}`;
				tasks.push(
					(async () => {
						const results = await Promise.all(entries.map((entry) => fetchFile(entry)));
						reachable.set(
							key,
							results.some((file) => file !== null)
						);
					})()
				);
			}
		}
	}

	await Promise.all(tasks);
	return reachable;
}

/**
 * Construye la vista previa completa (§4.2): para cada colección VALIDADA (`import-format.ts`),
 * resuelve existencia/relaciones/ficheros contra `port` y delega la clasificación en
 * `classifyCollectionImport` (puro). No escribe NADA — es seguro llamarla tantas veces como haga
 * falta (p.ej. si el usuario cambia de fichero antes de confirmar).
 */
export async function buildImportPreview(
	port: Pick<ImportPort, 'list'>,
	collections: readonly ResolvedImportCollection[],
	fetchFile: FetchTransferFileFn = fetchTransferFile
): Promise<ImportPreview> {
	const [relationTargetExists, reachability] = await Promise.all([
		buildRelationExistence(port, collections),
		buildRequiredFileReachability(collections, fetchFile)
	]);

	const result: ImportCollectionPreview[] = [];
	for (const { collection, contentType } of collections) {
		const existingIds = await resolveExistingIds(
			port.list,
			collection.type,
			collection.records.map((r) => r.id)
		);
		const entries = classifyCollectionImport({
			contentType,
			records: collection.records,
			existingIds,
			relationTargetExists,
			requiredFileReachable: (recordId, fieldName) =>
				reachability.get(`${collection.type} ${recordId} ${fieldName}`) ?? true
		});
		result.push({ type: collection.type, contentType, records: collection.records, entries });
	}
	return { collections: result };
}

export type ImportOutcomeStatus = 'created' | 'updated' | 'failed';

export interface ImportOutcome {
	type: string;
	id: RecordId;
	status: ImportOutcomeStatus;
	/** Solo con `status: 'failed'`: mensaje humano del error que rechazó la escritura. */
	error?: string;
	/** Nombres de campo `file` que no se pudieron traer y entraron vacíos (§4.4) — presente solo en
	 *  un `created`/`updated` con éxito (un `failed` no llegó a escribir nada). */
	missingFiles?: string[];
}

export interface ImportReport {
	outcomes: ImportOutcome[];
	createdCount: number;
	updatedCount: number;
	failedCount: number;
	/** Registros que NO se escribieron por estar BLOQUEADOS en la vista previa, o por ser PISA sin
	 *  confirmar (`RunImportOptions.overwriteConfirmed`) — informativo, nunca cuenta como fallo. */
	skippedCount: number;
	/** `true` SOLO si se escribió al menos un registro y NINGUNO falló (§4.3: "nunca decir
	 *  'importado' si algo falló"). `skippedCount > 0` con `failedCount === 0` sigue siendo `true`
	 *  — lo saltado nunca se intentó, no es un fallo de la escritura. */
	success: boolean;
}

export interface RunImportOptions {
	/** `true` si el usuario confirmó EXPLÍCITAMENTE sobrescribir los PISA (§4.2: "requiere
	 *  confirmación aparte; jamás el default silencioso"). Con `false`, las entradas `overwrite` se
	 *  tratan como saltadas: `ImportDialog.svelte` es quien no debe ofrecer "Importar" sin esta
	 *  confirmación cuando hay alguna, pero esta función no confía en eso — lo aplica ella misma. */
	overwriteConfirmed: boolean;
}

interface WriteTask {
	collection: ImportCollectionPreview;
	record: TransferRecord;
	entry: ImportEntry;
}

/** Escribe un único registro (create o update según `task.entry.status`) y NUNCA deja escapar un
 *  rechazo: cualquier error se captura y se convierte en un `ImportOutcome` de `status: 'failed'`
 *  (§4.3: "un registro que falla no aborta los demás"). `Promise.allSettled` en `runImport` es
 *  defensa en profundidad, no el mecanismo — este es. */
async function writeOne(
	port: ImportPort,
	task: WriteTask,
	fetchFile: FetchTransferFileFn
): Promise<ImportOutcome> {
	const { collection, record, entry } = task;
	try {
		const { values, missingFiles } = await deserializeRecord(
			record,
			collection.contentType.schema.fields,
			fetchFile
		);
		if (entry.status === 'create') {
			await port.create(collection.type, values, { id: record.id });
			return { type: collection.type, id: record.id, status: 'created', missingFiles };
		}
		await port.update(collection.type, record.id, values);
		return { type: collection.type, id: record.id, status: 'updated', missingFiles };
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Error inesperado al escribir el registro';
		return { type: collection.type, id: record.id, status: 'failed', error };
	}
}

/**
 * Escribe `preview` (§4.3): agrupa las entradas escribibles (CREA + PISA confirmado) de TODAS las
 * colecciones en dos lotes GLOBALES por el orden topológico simple (`partitionByOutgoingRelations`
 * por colección, fusionados) — el lote 2 no arranca hasta que el lote 1 TERMINA entero (con éxito
 * o no). Sin transacción (PocketBase no la expone al cliente): cada registro se intenta con
 * `writeOne`, que nunca deja escapar un fallo — el informe final dice qué entró y qué no,
 * `success` nunca es `true` si algo falló.
 */
export async function runImport(
	port: ImportPort,
	preview: ImportPreview,
	options: RunImportOptions,
	fetchFile: FetchTransferFileFn = fetchTransferFile
): Promise<ImportReport> {
	let skippedCount = 0;
	const batch1: WriteTask[] = [];
	const batch2: WriteTask[] = [];

	for (const collection of preview.collections) {
		const recordsById = new Map(collection.records.map((r) => [r.id, r]));
		const writableEntries = collection.entries.filter((entry) => {
			if (entry.status === 'blocked') {
				skippedCount += 1;
				return false;
			}
			if (entry.status === 'overwrite' && !options.overwriteConfirmed) {
				skippedCount += 1;
				return false;
			}
			return true;
		});
		const entryById = new Map(writableEntries.map((e) => [e.id, e]));
		const writableRecords = writableEntries
			.map((entry) => recordsById.get(entry.id))
			.filter((record): record is TransferRecord => record !== undefined);

		const { withoutOutgoing, withOutgoing } = partitionByOutgoingRelations(
			writableRecords,
			collection.contentType.schema.fields
		);
		for (const record of withoutOutgoing) {
			batch1.push({ collection, record, entry: entryById.get(record.id)! });
		}
		for (const record of withOutgoing) {
			batch2.push({ collection, record, entry: entryById.get(record.id)! });
		}
	}

	const outcomes: ImportOutcome[] = [];
	const results1 = await Promise.allSettled(batch1.map((task) => writeOne(port, task, fetchFile)));
	for (const result of results1) if (result.status === 'fulfilled') outcomes.push(result.value);
	const results2 = await Promise.allSettled(batch2.map((task) => writeOne(port, task, fetchFile)));
	for (const result of results2) if (result.status === 'fulfilled') outcomes.push(result.value);

	const createdCount = outcomes.filter((o) => o.status === 'created').length;
	const updatedCount = outcomes.filter((o) => o.status === 'updated').length;
	const failedCount = outcomes.filter((o) => o.status === 'failed').length;

	return {
		outcomes,
		createdCount,
		updatedCount,
		failedCount,
		skippedCount,
		success: createdCount + updatedCount > 0 && failedCount === 0
	};
}
