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
import type {
	AddFieldsResult,
	CollectionFieldSpec,
	CollectionSpec,
	EnsureResult
} from './collections';

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
	/**
	 * Base ABSOLUTA (`https://…/api/vega-build`) del disparador de build/despliegue (lote
	 * "publicación", fase A), ya resuelta contra la URL del backend — ausente/`null` = este
	 * proyecto no tiene publicación conectada (discovery sin `build`, o adaptador sin noción de
	 * proyecto real, p.ej. `memory`) y `PublishButton.svelte` (`shell/`) no pinta nada, mismo
	 * criterio de "capability ausente ⇒ false" que el resto de `Capabilities`. Deliberadamente
	 * FUERA de `Capabilities`: no es una propiedad del ADAPTADOR (`pocketbase` vanilla nunca la
	 * tiene) sino del PROYECTO concreto conectado (§`ProjectDiscovery.build`,
	 * `session/project-discovery.ts`), mismo estatus que `manifestKey` arriba. `backend/
	 * build-client.ts` es el único consumidor que construye peticiones contra esta URL. */
	readonly buildApiUrl?: string | null;

	/**
	 * Base ABSOLUTA (`https://…/api/vega-preview`) del emisor de tokens de preview de borrador
	 * (lote "publicación", fase B), ya resuelta contra la URL del backend — ausente/`null` = este
	 * proyecto no sabe servir contenido sin publicar (discovery sin `preview`) y
	 * `form/RecordForm.svelte` no pinta el botón "Vista previa" ni monta `PreviewPanel.svelte`;
	 * "Ver en el sitio" (`previewUrl` del manifiesto) sigue intacto.
	 *
	 * Gemela EXACTA de `buildApiUrl` de arriba —mismo estatus "opt-in, propiedad del PROYECTO y no
	 * del adaptador", misma resolución en `session/backend.ts`— y por eso vive aquí y no en otra
	 * costura: nació expuesta por `VegaAppContext` porque las dos fases se implementaron en
	 * paralelo con `backend/**` reservado a otro frente, que es una razón de calendario y no de
	 * diseño. Dos capacidades hermanas leídas desde sitios distintos es justo lo que hace que
	 * dentro de dos meses nadie sepa cuál es el patrón bueno. */
	readonly previewApiUrl?: string | null;

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

	// ——— Autoría de esquema (Anexo A ampliado, lote "esquema") ———
	/**
	 * Crea las colecciones de `specs` que NO existan aún. Idempotente: una segunda llamada con
	 * los mismos `specs` devuelve `created: []` (todo en `skipped`). NUNCA modifica ni borra una
	 * colección existente (ni sus campos). Admite cualquier nombre de colección "creable"
	 * (`isCreatableCollectionName`, `backend/collections.ts`) — ya NO se restringe a
	 * `vega`/`vega_*` (esa restricción vivía en el antiguo Anexo A, cuando Vega solo gestionaba
	 * su propio namespace interno; ver cabecera de `collections.ts` para la historia completa).
	 * Un nombre no creable ⇒ `VegaError 'validation'` local, sin tocar red. Sin
	 * `capabilities.schemaBootstrap` ⇒ `VegaError 'backend'` inmediato (L8). Sin permiso de
	 * creación de esquema (PB: superuser) ⇒ `VegaError 'forbidden'`.
	 */
	ensureCollections(specs: CollectionSpec[]): Promise<EnsureResult>;

	/**
	 * Añade a `collectionName` (que DEBE existir ya) los campos de `fields` cuyo `name` NO
	 * exista todavía en esa colección. Estrictamente ADITIVO: NUNCA modifica un campo existente
	 * (ni su tipo ni sus reglas) ni lo borra, y NUNCA renombra la colección. Idempotente en el
	 * mismo sentido que `ensureCollections`: un campo cuyo `name` ya existe se omite tal cual
	 * está (va a `skipped`), nunca se reconcilia. `collectionName` inexistente ⇒ `VegaError
	 * 'not-found'`. Sin `capabilities.schemaFieldBootstrap` ⇒ `VegaError 'backend'` inmediato
	 * (L8) — capability PROPIA, independiente de `schemaBootstrap` (crear colecciones): un
	 * adaptador podría en teoría dar una sin la otra, aunque v1 las da siempre juntas. Sin
	 * permiso (PB: superuser) ⇒ `VegaError 'forbidden'`.
	 */
	addCollectionFields(
		collectionName: string,
		fields: CollectionFieldSpec[]
	): Promise<AddFieldsResult>;
}
