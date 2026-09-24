/**
 * Lo que la carga inicial necesita de `AdministrationPort` (`port.ts`): el nombre de la colección
 * de editores y la sección diferida que montan los dos adaptadores. Las reglas que solo usan las
 * implementaciones y las pantallas (orden de las listas, mínimo de contraseña, fechas) viven en
 * `administration-rules.ts`, que va en su chunk diferido.
 */

import type { AdministrationPort, EditorPasswordResetPort } from './port';
import { VegaError } from './errors';

/**
 * La colección `auth` de los editores. Es la única `auth` que Vega gestiona (reapertura acotada de
 * D-P1.1, ver `AdministrationPort`); el sembrado del sitio la crea con este nombre
 * (`site-seeding.ts`) y las reglas que siembra la citan literalmente.
 */
export const VEGA_EDITORS_COLLECTION_NAME = 'vega_editors';

/**
 * Sección `administration` que carga su implementación la primera vez que se usa. Los dos
 * adaptadores viven en la carga inicial de la app (`session/backend.ts` los importa para elegir),
 * y las pantallas que usan esta sección solo las abre un superusuario de vez en cuando: pedir el
 * código al primer uso lo saca de lo que descarga todo el mundo al entrar (medido con
 * `scripts/check-bundle-budget.mjs`). Si el `import()` falla (sin red), rechaza con
 * `VegaError 'network'`, como cualquier otra operación del puerto sin respuesta, y el siguiente
 * uso lo vuelve a intentar.
 */
export function deferredAdministration(
	load: () => Promise<AdministrationPort>
): AdministrationPort {
	const section = deferredSection(load);
	return {
		listEditors: () => section().then((s) => s.listEditors()),
		mailEnabled: () => section().then((s) => s.mailEnabled()),
		createEditor: (email, access) => section().then((s) => s.createEditor(email, access)),
		setEditorPassword: (id, password) => section().then((s) => s.setEditorPassword(id, password)),
		sendEditorInvitation: (id) => section().then((s) => s.sendEditorInvitation(id)),
		removeEditor: (id) => section().then((s) => s.removeEditor(id)),
		listBackups: () => section().then((s) => s.listBackups()),
		createBackup: () => section().then((s) => s.createBackup()),
		backupDownloadUrl: (key) => section().then((s) => s.backupDownloadUrl(key)),
		ensureInvitationLink: (resetUrl) => section().then((s) => s.ensureInvitationLink(resetUrl))
	};
}

/**
 * `EditorPasswordResetPort` diferido, mismo criterio que `deferredAdministration`: la ruta
 * `/restablecer` la abre muy poca gente y su código no debe pesar en el arranque de los demás.
 */
export function deferredPasswordReset(
	load: () => Promise<EditorPasswordResetPort>
): EditorPasswordResetPort {
	const section = deferredSection(load);
	return { confirm: (token, password) => section().then((s) => s.confirm(token, password)) };
}

/** Carga única y reintentable de una sección diferida; un fallo del `import()` es `'network'`. */
function deferredSection<T>(load: () => Promise<T>): () => Promise<T> {
	let loading: Promise<T> | null = null;
	return () => {
		loading ??= load().catch((err: unknown) => {
			loading = null;
			throw err instanceof VegaError
				? err
				: VegaError.network(err, 'No se pudo cargar esta parte de la aplicación');
		});
		return loading;
	};
}
