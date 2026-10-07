/** Lecturas, escrituras, borrado y eventos de registros del adaptador `memory`. */

import type { BackendPort } from '../../port';
import type {
	ContentType,
	Field,
	FieldValue,
	FileRef,
	Page,
	RecordEvent,
	RecordId,
	RecordInput,
	ThumbSpec,
	VegaRecord
} from '../../types';
import type { FieldError } from '../../errors';
import { VegaConflictError, VegaError } from '../../errors';
import { recordVersion, type RecordVersion } from '../../version';
import type { Query } from '../../query';
import { projectedFields } from '../../query';
import { normalizeFieldValue } from '../../normalize';
import { assertExplicitRecordIdCapability } from '../../capability-guards';
import { assertContentTypeWritable, checkUnwritableFields } from '../../write-guards';
import { validateFieldValue } from './validate';
import { materializeFileField, resolveFileUrl, validateFileFieldInput } from './files';
import { applyQuery } from './query';
import { defaultReadonlyValue } from './schema-ops';
import type { MemoryState } from './state';

export type MemoryRecordOps = Pick<
	BackendPort,
	'list' | 'get' | 'create' | 'update' | 'delete' | 'fileUrl' | 'subscribe'
> & {
	generateId(): RecordId;
	getContentTypeOrThrow(type: string): ContentType;
};

