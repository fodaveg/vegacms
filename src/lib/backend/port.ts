/**
 * La interfaz `BackendPort` (§3 del contrato): una única interfaz plana, sin sub-objetos ni
 * herencia — lo mínimo que cumple la ley anti-sobre-ingeniería. Cada adaptador (`memory`,
 * `pocketbase`) exporta una factory que devuelve un `BackendPort`; no hay registro dinámico
 * ni plugins.
 */

import type {
	AuthChangeReason,
	BackupCreateOutcome,
	BackupFile,
	Capabilities,
	ContentType,
	EditorAccount,
	EditorDirectory,
	FileRef,
	InvitationLinkState,
	NewEditorAccess,
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

/**
 * Administración del servidor (pantallas `/editores` y `/copias`), separada del CRUD por el mismo
 * motivo que `StrongAuthPort`: `capabilities.administration` y esta propiedad aparecen juntas, y
 * un puerto sin ella conserva el contrato mínimo.
 *
 * Reapertura ACOTADA de D-P1.1: el puerto sigue sin exponer colecciones `auth` como tipos de
 * contenido; esta sección gestiona SOLO la colección de editores (`vega_editors`) y siempre como
 * cuentas, nunca como registros genéricos. Toda promesa rechaza con `VegaError` (L2).
 */
export interface AdministrationPort {
	/** Cuentas de `vega_editors`, del alta más antigua a la más reciente (y por email si no hay
	 *  fecha). Sin la colección ⇒ `VegaError 'not-found'`. */
	listEditors(): Promise<EditorDirectory>;
	/** `true` si el servidor tiene correo saliente configurado (PB: `GET /api/settings` →
	 *  `smtp.enabled`). Decide si la UI ofrece invitar por correo. */
	mailEnabled(): Promise<boolean>;
	/**
	 * Crea una cuenta de editor. Con `{ kind: 'password' }` nace activa (`verified: true`). Con
	 * `{ kind: 'invite' }` nace pendiente, con una contraseña aleatoria que nadie conoce, y se pide
	 * al servidor el correo de restablecimiento para que la persona elija la suya. Email repetido o
	 * no válido, o contraseña demasiado corta ⇒ `VegaError 'validation'` con `fieldErrors.email` o
	 * `fieldErrors.password`.
	 */
	createEditor(email: string, access: NewEditorAccess): Promise<EditorAccount>;
	/** Pone una contraseña nueva a una cuenta y la da por activa (`verified: true`). PB cierra las
	 *  sesiones abiertas de esa cuenta (medido: su token deja de refrescar). */
	setEditorPassword(id: string, password: string): Promise<void>;
	/** Vuelve a pedir el correo de restablecimiento de una cuenta. PB responde con éxito aunque el
	 *  correo no salga (lo envía en segundo plano, medido con un SMTP inalcanzable): el puerto no
	 *  puede confirmar la entrega. */
	sendEditorInvitation(id: string): Promise<void>;
	/** Borra la cuenta: la persona deja de poder entrar. Id inexistente ⇒ `VegaError 'not-found'`. */
	removeEditor(id: string): Promise<void>;
	/** Copias guardadas en el servidor, la más reciente primero. */
	listBackups(): Promise<BackupFile[]>;
	/** Crea una copia completa y espera a que termine (puede tardar minutos). PB nombra la copia
	 *  con resolución de segundos: una segunda copia en el mismo segundo sustituye a la primera. */
	createBackup(): Promise<BackupCreateOutcome>;
	/** URL de descarga de una copia, ya autorizada para unos minutos (PB: token de fichero de
	 *  superuser). Se pide justo antes de abrirla, nunca se guarda. */
	backupDownloadUrl(key: string): Promise<string>;
	/**
	 * Hace que el enlace del correo de invitación (plantilla de restablecimiento de contraseña de
	 * `vega_editors`) lleve a `resetUrl`, la ruta pública de Vega que confirma el token
	 * (`/restablecer`), y no al Admin de PocketBase (`/_/`), que un despliegue puede no servir.
	 * Solo escribe si la plantilla sigue siendo la de fábrica: una personalizada no se pisa.
	 * `resetUrl` es absoluta y sin query; el token se añade como `?token=`.
	 */
	ensureInvitationLink(resetUrl: string): Promise<InvitationLinkState>;
}

/**
 * Restablecimiento de contraseña de una cuenta de `vega_editors` con el token del correo. Pública:
 * no exige sesión (quien la usa todavía no puede entrar). `capabilities.editorPasswordReset` y esta
 * propiedad aparecen juntas.
 */
export interface EditorPasswordResetPort {
	/**
	 * Pone la contraseña nueva y da la cuenta por verificada (PB 0.39.6, medido). Token inválido,
	 * caducado o ya usado ⇒ `VegaError 'validation'` con `fieldErrors.token`; contraseña rechazada
	 * ⇒ `fieldErrors.password`.
	 */
	confirm(token: string, password: string): Promise<void>;
}

export interface BackendPort {
	// ——— Identidad del adaptador ———
	readonly capabilities: Capabilities;
	/** Presente solo cuando `capabilities.strongAuth === true`. */
	readonly strongAuth?: StrongAuthPort;
	/** Presente solo cuando `capabilities.administration === true`. */
	readonly administration?: AdministrationPort;
	/** Presente solo cuando `capabilities.editorPasswordReset === true`. */
	readonly editorPasswordReset?: EditorPasswordResetPort;
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
	/**
	 * Gemela de `previewApiUrl` de arriba: sale del MISMO discovery (`ProjectDiscovery.preview.
	 * visualEditing`, `session/project-discovery.ts`), resuelta en el mismo sitio
	 * (`session/backend.ts`). Pero, a diferencia de `previewApiUrl`/`buildApiUrl` (que SÍ bastan
	 * por sí solos para pintar un botón), **esto es solo una promesa, nunca la prueba**: el
	 * discovery lo escribe el proyecto y puede sobrevivir perfectamente al código que decía
	 * describir — un sitio que anuncia el puente después de haberlo quitado dejaría a Vega
	 * esperando un `ready` que no va a llegar. La capacidad de verdad la habilita el SALUDO del
	 * puente contra el iframe (§"Visual editing bridge" del contrato,
	 * `$lib/visual/bridge-client.ts`), no este booleano: la pantalla del editor visual lo usa
	 * solo para decidir si tiene sentido INTENTAR el saludo, nunca para dar la capacidad por
	 * demostrada.
	 */
	readonly previewVisualEditing?: boolean;
	/**
	 * Vocabulario de renderers anunciado por el sitio en discovery. `null`/ausente = proyecto
	 * legacy, sin contraste; `[]` = el sitio declara que no sabe pintar ningún tipo.
	 */
	readonly renderedBlockTypes?: readonly string[] | null;

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
	/**
	 * Crea un registro. `opts.id` es una enmienda ADITIVA (`#lote-integridad` Fase B §8·B2): sin
	 * él, el comportamiento es BIT A BIT idéntico al de siempre (id generado por el backend) — no
	 * hay que tocar ningún llamador existente. Con él, el nuevo registro nace con ESE id en vez de
	 * uno generado: la única forma de que "restaurar un borrado" (la papelera) no rompa en
	 * silencio las relaciones que apuntaban al registro original (§8·B2 del contrato de Fase B).
	 * Requiere `capabilities.explicitRecordId` ⇒ sin ella, `VegaError 'backend'` inmediato (L8),
	 * mismo criterio que `schemaBootstrap`/`schemaFieldBootstrap`. Si `opts.id` ya pertenece a un
	 * registro VIVO de `type`, la creación falla (`VegaError 'validation'`) — este método NUNCA
	 * pisa un registro existente, ni con ni sin `opts.id`. **Medido contra PocketBase 0.39.6
	 * real** (no supuesto): `create` acepta un `id` explícito; el campo `id` por defecto exige
	 * EXACTAMENTE 15 caracteres (un id inventado a mano casi nunca cabe — solo un id que el propio
	 * backend generó antes siempre vale), y se puede reusar el id de un registro que se acaba de
	 * borrar.
	 */
	create(type: string, data: RecordInput, opts?: { id?: RecordId }): Promise<VegaRecord>;
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
	 * colección existente (ni su tipo, reglas, campos o registros). Si el nombre existe con otro
	 * tipo, falla explícitamente en vez de mutarlo o fingir idempotencia. Al crear, `CollectionSpec`
	 * puede declarar `base`/`auth` y sus reglas; las claves omitidas conservan los defaults del
	 * backend. Admite cualquier nombre de colección "creable" (`isCreatableCollectionName`,
	 * `backend/collections.ts`) — ya NO se restringe a `vega`/`vega_*` (esa restricción vivía en
	 * el antiguo Anexo A, cuando Vega solo gestionaba su propio namespace interno; ver cabecera de
	 * `collections.ts` para la historia completa). Un nombre no creable ⇒ `VegaError 'validation'`
	 * local, sin tocar red. Sin
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
