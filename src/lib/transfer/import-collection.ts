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
import type { Field, RecordId, RecordInput } from '$lib/backend/types';
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
	partitionRelationLevels,
	outgoingRelationKeys,
	relationKey,
	type ImportEntry,
	type RelationNode
} from './import-preview';

/** Subconjunto del puerto que esta Fase necesita — mismo criterio `Pick` que `export-collection.ts`
 *  para que los tests fabriquen un doble mínimo sin construir ningún adaptador real. */
export type ImportPort = Pick<BackendPort, 'list' | 'create' | 'update'>;

type FetchTransferFileFn = (file: TransferFileValue) => Promise<File | null>;

/** `FetchTransferFileFn` con caché (`createCachingFileFetcher`): además de traer, sabe SOLTAR el
 *  fichero de una `url` ya escrita. Un fetcher sin `release` (un doble de test, el de red a pelo)
 *  es válido — `runImport` lo llama con `?.`. */
type ReleasableFileFetcher = FetchTransferFileFn & {
	release?: (url: string) => void;
};

/** Escrituras simultáneas máximas de `runImport` (límite fijo, no configurable): con todas a la vez
 *  un `.vega.json` grande abría cientos de peticiones y mantenía todos los binarios traídos en
 *  memoria; 4 ocupa el pool sin saturar el backend. */
export const IMPORT_WRITE_CONCURRENCY = 4;

/** Envuelve `fetchFile` (por defecto `fetchTransferFile`, red real) con una caché por `url`: el
 *  mismo fichero nunca se trae dos veces aunque `buildImportPreview` (comprobación de `required`,
 *  §4.2) y `runImport` (escritura real, §4.4) lo pidan las dos. Un `null` (no se pudo traer) se
 *  cachea igual que un éxito — repetir la petición no lo va a arreglar dentro de la misma sesión de
 *  import, y CORS/404 no son transitorios en la escala de "unos segundos" que dura un import. */
export function createCachingFileFetcher(
	fetchFile: FetchTransferFileFn = fetchTransferFile
): ReleasableFileFetcher {
	// Se cachea la PROMESA, no el resultado: dos registros que piden la misma `url` a la vez (el
	// pool escribe 4 en paralelo) comparten UNA descarga en vez de lanzar una cada uno.
	const cache = new Map<string, Promise<File | null>>();
	const cached: ReleasableFileFetcher = (file: TransferFileValue) => {
		let pending = cache.get(file.url);
		if (!pending) {
			pending = fetchFile(file);
			cache.set(file.url, pending);
			// Un rechazo no se queda en la caché (el siguiente intento puede volver a probar).
			pending.catch(() => {
				if (cache.get(file.url) === pending) cache.delete(file.url);
			});
		}
		return pending;
	};
	// `runImport` suelta cada fichero en cuanto su registro se ha escrito (o ha fallado): la caché
	// solo tiene sentido ENTRE la vista previa y la escritura, y retenerla entera hasta el final
	// mantenía en memoria todos los binarios de un import grande.
	cached.release = (url) => {
		cache.delete(url);
	};
	return cached;
}