/** Todas las operaciones leen y mutan los mismos mapas; la sesión se consulta en cada acceso. */
export function createRecordOps(
	state: MemoryState,
	checkSessionAlive: () => void,
	capabilities: BackendPort['capabilities']
): MemoryRecordOps {
	const { contentTypesByName, records, fileStore, listeners } = state;
	// El contador pertenece a esta instancia, también cuando administración genera ids.
	let idCounter = 0;
	function generateId(): RecordId {
		idCounter += 1;
		return `${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}${idCounter}`;
	}

	function getContentTypeOrThrow(type: string): ContentType {
		const ct = contentTypesByName.get(type);
		if (!ct) throw VegaError.notFound(`El tipo "${type}" no existe`);
		return ct;
	}

	function recordExists(targetType: string, id: RecordId): boolean {
		return records.get(targetType)?.has(id) ?? false;
	}

	function uniqueValueExists(
		type: string,
		field: Field,
		value: FieldValue,
		currentId: RecordId | null
	): boolean {
		for (const [recordId, raw] of records.get(type)!) {
			if (currentId !== null && recordId === currentId) continue;
			// `url`/`email` usan un índice único PARCIAL (`collectionUniqueIndexes`): el vacío no cuenta.
			if ((field.type === 'url' || field.type === 'email') && value === '') return false;
			if (raw[field.name] === value) return true;
		}
		return false;
	}

	function dispatch(type: string, event: RecordEvent): void {
		const subs = listeners.get(type);
		if (!subs || subs.size === 0) return;
		queueMicrotask(() => {
			for (const cb of subs) cb(event);
		});
	}

	/**
	 * Vista interna SIN clonar (`values` sigue siendo la referencia guardada en el `Map`). Nunca
	 * debe salir del closure tal cual: solo para trabajo interno (filtrar/ordenar en `list`).
	 */
	function viewRecord(type: string, id: RecordId, values: Record<string, FieldValue>): VegaRecord {
		return { id, type, values };
	}

	/** La única forma de entregar un registro a quien llama al puerto: siempre clonado. */
	function toVegaRecord(
		type: string,
		id: RecordId,
		values: Record<string, FieldValue>
	): VegaRecord {
		return structuredClone(viewRecord(type, id, values));
	}

	/**
	 * Falla cerrado si la versión de `raw` (el registro tal cual está guardado AHORA) no es la
	 * esperada: `VegaConflictError` con el registro y la versión del servidor (`port.ts#update`).
	 */
	function assertExpectedVersion(
		type: string,
		id: RecordId,
		raw: Record<string, FieldValue>,
		expectedVersion: RecordVersion
	): void {
		const current = toVegaRecord(type, id, raw);
		const serverVersion = recordVersion(current);
		if (serverVersion !== expectedVersion) throw new VegaConflictError(current, serverVersion);
	}

	/**
	 * create/update comparten esta rutina: valida y, si todo pasa, materializa y guarda.
	 * `explicitId` (§8·B2, `capabilities.explicitRecordId`) SOLO tiene efecto en modo CREATE
	 * (`id === null`): fija el id del registro nuevo en vez de generarlo. Si ese id ya pertenece a
	 * un registro VIVO de `type`, la creación falla — `create()` nunca pisa un registro existente,
	 * ni con id explícito ni sin él (§8·B2 del contrato: "nunca pisar el registro vivo").
	 */
	async function writeRecord(
		type: string,
		id: RecordId | null,
		data: RecordInput,
		explicitId?: RecordId,
		expectedVersion?: RecordVersion
	): Promise<VegaRecord> {
		checkSessionAlive();
		const ct = getContentTypeOrThrow(type);
		assertContentTypeWritable(ct);

		const byId = records.get(type)!;
		const existingRaw = id !== null ? byId.get(id) : undefined;
		if (id !== null && !existingRaw) throw VegaError.notFound(`Registro "${id}" no encontrado`);
		// Versión esperada (`BackendPort.update`): se compara ANTES de validar, igual que el
		// adaptador `pocketbase` (que la compara nada más releer), para que los dos respondan lo
		// mismo a un guardado desfasado que además trae un dato inválido: primero el conflicto.
		if (id !== null && existingRaw && expectedVersion !== undefined) {
			assertExpectedVersion(type, id, existingRaw, expectedVersion);
		}
		if (id === null && explicitId !== undefined && byId.has(explicitId)) {
			throw VegaError.validation({
				'': { code: 'validation_not_unique', message: 'Ya existe un registro con ese id' }
			});
		}

		const rejects = checkUnwritableFields(ct.fields, data);
		if (Object.keys(rejects).length > 0) throw VegaError.validation(rejects);

		const fieldErrors: Record<string, FieldError> = {};
		const isCreate = id === null;

		for (const field of ct.fields) {
			if (field.readonly || field.type === 'unsupported') continue;
			const provided = Object.prototype.hasOwnProperty.call(data, field.name);
			if (!isCreate && !provided) continue; // update parcial: solo se valida lo que se toca

			if (field.type === 'file') {
				const input = provided ? data[field.name] : null;
				const err = validateFileFieldInput(field, existingRaw?.[field.name], input);
				if (err) fieldErrors[field.name] = err;
				continue;
			}

			// Se normaliza SIEMPRE antes de validar (aunque el valor venga provisto): si no, un
			// '' explícito en un date/select/relation single no cuenta como "vacío" para
			// `isEmptyValue` (que solo trata '' como vacío en texto) y un campo `required` se
			// podía eludir escribiendo la cadena vacía en vez de omitir el campo (bug corregido:
			// "vacío" tiene que ser LA MISMA noción en lectura, query y escritura).
			const value = normalizeFieldValue(field, provided ? data[field.name] : undefined);
			const err = validateFieldValue(field, value, { recordExists });
			if (err) fieldErrors[field.name] = err;
			else if (field.unique && uniqueValueExists(type, field, value, id)) {
				fieldErrors[field.name] = {
					code: 'validation_not_unique',
					message: 'Ya existe un registro con este valor'
				};
			}
		}

		if (Object.keys(fieldErrors).length > 0) throw VegaError.validation(fieldErrors);

		// Todo validado: ahora sí, efectos secundarios (subir ficheros nuevos).
		const rawValues: Record<string, FieldValue> = { ...existingRaw };
		for (const field of ct.fields) {
			if (field.type === 'unsupported') continue;

			if (field.readonly) {
				if (isCreate) rawValues[field.name] = defaultReadonlyValue(field);
				continue; // el backend gestiona el valor; nunca se toca en update.
			}

			const provided = Object.prototype.hasOwnProperty.call(data, field.name);
			if (!provided) {
				if (isCreate) rawValues[field.name] = normalizeFieldValue(field, undefined);
				continue;
			}

			if (field.type === 'file') {
				rawValues[field.name] = await materializeFileField(
					fileStore,
					field,
					existingRaw?.[field.name],
					data[field.name]
				);
			} else {
				rawValues[field.name] = normalizeFieldValue(field, data[field.name]);
			}
		}

		const finalId = id ?? explicitId ?? generateId();
		// Comprobar-y-escribir sin hueco: entre la comparación de arriba y aquí puede haber cedido
		// el hilo (`materializeFileField` es asíncrona), y otra escritura del mismo registro habría
		// sustituido el objeto guardado (cada escritura hace `byId.set` con un objeto NUEVO). Con
		// versión esperada, eso es un conflicto, no una carrera que se resuelve pisando.
		if (id !== null && expectedVersion !== undefined && byId.get(id) !== existingRaw) {
			assertExpectedVersion(type, id, byId.get(id)!, expectedVersion);
		}
		byId.set(finalId, rawValues);
		const record = toVegaRecord(type, finalId, rawValues);
		dispatch(type, { action: isCreate ? 'create' : 'update', record: structuredClone(record) });
		return record;
	}

	const recordKey = (type: string, id: RecordId): string => `${type}\u0000${id}`;

	function relationIds(value: FieldValue): RecordId[] {
		if (Array.isArray(value)) {
			const ids: RecordId[] = [];
			for (const item of value) {
				if (typeof item === 'string') ids.push(item);
			}
			return ids;
		}
		return typeof value === 'string' && value ? [value] : [];
	}

	/**
	 * Calcula primero TODO el cierre de cascada, sin mutar. PocketBase ejecuta el borrado de forma
	 * atómica: si una relación obligatoria sin cascada quedara vacía, no puede haberse borrado ni
	 * desvinculado nada cuando se devuelve el error.
	 */
	function buildDeletePlan(type: string, id: RecordId): Set<string> {
		const plan = new Set([recordKey(type, id)]);
		let changed = true;

		while (changed) {
			changed = false;
			for (const ownerType of contentTypesByName.values()) {
				const ownerRecords = records.get(ownerType.name);
				if (!ownerRecords) continue;

				for (const field of ownerType.fields) {
					if (field.type !== 'relation' || !field.cascadeDelete) continue;
					for (const [ownerId, ownerRaw] of ownerRecords) {
						const ownerKey = recordKey(ownerType.name, ownerId);
						if (plan.has(ownerKey)) continue;

						const current = relationIds(ownerRaw[field.name]);
						const remaining = current.filter(
							(relatedId) => !plan.has(recordKey(field.target, relatedId))
						);
						if (remaining.length < current.length && remaining.length === 0) {
							plan.add(ownerKey);
							changed = true;
						}
					}
				}
			}
		}

		return plan;
	}

	function assertDeletePlanAllowed(plan: Set<string>): void {
		for (const ownerType of contentTypesByName.values()) {
			const ownerRecords = records.get(ownerType.name);
			if (!ownerRecords) continue;

			for (const field of ownerType.fields) {
				if (field.type !== 'relation' || !field.required || field.cascadeDelete) continue;
				for (const [ownerId, ownerRaw] of ownerRecords) {
					if (plan.has(recordKey(ownerType.name, ownerId))) continue;

					const current = relationIds(ownerRaw[field.name]);
					const remaining = current.filter(
						(relatedId) => !plan.has(recordKey(field.target, relatedId))
					);
					if (remaining.length < current.length && remaining.length === 0) {
						throw VegaError.backend(
							'No se puede borrar: el registro forma parte de una relación obligatoria.'
						);
					}
				}
			}
		}
	}

	function applyDeletePlan(plan: Set<string>): void {
		const deleted: Array<{ type: string; id: RecordId; raw: Record<string, FieldValue> }> = [];

		for (const ct of contentTypesByName.values()) {
			const byId = records.get(ct.name);
			if (!byId) continue;
			for (const [id, raw] of [...byId.entries()]) {
				if (!plan.has(recordKey(ct.name, id))) continue;
				deleted.push({ type: ct.name, id, raw });
				byId.delete(id);
			}
		}

		for (const ownerType of contentTypesByName.values()) {
			const ownerRecords = records.get(ownerType.name);
			if (!ownerRecords) continue;
			for (const field of ownerType.fields) {
				if (field.type !== 'relation') continue;
				for (const [ownerId, ownerRaw] of ownerRecords) {
					const current = relationIds(ownerRaw[field.name]);
					const remaining = current.filter(
						(relatedId) => !plan.has(recordKey(field.target, relatedId))
					);
					if (remaining.length === current.length) continue;

					ownerRaw[field.name] = field.multiple ? remaining : (remaining[0] ?? null);
					dispatch(ownerType.name, {
						action: 'update',
						record: toVegaRecord(ownerType.name, ownerId, ownerRaw)
					});
				}
			}
		}

		for (const { type, id, raw } of deleted) {
			const ct = contentTypesByName.get(type)!;
			for (const field of ct.fields) {
				if (field.type !== 'file') continue;
				const value = raw[field.name];
				for (const ref of Array.isArray(value) ? value : value ? [value] : []) {
					fileStore.delete(ref as FileRef);
				}
			}
			dispatch(type, { action: 'delete', record: toVegaRecord(type, id, raw) });
		}
	}

	return {
		generateId,
		getContentTypeOrThrow,
		async list(type, query?: Query) {
			checkSessionAlive();
			const ct = getContentTypeOrThrow(type);
			const byId = records.get(type)!;
			// Vista sin clonar para filtrar/ordenar/paginar TODO el tipo; clonar aquí ya para
			// descartarlo enseguida sería doble trabajo (antes: toVegaRecord clonaba cada
			// registro y luego structuredClone(page) volvía a clonar los ya-clonados). Se clona
			// una única vez, al final, y solo los `perPage` registros que de verdad salen.
			const all = [...byId.entries()].map(([id, values]) => viewRecord(type, id, values));
			const page = applyQuery(all, ct.fields, query);
			// Proyección (`Query.fields`), mismo significado que en `pocketbase`: `values` lleva
			// SOLO los campos pedidos. Se aplica DESPUÉS de filtrar/ordenar, que pueden usar
			// campos no proyectados. `applyQuery` ya validó los nombres.
			const returnedFields = query?.fields ? projectedFields(ct.fields, query.fields) : null;
			return {
				...page,
				items: page.items.map((r) =>
					structuredClone(
						returnedFields
							? {
									...r,
									values: Object.fromEntries(
										returnedFields.map((field) => [field.name, r.values[field.name]])
									)
								}
							: r
					)
				)
			} satisfies Page<VegaRecord>;
		},

		async get(type, id) {
			checkSessionAlive();
			getContentTypeOrThrow(type);
			const raw = records.get(type)!.get(id);
			if (!raw) throw VegaError.notFound(`Registro "${id}" no encontrado`);
			return toVegaRecord(type, id, raw);
		},

		async create(type, data, opts) {
			assertExplicitRecordIdCapability(capabilities, opts?.id !== undefined);
			return writeRecord(type, null, data, opts?.id);
		},

		async update(type, id, data, opts) {
			return writeRecord(type, id, data, undefined, opts?.expectedVersion);
		},

		async delete(type, id) {
			checkSessionAlive();
			const ct = getContentTypeOrThrow(type);
			assertContentTypeWritable(ct);
			const byId = records.get(type)!;
			const raw = byId.get(id);
			if (!raw) throw VegaError.notFound(`Registro "${id}" no encontrado`);
			const plan = buildDeletePlan(type, id);
			assertDeletePlanAllowed(plan);
			applyDeletePlan(plan);
		},

		fileUrl(_record, _field, file, _opts?: { thumb?: ThumbSpec }) {
			// `_record`/`_field` no se necesitan para resolver la URL en memory (la `FileRef` ya
			// es globalmente única); `_opts.thumb` se ignora siempre (`capabilities.thumbs: false`).
			return resolveFileUrl(fileStore, file);
		},

		async subscribe(type, cb) {
			if (!capabilities.realtime) throw VegaError.backend('realtime no disponible (ley L8)');
			getContentTypeOrThrow(type);
			let subs = listeners.get(type);
			if (!subs) {
				subs = new Set();
				listeners.set(type, subs);
			}
			subs.add(cb);
			return () => {
				subs!.delete(cb);
			};
		}
	};
}
