/**
 * La interfaz `BackendPort` (§3 del contrato): una única interfaz plana, sin sub-objetos ni
 * herencia — lo mínimo que cumple la ley anti-sobre-ingeniería. Cada adaptador (`memory`,
 * `pocketbase`) exporta una factory que devuelve un `BackendPort`; no hay registro dinámico
 * ni plugins.
 */

import type {
	AuthChangeReason,
	Capabilities,
	ContentType,
	FileRef,
	Page,
	RecordEvent,
	RecordId,
	RecordInput,
	Session,
	StrongAuthLoginOutcome,
	StrongAuthStatus,
	ThumbSpec,
	TotpEnrollment,
	VegaRecord
} from './types';
import type { Query } from './query';
import type { CollectionSpec, EnsureResult } from './collections';

/**
 * Extensión opt-in de autenticación fuerte. Vive separada del CRUD para que PocketBase vanilla
 * conserve el contrato mínimo; `capabilities.strongAuth` y esta propiedad aparecen juntas.
 */
export interface StrongAuthPort {
	loginWithPassword(credentials: {
		email: string;
		password: string;
	}): Promise<StrongAuthLoginOutcome>;
	loginWithTotp(pending: string, code: string): Promise<Session>;
	loginWithRecovery(pending: string, code: string): Promise<Session>;
	loginWithPasskey(): Promise<Session>;
	getStatus(): Promise<StrongAuthStatus>;
	enrollTotp(): Promise<TotpEnrollment>;
	verifyTotp(code: string): Promise<void>;
	disableTotp(): Promise<void>;
	generateRecoveryCodes(): Promise<string[]>;
	registerPasskey(name: string): Promise<void>;
	deletePasskey(id: string): Promise<void>;
}

export interface BackendPort {
	// ——— Identidad del adaptador ———
	readonly capabilities: Capabilities;
	/** Presente solo cuando `capabilities.strongAuth === true`. */
	readonly strongAuth?: StrongAuthPort;
	/** Identidad del registro de manifiesto publicada por el backend; ausente = `default`. */
	readonly manifestKey?: string;

	// ——— Auth (§4.1) ———
	login(credentials: { email: string; password: string }): Promise<Session>;
	logout(): Promise<void>;
	/** Síncrono, sin red. `null` si no hay sesión. */
	currentSession(): Session | null;
	/** Desde token persistido; valida contra el backend. */
	restoreSession(): Promise<Session | null>;
	/** Devuelve función de desuscripción. */
	onAuthChange(cb: (s: Session | null, reason: AuthChangeReason) => void): () => void;

	// ——— Esquema (§4.2 / §6) ———
	listContentTypes(): Promise<ContentType[]>;

	// ——— Registros (§4.2, §4.3) ———
	list(type: string, query?: Query): Promise<Page<VegaRecord>>;
	get(type: string, id: RecordId): Promise<VegaRecord>;
	create(type: string, data: RecordInput): Promise<VegaRecord>;
	update(type: string, id: RecordId, data: RecordInput): Promise<VegaRecord>;
	delete(type: string, id: RecordId): Promise<void>;

	// ——— Ficheros (§4.4) ———
	fileUrl(
		record: Pick<VegaRecord, 'type' | 'id'>,
		field: string,
		file: FileRef,
		opts?: { thumb?: ThumbSpec }
	): string;

	// ——— Realtime (§4.5, capability) ———
	subscribe(type: string, cb: (e: RecordEvent) => void): Promise<() => void>;

	// ——— Bootstrap de esquema acotado a vega_* (Anexo A, capability schemaBootstrap) ———
	/**
	 * Crea las colecciones de `specs` que NO existan aún. Idempotente: una segunda llamada con
	 * los mismos `specs` devuelve `created: []` (todo en `skipped`). NUNCA modifica ni borra una
	 * colección existente (ni sus campos). SOLO admite nombres `'vega'` o `vega_*`; cualquier
	 * otro ⇒ `VegaError 'validation'` local, sin tocar red. Sin `capabilities.schemaBootstrap`
	 * ⇒ `VegaError 'backend'` inmediato (L8). Sin permiso de creación de esquema (PB: superuser)
	 * ⇒ `VegaError 'forbidden'`.
	 */
	ensureCollections(specs: CollectionSpec[]): Promise<EnsureResult>;
}
