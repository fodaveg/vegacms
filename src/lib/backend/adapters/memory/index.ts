/**
 * `createMemoryBackend(seed?)`: adaptador `memory` (§7 del contrato). Existe, por este orden,
 * para (1) probar que el puerto no tiene fugas de PB — si algo no se puede implementar en
 * memoria sin "saber de PB", el puerto está mal —, (2) correr el test de contrato sin red,
 * y (3) el modo demo público (P8).
 *
 * Sin persistencia: el estado vive en cierres de esta factory; recargar = reset.
 */

import type {
	AuthChangeReason,
	Capabilities,
	ContentType,
	Field,
	FieldValue,
	FileRef,
	Page,
	RecordEvent,
	RecordId,
	RecordInput,
	Session,
	ThumbSpec,
	VegaRecord
} from '../../types';
import type { FieldError } from '../../errors';
import { VegaError } from '../../errors';
import type { BackendPort } from '../../port';
import type { Query } from '../../query';
import { normalizeFieldValue } from '../../normalize';
import { assertContentTypeWritable, checkUnwritableFields } from '../../write-guards';
import type { MemorySeed } from './seed';
export type { MemorySeed } from './seed';
import { validateFieldValue } from './validate';
import {
	MemoryFileStore,
	materializeFileField,
	resolveFileUrl,
	validateFileFieldInput
} from './files';
import { applyQuery } from './query';

const CAPABILITIES: Capabilities = {
	realtime: true,
	thumbs: false,
	schemaDiscovery: true,
	filePerRecord: true,
	protectedFiles: false
};

const DEFAULT_USER_EMAIL = 'admin@vega.test';