interface ImportCollectionPreview {
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
	const existingKeys = new Set<string>();
	for (const { collection, contentType } of collections) {
		const existingIds = await resolveExistingIds(
			port.list,
			collection.type,
			collection.records.map((r) => r.id)
		);
		for (const id of existingIds) existingKeys.add(relationKey(collection.type, id));
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
	const plan = planWrites(writeTasks(result));
	for (const task of plan.blocked) {
		if (plan.requiredBlocked.has(task)) {
			task.entry.status = 'blocked';
			task.entry.reasons.push({ kind: 'required-relation-cycle' });
		} else if (!task.collection.contentType.permissions.update) {
			task.entry.status = 'blocked';
			task.entry.reasons.push({ kind: 'no-update-permission' });
		}
	}
	// Un destino nuevo BLOQUEADO tampoco existirá al escribir sus dependientes. Propagar hasta
	// estabilizar; un registro bloqueado que YA existe sigue siendo un destino válido.
	let changed: boolean;
	do {
		changed = false;
		const unavailable = new Set(
			result.flatMap((c) =>
				c.entries
					.filter((e) => e.status === 'blocked' && !existingKeys.has(relationKey(c.type, e.id)))
					.map((e) => relationKey(c.type, e.id))
			)
		);
		for (const task of writeTasks(result)) {
			for (const field of task.collection.contentType.schema.fields) {
				if (field.type !== 'relation' || field.readonly) continue;
				const value = task.record.values[field.name];
				for (const id of Array.isArray(value) ? value : [value]) {
					if (typeof id !== 'string' || !unavailable.has(relationKey(field.target, id))) continue;
					task.entry.status = 'blocked';
					task.entry.reasons.push({ kind: 'dangling-relation', field: field.name, targetId: id });
					changed = true;
				}
			}
		}
	} while (changed);
	return { collections: result };
}

type ImportOutcomeStatus = 'created' | 'updated' | 'failed';

interface ImportOutcome {
	type: string;
	id: RecordId;
	status: ImportOutcomeStatus;
	/** Solo con `status: 'failed'`: mensaje humano del error que rechazó la escritura. */
	error?: string;
	/** El registro se creó, pero falló enlazar las relaciones diferidas. Sigue siendo `failed`;
	 * el consumidor debe refrescar la lista y el reintento requiere una vista previa nueva. */
	partialWrite?: 'created';
	/** Nombres de campo `file` que no se pudieron traer y entraron vacíos (§4.4) — presente solo en
	 *  un `created`/`updated` con éxito o una creación parcial. */
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

interface RunImportOptions {
	/** `true` si el usuario confirmó EXPLÍCITAMENTE sobrescribir los PISA (§4.2: "requiere
	 *  confirmación aparte; jamás el default silencioso"). Con `false`, las entradas `overwrite` se
	 *  tratan como saltadas: `ImportDialog.svelte` es quien no debe ofrecer "Importar" sin esta
	 *  confirmación cuando hay alguna, pero esta función no confía en eso — lo aplica ella misma. */
	overwriteConfirmed: boolean;
	/** Se llama tras cada registro escrito (con éxito o no) con lo hecho hasta ahora y el total a
	 *  escribir — es lo que pinta el progreso de `ImportDialog.svelte`. Omitidos no cuentan. */
	onProgress?: (progress: ImportProgress) => void;
}

export interface ImportProgress {
	done: number;
	total: number;
}

interface WriteTask {
	collection: ImportCollectionPreview;
	record: TransferRecord;
	entry: ImportEntry;
	/** Solo en creaciones cíclicas: se escriben tras crear todos los destinos posibles. */
	deferredRelations?: RecordInput;
}

function writeTasks(collections: readonly ImportCollectionPreview[]): WriteTask[] {
	return collections.flatMap((collection) => {
		const records = new Map(collection.records.map((r) => [r.id, r]));
		return collection.entries.flatMap((entry) => {
			const record = records.get(entry.id);
			return entry.status !== 'blocked' && record ? [{ collection, record, entry }] : [];
		});
	});
}

/** Primero conserva el orden acíclico normal. Solo el remanente necesita dos fases: crear
 * manteniendo sus relaciones obligatorias, y enlazar las opcionales que aún no existen.
 * Los PISA nunca pierden relaciones: se escriben enteros una vez creados sus destinos. */
function planWrites(tasks: readonly WriteTask[]): {
	levels: WriteTask[][];
	blocked: WriteTask[];
	requiredBlocked: Set<WriteTask>;
} {
	const newKeys = new Set(
		tasks
			.filter((t) => t.entry.status === 'create')
			.map((t) => relationKey(t.collection.type, t.record.id))
	);
	const canDefer = (task: WriteTask) =>
		task.entry.status === 'create' && task.collection.contentType.permissions.update;
	const node = (
		task: WriteTask,
		mode: 'all' | 'required' | 'nondeferrable' = 'all'
	): RelationNode<WriteTask> => ({
		item: task,
		key: relationKey(task.collection.type, task.record.id),
		deps: outgoingRelationKeys(
			task.record,
			task.collection.contentType.schema.fields.filter(
				(f) =>
					!f.readonly &&
					(mode === 'all' ||
						task.entry.status !== 'create' ||
						f.required ||
						(mode === 'nondeferrable' && !canDefer(task)))
			)
		).filter((key) => newKeys.has(key))
	});
	const ordered = partitionRelationLevels(tasks.map((task) => node(task)));
	if (ordered.cyclic.length === 0)
		return { levels: ordered.levels, blocked: [], requiredBlocked: new Set() };
	const unresolvedKeys = new Set(
		ordered.cyclic.map((t) => relationKey(t.collection.type, t.record.id))
	);
	// Sin permiso update, incluso una relación opcional debe estar completa al crear.
	const hard = partitionRelationLevels(ordered.cyclic.map((task) => node(task, 'nondeferrable')));
	const requiredBlocked = new Set(
		partitionRelationLevels(ordered.cyclic.map((task) => node(task, 'required'))).cyclic
	);
	const levels = hard.levels.map((level) => {
		const planned = level.map((task) => {
			if (!canDefer(task)) return task;
			const values = { ...task.record.values };
			const deferredRelations: RecordInput = {};
			for (const field of task.collection.contentType.schema.fields) {
				if (field.type !== 'relation' || field.required || field.readonly) continue;
				if (
					!outgoingRelationKeys(task.record, [field]).some(
						(key) => newKeys.has(key) && unresolvedKeys.has(key)
					)
				)
					continue;
				deferredRelations[field.name] = values[field.name] as RecordInput[string];
				delete values[field.name];
			}
			return Object.keys(deferredRelations).length === 0
				? task
				: {
						...task,
						record: { ...task.record, values },
						deferredRelations
					};
		});
		for (const task of level)
			unresolvedKeys.delete(relationKey(task.collection.type, task.record.id));
		return planned;
	});
	return { levels: [...ordered.levels, ...levels], blocked: hard.cyclic, requiredBlocked };
}

/** Cuántos registros pendientes de escribir usan cada `url` de fichero (una entrada por uso). */
type FileUses = Map<string, number>;

/** Urls de fichero que referencia `record`, una por aparición. */
function recordFileUrls(record: TransferRecord): string[] {
	const urls: string[] = [];
	for (const raw of Object.values(record.values)) {
		for (const item of Array.isArray(raw) ? raw : [raw]) {
			if (isTransferFileValue(item)) urls.push(item.url);
		}
	}
	return urls;
}

/** Escribe un único registro (create o update según `task.entry.status`) y NUNCA deja escapar un
 *  rechazo: cualquier error se captura y se convierte en un `ImportOutcome` de `status: 'failed'`
 *  (§4.3: "un registro que falla no aborta los demás"). El `catch` de `runPool` es defensa en
 *  profundidad, no el mecanismo — este es. */
async function writeOne(
	port: ImportPort,
	task: WriteTask,
	fetchFile: ReleasableFileFetcher,
	fileUses: FileUses
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
	} finally {
		releaseRecordFiles(record, fetchFile, fileUses);
	}
}

/** Suelta de la caché del fetcher los ficheros de `record` (ya escrito o ya fallido), pero solo
 *  cuando ya NO los usa ningún otro registro pendiente: con una `url` compartida, soltarla en el
 *  primero obligaba al segundo a descargarla otra vez (y, si fallaba, a entrar con el campo vacío). */
function releaseRecordFiles(
	record: TransferRecord,
	fetchFile: ReleasableFileFetcher,
	fileUses: FileUses
): void {
	for (const url of recordFileUrls(record)) {
		const left = (fileUses.get(url) ?? 1) - 1;
		if (left > 0) {
			fileUses.set(url, left);
			continue;
		}
		fileUses.delete(url);
		fetchFile.release?.(url);
	}
}

/** Ejecuta `tasks` con a lo sumo `IMPORT_WRITE_CONCURRENCY` en vuelo y devuelve UN resultado por
 *  tarea (en el orden de entrada, no el de terminación). `writeOne` no rechaza nunca; si lo hiciera
 *  (bug futuro), la tarea cuenta igualmente como `failed` — ningún camino pierde un registro. */
async function runPool(
	port: ImportPort,
	tasks: readonly WriteTask[],
	fetchFile: ReleasableFileFetcher,
	fileUses: FileUses,
	onSettled: (outcome: ImportOutcome, task: WriteTask) => void
): Promise<ImportOutcome[]> {
	const outcomes = new Array<ImportOutcome>(tasks.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < tasks.length) {
			const index = next++;
			const task = tasks[index];
			try {
				outcomes[index] = await writeOne(port, task, fetchFile, fileUses);
			} catch (err) {
				outcomes[index] = {
					type: task.collection.type,
					id: task.record.id,
					status: 'failed',
					error: err instanceof Error ? err.message : 'Error inesperado al escribir el registro'
				};
			}
			onSettled(outcomes[index], task);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(IMPORT_WRITE_CONCURRENCY, tasks.length) }, () => worker())
	);
	return outcomes;
}

