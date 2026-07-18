/**
 * `createPocketBaseBackend({ url })`: adaptador real sobre el SDK `pocketbase` (§1 del
 * contrato). Único módulo del repo donde puede existir `import ... from 'pocketbase'` (ley L1,
 * forzada por ESLint). Ver `README.md` de este directorio para la landmine de autocancelación.
 */

import PocketBase, { ClientResponseError, getTokenPayload } from 'pocketbase';
import type { CollectionModel } from 'pocketbase';
import type {
	AuthChangeReason,
	Capabilities,
	ContentType,
	Field,
	FieldValue,
	RecordEvent,
	RecordInput,
	Session,
	ThumbSpec,
	VegaRecord
} from '../../types';
import type { FieldError } from '../../errors';
import { VegaError } from '../../errors';
import type { BackendPort } from '../../port';
import type { Query } from '../../query';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE, validateQuery } from '../../query';
import { normalizeFieldValue } from '../../normalize';
import { assertContentTypeWritable, checkUnwritableFields } from '../../write-guards';
import { validateFileFieldInput } from '../../file-guards';
import type { CollectionSpec, EnsureResult } from '../../collections';
import { checkReservedNames } from '../../collections';
import { mapPocketBaseError } from './errors';
import { mapCollectionsToContentTypes } from './schema';
import { compileFilter, compileSort } from './query';
import { planFileFieldWrite, resolveFileUrl } from './files';
import { ensureCollectionsOnPocketBase } from './collections';
import { clearPersistedToken, loadPersistedToken, savePersistedToken } from './persistence';

const CAPABILITIES: Capabilities = {
	realtime: true,
	thumbs: true,
	schemaDiscovery: true,
	filePerRecord: true,
	protectedFiles: false,
	schemaBootstrap: true
};

export interface PocketBaseBackendOptions {
	url: string;
}