/** Crea un `BackendPort` en memoria. Sin `seed`, acepta `admin@vega.test` + cualquier password no vacía. */
export function createMemoryBackend(seed?: MemorySeed): BackendPort {
	const usingDefaultSeed = seed === undefined;
	const users = seed?.users ?? [];
	const sessionTtlMs = seed?.sessionTtlMs;

	const contentTypes = [...(seed?.contentTypes ?? [])].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0
	);
	const contentTypesByName = new Map(contentTypes.map((ct) => [ct.name, ct]));

	// type -> id -> valores (ya normalizados por completo; leer es solo clonar).
	const records = new Map<string, Map<RecordId, Record<string, FieldValue>>>();
	for (const ct of contentTypes) {
		const byId = new Map<RecordId, Record<string, FieldValue>>();
		for (const seeded of seed?.records[ct.name] ?? []) {
			byId.set(seeded.id, buildNormalizedValues(ct.fields, seeded.values));
		}
		records.set(ct.name, byId);
	}

	const fileStore = new MemoryFileStore();
	const listeners = new Map<string, Set<(e: RecordEvent) => void>>();

	// ————— Auth —————
	let currentSessionState: { session: Session; expiresAtMs: number | null } | null = null;
	let latchedExpired = false;
	const authSubscribers = new Set<(s: Session | null, reason: AuthChangeReason) => void>();

	function notifyAuthChange(s: Session | null, reason: AuthChangeReason): void {
		for (const cb of authSubscribers) cb(s, reason);
	}

	/** Comprueba expiración por TTL. Si ya había expirado, lanza `auth-expired` (§4.1, L7). */
	function checkSessionAlive(): void {
		if (latchedExpired) throw VegaError.authExpired();
		if (
			currentSessionState &&
			currentSessionState.expiresAtMs !== null &&
			Date.now() >= currentSessionState.expiresAtMs
		) {
			latchedExpired = true;
			currentSessionState = null;
			notifyAuthChange(null, 'expired');
			throw VegaError.authExpired();
		}
	}

	function getContentTypeOrThrow(type: string): ContentType {
		const ct = contentTypesByName.get(type);
		if (!ct) throw VegaError.notFound(`El tipo "${type}" no existe`);
		return ct;
	}

	function recordExists(targetType: string, id: RecordId): boolean {
		return records.get(targetType)?.has(id) ?? false;
	}

	function dispatch(type: string, event: RecordEvent): void {
		const subs = listeners.get(type);
		if (!subs || subs.size === 0) return;
		queueMicrotask(() => {
			for (const cb of subs) cb(event);
		});
	}

	function toVegaRecord(
		type: string,
		id: RecordId,
		values: Record<string, FieldValue>
	): VegaRecord {
		return structuredClone({ id, type, values });
	}

	/** create/update comparten esta rutina: valida y, si todo pasa, materializa y guarda. */
	async function writeRecord(
		type: string,
		id: RecordId | null,
		data: RecordInput
	): Promise<VegaRecord> {
		checkSessionAlive();
		const ct = getContentTypeOrThrow(type);
		assertContentTypeWritable(ct);

		const byId = records.get(type)!;
		const existingRaw = id !== null ? byId.get(id) : undefined;
		if (id !== null && !existingRaw) throw VegaError.notFound(`Registro "${id}" no encontrado`);

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

			const value = provided
				? (data[field.name] as FieldValue)
				: normalizeFieldValue(field, undefined);
			const err = validateFieldValue(field, value, { recordExists });
			if (err) fieldErrors[field.name] = err;
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

		const finalId = id ?? generateId();
		byId.set(finalId, rawValues);
		const record = toVegaRecord(type, finalId, rawValues);
		dispatch(type, { action: isCreate ? 'create' : 'update', record: structuredClone(record) });
		return record;
	}

	const port: BackendPort = {
		capabilities: CAPABILITIES,

		async login(credentials) {
			const ok = usingDefaultSeed
				? credentials.email === DEFAULT_USER_EMAIL && credentials.password.length > 0
				: users.some((u) => u.email === credentials.email && u.password === credentials.password);

			if (!ok) throw VegaError.forbidden('Credenciales no válidas');

			latchedExpired = false;
			const expiresAtMs = sessionTtlMs !== undefined ? Date.now() + sessionTtlMs : null;
			const session: Session = {
				token: crypto.randomUUID(),
				user: { id: `user_${credentials.email}`, email: credentials.email },
				expiresAt: expiresAtMs !== null ? new Date(expiresAtMs).toISOString() : null
			};
			currentSessionState = { session, expiresAtMs };
			notifyAuthChange(session, 'login');
			return structuredClone(session);
		},

		async logout() {
			currentSessionState = null;
			latchedExpired = false;
			notifyAuthChange(null, 'logout');
		},

		currentSession() {
			return currentSessionState ? structuredClone(currentSessionState.session) : null;
		},

		async restoreSession() {
			if (!currentSessionState) return null;
			if (
				currentSessionState.expiresAtMs !== null &&
				Date.now() >= currentSessionState.expiresAtMs
			) {
				currentSessionState = null;
				return null; // caducado: limpia y devuelve null SIN lanzar y SIN emitir evento (§4.1)
			}
			notifyAuthChange(currentSessionState.session, 'restored');
			return structuredClone(currentSessionState.session);
		},

		onAuthChange(cb) {
			authSubscribers.add(cb);
			return () => authSubscribers.delete(cb);
		},

		async listContentTypes() {
			checkSessionAlive();
			return structuredClone(contentTypes);
		},

		async list(type, query?: Query) {
			checkSessionAlive();
			const ct = getContentTypeOrThrow(type);
			const byId = records.get(type)!;
			const all = [...byId.entries()].map(([id, values]) => toVegaRecord(type, id, values));
			const page = applyQuery(all, ct.fields, query);
			return structuredClone(page) as Page<VegaRecord>;
		},

		async get(type, id) {
			checkSessionAlive();
			getContentTypeOrThrow(type);
			const raw = records.get(type)!.get(id);
			if (!raw) throw VegaError.notFound(`Registro "${id}" no encontrado`);
			return toVegaRecord(type, id, raw);
		},

		async create(type, data) {
			return writeRecord(type, null, data);
		},

		async update(type, id, data) {
			return writeRecord(type, id, data);
		},

		async delete(type, id) {
			checkSessionAlive();
			const ct = getContentTypeOrThrow(type);
			assertContentTypeWritable(ct);
			const byId = records.get(type)!;
			const raw = byId.get(id);
			if (!raw) throw VegaError.notFound(`Registro "${id}" no encontrado`);
			byId.delete(id);
			for (const field of ct.fields) {
				if (field.type !== 'file') continue;
				const value = raw[field.name];
				for (const ref of Array.isArray(value) ? value : value ? [value] : []) {
					fileStore.delete(ref as FileRef);
				}
			}
			dispatch(type, { action: 'delete', record: toVegaRecord(type, id, raw) });
		},

		fileUrl(_record, _field, file, _opts?: { thumb?: ThumbSpec }) {
			// `_record`/`_field` no se necesitan para resolver la URL en memory (la `FileRef` ya
			// es globalmente única); `_opts.thumb` se ignora siempre (`capabilities.thumbs: false`).
			return resolveFileUrl(fileStore, file);
		},

		async subscribe(type, cb) {
			if (!CAPABILITIES.realtime) throw VegaError.backend('realtime no disponible (ley L8)');
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

	return port;
}

function buildNormalizedValues(
	fields: Field[],
	raw: Record<string, FieldValue>
): Record<string, FieldValue> {
	const out: Record<string, FieldValue> = {};
	for (const field of fields) out[field.name] = normalizeFieldValue(field, raw[field.name]);
	return out;
}

function defaultReadonlyValue(field: Field): FieldValue {
	// Emula un campo `autodate` de PB (readonly: true, siempre `date`): se rellena solo al crear.
	if (field.type === 'date') return new Date().toISOString();
	return normalizeFieldValue(field, undefined);
}

let idCounter = 0;
function generateId(): RecordId {
	idCounter += 1;
	return `${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}${idCounter}`;
}
