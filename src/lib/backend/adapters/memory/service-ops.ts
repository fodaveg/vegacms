/** Secciones diferidas de administración y ajustes de servidor de `memory`. */

import type { BackendPort } from '../../port';
import {
	deferredAdministration,
	deferredPasswordReset,
	VEGA_EDITORS_COLLECTION_NAME
} from '../../administration';
import { deferredServerSettings } from '../../server-settings';
import type { MemoryAdministration } from './administration';
import type { MemoryServerSecrets, MemoryServerSettings } from './server-settings';
import type { MemoryState } from './state';

export type MemoryServiceOps = Pick<
	BackendPort,
	'administration' | 'editorPasswordReset' | 'serverSettings'
> & {
	inspectEditorResetToken(email: string): Promise<string | null>;
	inspectServerSecrets(): Promise<MemoryServerSecrets>;
};

/** Comparte estado por instancia y mantiene la carga diferida de ambas secciones. */
export function createServiceOps(
	state: MemoryState,
	checkSessionAlive: () => void,
	generateId: () => string
): MemoryServiceOps {
	const { seed, collectionsByName } = state;
	// Diferida como en `pocketbase` (ver `deferredAdministration`): la demo también carga `memory`
	// en el arranque, y estas pantallas no las abre todo el mundo. Las dos secciones (y la lectura
	// de tokens de los tests) comparten UN estado, creado al primer uso.
	let adminState: Promise<MemoryAdministration> | null = null;
	function loadAdminState(): Promise<MemoryAdministration> {
		adminState ??= import('./administration')
			.then((m) =>
				m.createMemoryAdministration({
					checkSessionAlive,
					editorsCollectionExists: () =>
						collectionsByName.get(VEGA_EDITORS_COLLECTION_NAME)?.type === 'auth',
					editorsHaveCreatedField: () =>
						collectionsByName.get(VEGA_EDITORS_COLLECTION_NAME)?.fieldNames.includes('created') ??
						false,
					generateId,
					editors: seed?.editors ?? [],
					backups: seed?.backups ?? [],
					mailEnabled: seed?.mailEnabled ?? false,
					backupDurationMs: seed?.backupDurationMs ?? 0
				})
			)
			.catch((err: unknown) => {
				adminState = null;
				throw err;
			});
		return adminState;
	}
	const administration = deferredAdministration(() =>
		loadAdminState().then((state) => state.administration)
	);
	const editorPasswordReset = deferredPasswordReset(() =>
		loadAdminState().then((state) => state.passwordReset)
	);
	// Diferida igual que `administration`; su estado vive aparte (no depende de editores ni copias).
	let serverSettingsState: Promise<MemoryServerSettings> | null = null;
	function loadServerSettingsState(): Promise<MemoryServerSettings> {
		serverSettingsState ??= import('./server-settings')
			.then((m) => m.createMemoryServerSettings({ checkSessionAlive }))
			.catch((err: unknown) => {
				serverSettingsState = null;
				throw err;
			});
		return serverSettingsState;
	}
	const serverSettings = deferredServerSettings(() =>
		loadServerSettingsState().then((state) => state.serverSettings)
	);

	return {
		administration,
		serverSettings,
		editorPasswordReset,
		async inspectEditorResetToken(email) {
			return (await loadAdminState()).resetTokenFor(email);
		},
		async inspectServerSecrets() {
			return (await loadServerSettingsState()).secrets();
		}
	};
}
