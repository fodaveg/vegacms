/**
 * Adaptador `memory` (§7 del contrato): permite probar el puerto sin fugas de PB, correr la suite
 * de contrato sin red y servir la demo pública. Una factory por instancia compone operaciones de
 * autenticación, registros y esquema. No persiste estado; recargar equivale a reset.
 */

import type { Capabilities } from '../../types';
import type { BackendPort } from '../../port';
import type { MemoryServerSecrets } from './server-settings';
import type { MemorySeed } from './seed';
export type { MemorySeed } from './seed';
import { createMemoryState, type MemoryCollectionSnapshot } from './state';
export type { MemoryCollectionSnapshot } from './state';
import { createAuthOps } from './auth-ops';
import { createRecordOps } from './record-ops';
import { createSchemaOps } from './schema-ops';
import { createServiceOps } from './service-ops';

const CAPABILITIES: Capabilities = {
	realtime: true,
	thumbs: false,
	schemaDiscovery: true,
	filePerRecord: true,
	protectedFiles: false,
	schemaBootstrap: true,
	schemaFieldBootstrap: true,
	strongAuth: false,
	explicitRecordId: true,
	// `#lote-shell`: `false` A PROPÓSITO aunque este adaptador no tenga reglas de acceso propias —
	// así el `access` que declare la semilla en un `ContentType` se respeta tal cual y la UI de
	// permisos es ejercitable en la demo y en los e2e (con `true` quedaría siempre neutralizada).
	// Una semilla que no declara `access` no restringe nada: ausente ⇒ todo permitido.
	accessBypass: false,
	// La sesión de `memory` hace de superuser; el rol editor de la demo/e2e lo apaga desde fuera
	// (`withEditorCapabilities`, `session/backend.ts`).
	administration: true,
	serverSettings: true,
	editorPasswordReset: true
};

/**
 * Extensión concreta, sin capability nueva: expone el estado que `memory` modela para que la
 * suite de contrato pueda medir tipo y reglas sin fingir que ejecuta un motor de permisos.
 */
export interface MemoryBackendPort extends BackendPort {
	inspectCollection(name: string): MemoryCollectionSnapshot | null;
	/** Token de restablecimiento vigente de una cuenta de `vega_editors`: lo que en PocketBase
	 *  llegaría por correo. Solo para tests (una invitación con `MemorySeed.mailEnabled`). */
	inspectEditorResetToken(email: string): Promise<string | null>;
	/** Secretos de los ajustes del servidor (contraseña SMTP, clave secreta del almacén de copias):
	 *  el puerto no los devuelve nunca, igual que PocketBase. Solo para tests. */
	inspectServerSecrets(): Promise<MemoryServerSecrets>;
}

/** Crea un `BackendPort` en memoria. Sin `seed`, acepta `admin@vega.test` + cualquier password no vacía. */
export function createMemoryBackend(seed?: MemorySeed): MemoryBackendPort {
	const state = createMemoryState(seed);
	const auth = createAuthOps(state);
	const { checkSessionAlive } = auth;
	const record = createRecordOps(state, checkSessionAlive, CAPABILITIES);
	const { generateId, getContentTypeOrThrow } = record;
	const schema = createSchemaOps(state, checkSessionAlive, getContentTypeOrThrow, CAPABILITIES);
	const services = createServiceOps(state, checkSessionAlive, generateId);

	const port: MemoryBackendPort = {
		capabilities: CAPABILITIES,
		administration: services.administration,
		serverSettings: services.serverSettings,
		editorPasswordReset: services.editorPasswordReset,
		inspectEditorResetToken: services.inspectEditorResetToken,
		inspectServerSecrets: services.inspectServerSecrets,
		inspectCollection: schema.inspectCollection,
		login: auth.login,
		logout: auth.logout,
		currentSession: auth.currentSession,
		restoreSession: auth.restoreSession,
		onAuthChange: auth.onAuthChange,
		listContentTypes: schema.listContentTypes,
		async scheduledPublishing() {
			return seed?.scheduledPublishing ?? 'inactive';
		},
		list: record.list,
		get: record.get,
		create: record.create,
		update: record.update,
		delete: record.delete,
		fileUrl: record.fileUrl,
		subscribe: record.subscribe,
		ensureCollections: schema.ensureCollections,
		addCollectionFields: schema.addCollectionFields,
		collectionRules: schema.collectionRules,
		addCollectionFieldPatterns: schema.addCollectionFieldPatterns
	};

	return port;
}
