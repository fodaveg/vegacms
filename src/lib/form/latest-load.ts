/**
 * Carga "la última gana" para las rutas de edición (`/c/[type]/[id]` y su `/visual`). Módulo PURO:
 * sin Svelte, sin el puerto — recibe la promesa ya construida.
 *
 * Por qué existe: la autocancelación del SDK de PB está desactivada (contrato P1), así que saltar
 * del registro A al B por el raíl deja DOS `get` en vuelo. Si el de A llega DESPUÉS del de B, la ruta
 * pintaba A bajo la URL de B: se podía ver A y borrar B, y «Guardar igualmente» volcaba A sobre B.
 * Aquí cada carga se numera con un `RequestSequencer` (el mismo del listado, L-P4.10) y la
 * respuesta que ya no es la última emitida se descarta SIN tocar el estado de la ruta.
 */

import type { RequestSequencer } from '$lib/list/list-load';

/** Resultado de `loadLatest`: `stale` ⟹ una carga más reciente la reemplazó; no hay que pintar nada. */
type LatestLoad<T> =
	| { stale: true }
	| { stale: false; ok: true; value: T }
	| { stale: false; ok: false; error: unknown };

/**
 * Ejecuta `run` como la carga MÁS RECIENTE de `sequencer` y espera su desenlace. Si mientras
 * tanto se emitió otra carga con el mismo `sequencer`, devuelve `{ stale: true }` tanto si `run`
 * resolvió como si rechazó (un error de A tampoco debe pintarse sobre B). Nunca rechaza: el error
 * viaja en el resultado para que el llamador lo normalice como ya hacía.
 */
export async function loadLatest<T>(
	sequencer: RequestSequencer,
	run: () => Promise<T>
): Promise<LatestLoad<T>> {
	const seq = sequencer.next();
	try {
		const value = await run();
		return sequencer.isLatest(seq) ? { stale: false, ok: true, value } : { stale: true };
	} catch (error) {
		return sequencer.isLatest(seq) ? { stale: false, ok: false, error } : { stale: true };
	}
}
