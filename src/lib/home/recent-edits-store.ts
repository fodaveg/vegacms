/**
 * Almacenamiento de «lo último que editaste» (`recent-edits.ts`) en `localStorage`, y el único
 * punto donde se anota un guardado: `noteSavedRecord`, al que llama el decorador de puerto
 * `withRecentEdits` cuando un `create`/`update` termina bien.
 *
 * `localStorage` puede no existir, venir lleno o lanzar (modo privado, cuota, permisos): todo va
 * en `try/catch` y un fallo se traga. La lista es una comodidad; ni un guardado ni la portada
 * pueden depender de ella.
 *
 * **Qué tipos cuentan** lo dice el modelo, que este módulo no puede cargar por su cuenta: el
 * layout se lo entrega con `setRecentEditsTypes` cuando lo resuelve y lo retira al cerrar sesión.
 * Sin modelo entregado no se anota nada (antes de eso tampoco hay formulario que guarde).
 */

import type { VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { readBackendOverride } from '$lib/session/backend-override';
import {
	addRecentEdit,
	parseRecentEdits,
	recentEditTarget,
	recentEditsStorageKey,
	removeRecentEdits,
	serializeRecentEdits,
	type RecentEdit,
	type RecentEditRef
} from './recent-edits';

/** Lo mínimo de `Storage` que se usa; los tests pasan uno de mentira (o uno que lanza). */
export type RecentEditsStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): RecentEditsStorage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** Clave de la lista de `userId` en este navegador (ver `recentEditsStorageKey`). */
function keyFor(userId: string): string {
	return recentEditsStorageKey(readBackendOverride() ?? '', userId);
}

/** La lista guardada de `userId`, la más reciente primero. `[]` si no hay o no se puede leer. */
export function readRecentEdits(
	userId: string,
	storage: RecentEditsStorage | null = browserStorage()
): RecentEdit[] {
	if (!storage) return [];
	try {
		return parseRecentEdits(storage.getItem(keyFor(userId)));
	} catch {
		return [];
	}
}

function writeRecentEdits(
	userId: string,
	list: readonly RecentEdit[],
	storage: RecentEditsStorage | null
): void {
	if (!storage) return;
	try {
		storage.setItem(keyFor(userId), serializeRecentEdits(list));
	} catch {
		// Sin sitio o sin permiso: la lista se queda como estaba.
	}
}

/** Anota en la lista de `userId` que `ref` se acaba de guardar (`now`, epoch ms). */
export function noteRecentEdit(
	userId: string,
	ref: RecentEditRef,
	now: number = Date.now(),
	storage: RecentEditsStorage | null = browserStorage()
): void {
	const next = addRecentEdit(readRecentEdits(userId, storage), { ...ref, savedAt: now });
	writeRecentEdits(userId, next, storage);
}

/** Quita de la lista de `userId` los registros que ya no existen o ya no se pueden ver. */
export function forgetRecentEdits(
	userId: string,
	gone: readonly RecentEditRef[],
	storage: RecentEditsStorage | null = browserStorage()
): void {
	if (gone.length === 0) return;
	const current = readRecentEdits(userId, storage);
	const next = removeRecentEdits(current, gone);
	if (next.length !== current.length) writeRecentEdits(userId, next, storage);
}

let trackedTypes: readonly ResolvedContentType[] | null = null;

/** El layout entrega aquí los tipos del modelo resuelto (o `null` al cerrar sesión). */
export function setRecentEditsTypes(types: readonly ResolvedContentType[] | null): void {
	trackedTypes = types;
}

/**
 * Un `create`/`update` de `collection` ha terminado bien para la cuenta `userId`: si corresponde a
 * algo que se enseña en la portada (`recentEditTarget`), sube al principio de su lista. Nunca
 * lanza: un guardado que ya ocurrió no puede fallar por esto.
 */
export function noteSavedRecord(
	userId: string | null,
	collection: string,
	saved: VegaRecord,
	now: number = Date.now(),
	storage: RecentEditsStorage | null = browserStorage()
): void {
	if (userId === null || trackedTypes === null) return;
	try {
		const target = recentEditTarget(trackedTypes, collection, saved);
		if (target) noteRecentEdit(userId, target, now, storage);
	} catch {
		// Ver cabecera: la lista es una comodidad.
	}
}
