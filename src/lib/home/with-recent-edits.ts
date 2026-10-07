/**
 * Decorador de puerto de «lo último que editaste» (portada, `recent-edits.ts`): el ÚNICO sitio
 * del camino de guardado donde se anota un registro. Todo lo que guarda contenido (el formulario,
 * los bloques, el editor visual, duplicar, restaurar de la papelera, importar) acaba en
 * `port.create`/`port.update`, así que engancharlo aquí cubre todos esos caminos sin tocar
 * ninguno de sus componentes.
 *
 * Se anota DESPUÉS de que la escritura termine bien: una escritura rechazada (validación,
 * conflicto, red) no deja rastro. Un reordenado a mano (`orderOnlyField`) no cuenta como edición,
 * mismo criterio que el historial de versiones.
 *
 * Va por DEBAJO de `withRevisions` (`session/backend.ts`): `resetRevisionsLatch` busca el puerto
 * más externo, y así tampoco se anota nada si la escritura del adaptador falla.
 */

import type { BackendPort } from '$lib/backend/port';
import type { VegaRecord } from '$lib/backend/types';

/** Aviso de un guardado terminado: `userId` es la cuenta de la sesión activa (o `null`). */
type SavedRecordListener = (userId: string | null, collection: string, saved: VegaRecord) => void;

export function withRecentEdits(port: BackendPort, onSaved: SavedRecordListener): BackendPort {
	function notify(collection: string, saved: VegaRecord): void {
		try {
			onSaved(port.currentSession()?.user.id ?? null, collection, saved);
		} catch {
			// El guardado ya ocurrió: un fallo al anotarlo no puede convertirlo en error.
		}
	}

	return {
		...port,
		async create(type, data, opts) {
			// Sin `opts`, la llamada es la de siempre (mismo criterio que `withRevisions`).
			const saved =
				opts === undefined ? await port.create(type, data) : await port.create(type, data, opts);
			notify(type, saved);
			return saved;
		},
		async update(type, id, data, opts) {
			const saved =
				opts === undefined
					? await port.update(type, id, data)
					: await port.update(type, id, data, opts);
			if (opts?.orderOnlyField === undefined) notify(type, saved);
			return saved;
		}
	};
}