/** Crea un `BackendPort` sobre un PocketBase real en `url`. */
export function createPocketBaseBackend({ url }: PocketBaseBackendOptions): BackendPort {
	const pb = new PocketBase(url);
	// LANDMINE (ver README): el SDK cancela peticiones "duplicadas" en vuelo por defecto. La
	// política de cancelación es de los consumidores (P3/P4), no del transporte (§4.6).
	pb.autoCancellation(false);

	const host = hostOf(url);
	const authSubscribers = new Set<(s: Session | null, reason: AuthChangeReason) => void>();

	// Nuestra propia noción de "¿creemos tener sesión?", independiente de `pb.authStore`:
	// la necesitamos para distinguir auth-expired de forbidden en el mapeo de errores (ver
	// `errors.ts`) y para la deduplicación de eventos "expired" (L7).
	let hasSession = false;
	let latchedExpired = false;

	function notifyAuthChange(s: Session | null, reason: AuthChangeReason): void {
		for (const cb of authSubscribers) cb(s, reason);
	}

	function sessionFromAuthStore(): Session | null {
		if (!pb.authStore.isValid || !pb.authStore.record) return null;
		const payload = getTokenPayload(pb.authStore.token);
		const expiresAt =
			typeof payload.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : null;
		return {
			token: pb.authStore.token,
			user: { id: String(pb.authStore.record.id), email: String(pb.authStore.record.email ?? '') },
			expiresAt
		};
	}

	/** Limpia sesión + emite `expired` UNA sola vez, aunque N operaciones lo detecten a la vez (L7). */
	function handleAuthExpiryOnce(): void {
		if (latchedExpired) return;
		latchedExpired = true;
		hasSession = false;
		pb.authStore.clear();
		clearPersistedToken();
		notifyAuthChange(null, 'expired');
	}

	/**
	 * Chequeo proactivo (sin red): `pb.authStore.isValid` ya mira el `exp` del JWT localmente.
	 * Si detecta que expiró, dispara `handleAuthExpiryOnce` y lanza — igual filosofía que el
	 * TTL de `memory`, pero basada en el claim real en vez de un TTL inventado.
	 */
	function checkSessionAlive(): void {
		if (latchedExpired) throw VegaError.authExpired();
		if (hasSession && !pb.authStore.isValid) {
			handleAuthExpiryOnce();
			throw VegaError.authExpired();
		}
	}

	/**
	 * Envuelve toda operación autenticada: chequeo proactivo + mapeo de errores + latch de
	 * expiración.
	 *
	 * `hadSessionAtStart` se captura ANTES de `op()`, no dentro del `catch` (bug corregido, L7):
	 * con dos operaciones hermanas en vuelo, si la primera en fallar ya mutó `hasSession` a
	 * `false` vía `handleAuthExpiryOnce()`, la segunda leería ese valor YA mutado si lo
	 * consultase en su propio `catch` — mapeando a `forbidden` en vez de `auth-expired`, pese a
	 * que AMBAS arrancaron con sesión. Cada operación debe mapear según lo que era cierto
	 * cuando ELLA arrancó; solo el EVENTO `onAuthChange('expired')` se deduplica (vía
	 * `handleAuthExpiryOnce`), nunca el `kind` del error.
	 */
	async function guarded<T>(op: () => Promise<T>): Promise<T> {
		checkSessionAlive();
		const hadSessionAtStart = hasSession;
		try {
			return await op();
		} catch (err) {
			const mapped = mapPocketBaseError(err, { hadSession: hadSessionAtStart });
			if (mapped.kind === 'auth-expired') handleAuthExpiryOnce();
			throw mapped;
		}
	}

	/**
	 * Mapea localmente el 400-con-`data` de create/update usando los `Field.name` reales del
	 * `ContentType` (§5: "campos anidados por PB que Vega no reconoce → `''`"). Cualquier OTRO
	 * caso (401/403/404/5xx/red…) se deja pasar SIN mapear: el catch genérico de `guarded()` lo
	 * mapeará con la instantánea correcta de `hasSession` capturada al ENTRAR en la operación
	 * (evita repetir aquí la carrera de L7 corregida arriba, que no depende del status 400).
	 */
	function mapKnownFieldWriteError(err: unknown, fields: Field[]): unknown {
		if (err instanceof ClientResponseError && err.status === 400) {
			return mapPocketBaseError(err, {
				hadSession: true, // irrelevante: la rama 400 de mapPocketBaseError no consulta hadSession
				knownFields: fields.map((f) => f.name)
			});
		}
		return err;
	}

	async function fetchAllContentTypes(): Promise<ContentType[]> {
		// `pb.collections.getFullList()` NO sirve aquí (§9.5): por debajo hace
		// `e.items = e.items?.map(...) || []`, así que una respuesta 2xx sin `items[]` (forma
		// inesperada) se convierte en silencio en `[]` — indistinguible de "0 colecciones"
		// genuino. Se pagina a mano con `pb.send` sobre el JSON crudo para poder validar la
		// forma de CADA página ANTES de que el SDK la "arregle".
		const all: CollectionModel[] = [];
		let page = 1;
		for (;;) {
			const raw: unknown = await pb.send('/api/collections', {
				method: 'GET',
				query: { page, perPage: COLLECTIONS_PAGE_SIZE }
			});
			const parsed = assertCollectionsPageShape(raw);
			all.push(...parsed.items);
			if (parsed.items.length === 0 || page >= parsed.totalPages) break;
			page += 1;
		}
		return mapCollectionsToContentTypes(all);
	}

	async function getContentTypeOrThrow(type: string): Promise<ContentType> {
		const all = await fetchAllContentTypes();
		const ct = all.find((c) => c.name === type);
		if (!ct) throw VegaError.notFound(`El tipo "${type}" no existe`);
		return ct;
	}

	function buildValuesFromRaw(
		fields: Field[],
		raw: Record<string, unknown>
	): Record<string, FieldValue> {
		const values: Record<string, FieldValue> = {};
		for (const field of fields) values[field.name] = normalizeFieldValue(field, raw[field.name]);
		return values;
	}

	function toVegaRecord(type: string, raw: Record<string, unknown>, fields: Field[]): VegaRecord {
		return { id: String(raw.id), type, values: buildValuesFromRaw(fields, raw) };
	}

	function buildWriteBody(
		fields: Field[],
		data: RecordInput,
		existingValues: Record<string, FieldValue> | undefined
	): Record<string, unknown> {
		const body: Record<string, unknown> = {};
		for (const name of Object.keys(data)) {
			const field = fields.find((f) => f.name === name)!;
			if (field.type === 'file') {
				Object.assign(body, planFileFieldWrite(field, existingValues?.[field.name], data[name]));
			} else {
				body[name] = data[name];
			}
		}
		return body;
	}

	function validateWrite(
		fields: Field[],
		data: RecordInput,
		existingValues: Record<string, FieldValue> | undefined
	): void {
		// Rechazos locales compartidos con memory (§4.3): unsupported/readonly/desconocido.
		const rejects = checkUnwritableFields(fields, data);
		if (Object.keys(rejects).length > 0) throw VegaError.validation(rejects);

		// El resto (required/min/max/pattern/opciones/relation-exists) lo valida el SERVIDOR y
		// llega mapeado por `mapPocketBaseError` (§4.3: "el resto... la hace el backend"). Solo
		// el FileRef ajeno se comprueba aquí: PB no tiene forma de saber qué ref "pertenece" al
		// registro en nuestro sentido (§4.4/§9.9).
		const fieldErrors: Record<string, FieldError> = {};
		for (const name of Object.keys(data)) {
			const field = fields.find((f) => f.name === name)!;
			if (field.type === 'file') {
				const err = validateFileFieldInput(field, existingValues?.[field.name], data[name]);
				if (err) fieldErrors[name] = err;
			}
		}
		if (Object.keys(fieldErrors).length > 0) throw VegaError.validation(fieldErrors);
	}

	const port: BackendPort = {
		capabilities: CAPABILITIES,

		async login(credentials) {
			try {
				await pb
					.collection('_superusers')
					.authWithPassword(credentials.email, credentials.password);
			} catch (err) {
				// Solo el 400 (credenciales rechazadas por PB) se re-etiqueta con mensaje SIEMPRE
				// neutro (§4.1/§5): nunca reutilizar el mensaje de PB, que podría distinguir
				// "usuario no existe" de "password incorrecta". Cualquier OTRO caso (network,
				// 5xx→backend, 404→not-found, forma inesperada→backend…) se propaga tal cual
				// mapeado — un error del SERVIDOR no es lo mismo que "credenciales malas" y
				// colapsarlo a `forbidden` ocultaría una incidencia real de infraestructura.
				if (err instanceof ClientResponseError && err.status === 400) {
					throw VegaError.forbidden('Credenciales no válidas');
				}
				throw mapPocketBaseError(err, { hadSession: false });
			}
			hasSession = true;
			latchedExpired = false;
			savePersistedToken(host, pb.authStore.token);
			const session = sessionFromAuthStore()!;
			notifyAuthChange(session, 'login');
			return session;
		},

		async logout() {
			pb.authStore.clear();
			clearPersistedToken();
			hasSession = false;
			latchedExpired = false;
			notifyAuthChange(null, 'logout');
		},

		currentSession() {
			return sessionFromAuthStore();
		},

		async restoreSession() {
			const token = loadPersistedToken(host);
			if (!token) return null;

			pb.authStore.save(token, null);
			try {
				await pb.collection('_superusers').authRefresh();
			} catch (err) {
				// Un 401 LITERAL de `authRefresh` es la única señal inequívoca, verificada contra
				// PB real (ver cabecera de errors.ts), de "token inválido/caducado": SOLO ese caso
				// limpia la sesión y devuelve null SIN lanzar (§4.1). Cualquier OTRO fallo (sin
				// red, 5xx, forma inesperada, incluso un 403) es un error TRANSITORIO/del backend
				// que NO demuestra que el token sea inválido — no se limpia la sesión persistida
				// (podría seguir siendo válida), se propaga el error mapeado.
				if (err instanceof ClientResponseError && err.status === 401) {
					pb.authStore.clear();
					clearPersistedToken();
					return null;
				}
				throw mapPocketBaseError(err, { hadSession: false });
			}
			hasSession = true;
			latchedExpired = false;
			savePersistedToken(host, pb.authStore.token);
			const session = sessionFromAuthStore()!;
			notifyAuthChange(session, 'restored');
			return session;
		},

		onAuthChange(cb) {
			authSubscribers.add(cb);
			return () => authSubscribers.delete(cb);
		},

		async listContentTypes() {
			return guarded(() => fetchAllContentTypes());
		},

		async list(type, query?: Query) {
			return guarded(async () => {
				const ct = await getContentTypeOrThrow(type);
				validateQuery(ct.fields, query);
				const filter = compileFilter(pb, ct.fields, query?.filter);
				const sort = compileSort(query?.sort);
				const page = query?.page ?? DEFAULT_PAGE;
				const perPage = query?.perPage ?? DEFAULT_PER_PAGE;
				const result = await pb.collection(type).getList(page, perPage, { filter, sort });
				return {
					items: result.items.map((r) =>
						toVegaRecord(type, r as unknown as Record<string, unknown>, ct.fields)
					),
					page: result.page,
					perPage: result.perPage,
					totalItems: result.totalItems,
					totalPages: result.totalPages
				};
			});
		},

		async get(type, id) {
			return guarded(async () => {
				const ct = await getContentTypeOrThrow(type);
				const raw = await pb.collection(type).getOne(id);
				return toVegaRecord(type, raw as unknown as Record<string, unknown>, ct.fields);
			});
		},

		async create(type, data) {
			return guarded(async () => {
				const ct = await getContentTypeOrThrow(type);
				assertContentTypeWritable(ct);
				validateWrite(ct.fields, data, undefined);
				const body = buildWriteBody(ct.fields, data, undefined);
				try {
					const raw = await pb.collection(type).create(body);
					return toVegaRecord(type, raw as unknown as Record<string, unknown>, ct.fields);
				} catch (err) {
					throw mapKnownFieldWriteError(err, ct.fields);
				}
			});
		},

		async update(type, id, data) {
			return guarded(async () => {
				const ct = await getContentTypeOrThrow(type);
				assertContentTypeWritable(ct);
				const existingRaw = await pb.collection(type).getOne(id);
				const existingValues = buildValuesFromRaw(
					ct.fields,
					existingRaw as unknown as Record<string, unknown>
				);
				validateWrite(ct.fields, data, existingValues);
				const body = buildWriteBody(ct.fields, data, existingValues);
				try {
					const raw = await pb.collection(type).update(id, body);
					return toVegaRecord(type, raw as unknown as Record<string, unknown>, ct.fields);
				} catch (err) {
					throw mapKnownFieldWriteError(err, ct.fields);
				}
			});
		},

		async delete(type, id) {
			await guarded(async () => {
				const ct = await getContentTypeOrThrow(type);
				assertContentTypeWritable(ct);
				await pb.collection(type).delete(id);
			});
		},

		fileUrl(record, field, file, opts?: { thumb?: ThumbSpec }) {
			return resolveFileUrl(pb, record, field, file, opts);
		},

		async subscribe(type, cb) {
			return guarded(async () => {
				if (!CAPABILITIES.realtime) throw VegaError.backend('realtime no disponible (ley L8)');
				const ct = await getContentTypeOrThrow(type);
				const unsubscribe = await pb.collection(type).subscribe('*', (e) => {
					cb({
						action: e.action as RecordEvent['action'],
						record: toVegaRecord(type, e.record as unknown as Record<string, unknown>, ct.fields)
					});
				});
				return () => {
					unsubscribe().catch(() => {
						// best-effort: si la desuscripción de red falla, no hay nada más que hacer
						// desde una función síncrona (§4.5 no exige propagar este error).
					});
				};
			});
		},

		async ensureCollections(specs: CollectionSpec[]): Promise<EnsureResult> {
			return guarded(async () => {
				const rejects = checkReservedNames(specs);
				if (Object.keys(rejects).length > 0) throw VegaError.validation(rejects);
				if (!CAPABILITIES.schemaBootstrap) {
					throw VegaError.backend('schemaBootstrap no disponible (ley L8)');
				}
				return ensureCollectionsOnPocketBase(pb, specs);
			});
		}
	};

	return port;
}

