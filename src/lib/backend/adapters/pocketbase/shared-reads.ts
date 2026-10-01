/**
 * Lecturas compartidas entre las secciones del adaptador (`administration`, `serverSettings`).
 *
 * `/editores` pide a la vez la lista de cuentas, si hay correo, la plantilla de la invitación y los
 * ajustes del correo, y varias de esas operaciones leen lo mismo (`GET /api/settings`, la colección
 * `vega_editors`). `coalesce` junta las lecturas IDÉNTICAS que coinciden en vuelo en una sola
 * petición. Solo comparte mientras la petición está en marcha: en cuanto termina se olvida, así que
 * nunca sirve un dato viejo (una lectura posterior a una escritura siempre va al servidor).
 *
 * Además evita un fallo mudo del SDK: `pb.send` y `getOne` cancelan por defecto la petición
 * anterior con la misma clave (método + ruta), de modo que dos lecturas simultáneas iguales
 * podían abortarse entre sí.
 */

import type PocketBase from 'pocketbase';

const inFlight = new WeakMap<PocketBase, Map<string, Promise<unknown>>>();

/** Ejecuta `read` salvo que ya haya otra con la misma `key` en vuelo para este cliente. */
export function coalesce<T>(pb: PocketBase, key: string, read: () => Promise<T>): Promise<T> {
	let reads = inFlight.get(pb);
	if (!reads) {
		reads = new Map();
		inFlight.set(pb, reads);
	}
	const pending = reads.get(key);
	if (pending) return pending as Promise<T>;
	const promise = read().finally(() => {
		if (reads.get(key) === promise) reads.delete(key);
	});
	reads.set(key, promise);
	return promise;
}

/** Clave común de `GET /api/settings`: la comparten `mailEnabled`, `ensureInvitationLink` y `serverSettings.get`. */
export const SETTINGS_READ_KEY = 'settings';
