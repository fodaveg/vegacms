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
	ThumbSpec,
	VegaRecord
} from './types';
import type { Query } from './query';

export interface BackendPort {
	// ——— Identidad del adaptador ———
	readonly capabilities: Capabilities;

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
}