/** Host (incluido el puerto) del backend: para no restaurar por error la sesión de otro PB. */
function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/** Tamaño de página para paginar `/api/collections` a mano en `fetchAllContentTypes`. */
const COLLECTIONS_PAGE_SIZE = 200;

/**
 * Comprobación estructural mínima (§9.5) de UNA página cruda de `/api/collections`: una
 * respuesta 2xx con forma inesperada (p.ej. sin `items[]`/`totalPages`, o colecciones sin
 * `fields[]`) es `backend`, con pista de versión incompatible — nunca se deja pasar como si
 * fuera un esquema válido y vacío.
 */
function assertCollectionsPageShape(raw: unknown): {
	items: CollectionModel[];
	totalPages: number;
} {
	const page = raw as { items?: unknown; totalPages?: unknown } | null;
	const isValid =
		page !== null &&
		typeof page === 'object' &&
		Array.isArray(page.items) &&
		typeof page.totalPages === 'number' &&
		page.items.every(
			(c) =>
				c !== null && typeof c === 'object' && Array.isArray((c as { fields?: unknown }).fields)
		);
	if (!isValid) {
		throw VegaError.backend(
			'Respuesta de colecciones con forma inesperada (posible versión de PocketBase incompatible; soportado 0.26.0–0.39.x)'
		);
	}
	return { items: page.items as CollectionModel[], totalPages: page.totalPages as number };
}