/**
 * Escribe `preview` (§4.3): agrupa las entradas escribibles (CREA + PISA confirmado) de TODAS las
 * colecciones en NIVELES GLOBALES por orden topológico (`planWrites`) — un nivel no arranca
 * hasta que el anterior TERMINA entero (con éxito o no). DENTRO de cada nivel las escrituras van
 * por un pool de `IMPORT_WRITE_CONCURRENCY` y cada fichero se suelta de la caché del
 * fetcher cuando termina el ÚLTIMO registro que lo usa. Sin transacción (PocketBase no la expone al cliente): cada registro se intenta con
 * `writeOne`, que nunca deja escapar un fallo. En ciclos opcionales crea primero conservando ids,
 * luego enlaza solo sus relaciones diferidas. Un fallo al enlazar informa creación parcial;
 * `success` nunca es `true` si algo falló, y no se vacía ni borra un registro existente.
 */
export async function runImport(
	port: ImportPort,
	preview: ImportPreview,
	options: RunImportOptions,
	fetchFile: ReleasableFileFetcher = fetchTransferFile
): Promise<ImportReport> {
	const tasks = writeTasks(preview.collections).filter(
		(task) => task.entry.status !== 'overwrite' || options.overwriteConfirmed
	);
	const skippedCount = preview.collections.reduce((n, c) => n + c.entries.length, 0) - tasks.length;
	const plan = planWrites(tasks);
	const fileUses: FileUses = new Map();
	for (const task of tasks) {
		for (const url of recordFileUrls(task.record)) fileUses.set(url, (fileUses.get(url) ?? 0) + 1);
	}
	const total = tasks.length;
	let done = 0;
	const tick = () => {
		done += 1;
		options.onProgress?.({ done, total });
	};
	options.onProgress?.({ done: 0, total });
	const outcomes: ImportOutcome[] = [];
	const pending: { task: WriteTask; outcome: ImportOutcome }[] = [];
	for (const task of plan.blocked) {
		outcomes.push({
			type: task.collection.type,
			id: task.record.id,
			status: 'failed',
			error: plan.requiredBlocked.has(task)
				? 'No se puede crear un ciclo de relaciones obligatorias.'
				: 'No se puede enlazar este ciclo con los permisos de actualización disponibles.'
		});
		releaseRecordFiles(task.record, fetchFile, fileUses);
		tick();
	}
	for (const level of plan.levels) {
		outcomes.push(
			...(await runPool(port, level, fetchFile, fileUses, (outcome, task) => {
				if (task.deferredRelations && outcome.status === 'created') pending.push({ task, outcome });
				else tick();
			}))
		);
	}
	// La segunda fase solo manda relaciones: no reenvía ficheros ni valores de contenido.
	const links = pending.map(({ task }) => ({
		...task,
		record: { id: task.record.id, values: task.deferredRelations as TransferRecord['values'] },
		entry: { ...task.entry, status: 'overwrite' as const },
		deferredRelations: undefined
	}));
	const linked = await runPool(port, links, fetchFile, new Map(), tick);
	for (let i = 0; i < pending.length; i++) {
		const outcome = pending[i].outcome;
		if (linked[i].status === 'failed') {
			outcome.status = 'failed';
			outcome.partialWrite = 'created';
			outcome.error = linked[i].error;
		}
	}

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
