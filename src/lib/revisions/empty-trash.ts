/**
 * `emptyTrash(port)` (`#lote-integridad`, Fase B2, fix de code-review): vacía TODA la papelera
 * (`kind:'delete'` en `vega_revisions`), no solo la primera página. `/papelera` (`+page.svelte`)
 * hacía un único `list({ perPage: MAX_PER_PAGE })` y borraba solo esos 200, pero soltaba "Papelera
 * vaciada" igual aunque quedaran cientos — la misma regla del lote ("no prometer lo que no se
 * cumple") rota por el caso límite de una papelera grande.
 *
 * Pagina en BUCLE: cada vuelta vuelve a pedir la página 1 (los `id` ya borrados desaparecen del
 * listado, así que "página 1" de la siguiente vuelta es SIEMPRE el lote pendiente, nunca repite
 * trabajo) hasta que no queda ninguna entrada `kind:'delete'` — o hasta el primer fallo, que corta
 * el bucle en el acto: no se lanza ningún borrado más (los que ya estaban en vuelo terminan y se
 * cuentan; mismo criterio de "abortar en el primer fallo" que el borrado múltiple de
 * `/media`, nunca reintentos sin techo).
 *
 * Devuelve `deleted`/`remaining`/`failure` en vez de un booleano: el llamante necesita los DOS
 * números para componer un mensaje honesto ("borradas N, quedan M") cuando un fallo corta el
 * bucle a mitad — `failure === null` es la única señal de "de verdad no queda nada".
 *
 * Cada vuelta pide solo los `id` (`fields: []`) y borra con hasta `EMPTY_TRASH_CONCURRENCY`
 * peticiones en vuelo, no una tras otra.
 */
import type { BackendPort } from '$lib/backend/port';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';

interface EmptyTrashResult {
	/** Entradas borradas de verdad (con éxito), sumadas a través de TODAS las páginas. */
	deleted: number;
	/** Entradas `kind:'delete'` que quedan según el último recuento fiable del backend — `0` solo
	 *  si la papelera quedó de verdad vacía. */
	remaining: number;
	/** `null` = ninguna vuelta falló. Si no, el error que cortó el bucle (de `list` o `delete`). */
	failure: unknown;
}

/** Borrados en vuelo a la vez: pequeño y fijo, para no saturar el servidor ni el navegador. */
export const EMPTY_TRASH_CONCURRENCY = 4;

export async function emptyTrash(port: BackendPort): Promise<EmptyTrashResult> {
	let deleted = 0;
	let remaining = 0;
	let failure: unknown = null;
	// Bandera aparte de `failure`: lo lanzado puede ser cualquier valor (incluso `null`), y un fallo
	// nunca puede pasar por «sin fallo».
	let failed = false;
	try {
		for (;;) {
			const batch = await port.list(VEGA_REVISIONS_COLLECTION.name, {
				filter: { kind: 'cond', field: 'kind', op: 'eq', value: 'delete' },
				perPage: MAX_PER_PAGE,
				// Borrar solo necesita el `id`: sin proyección cada vuelta traía 200 snapshots completos.
				fields: []
			});
			remaining = batch.totalItems;
			if (batch.items.length === 0) break;

			// Pool acotado: cada trabajador toma la siguiente entrada y, tras el primer fallo, nadie
			// lanza ninguna más; las que ya estaban en vuelo terminan y se cuentan (éxito o fallo).
			let next = 0;
			const worker = async (): Promise<void> => {
				while (!failed && next < batch.items.length) {
					const item = batch.items[next++]!;
					try {
						await port.delete(VEGA_REVISIONS_COLLECTION.name, item.id);
						deleted++;
						remaining--;
					} catch (err) {
						if (!failed) {
							failed = true;
							failure = err;
						}
					}
				}
			};
			await Promise.all(
				Array.from({ length: Math.min(EMPTY_TRASH_CONCURRENCY, batch.items.length) }, worker)
			);
			if (failed) break;
		}
	} catch (err) {
		failed = true;
		failure = err;
	}
	return { deleted, remaining, failure };
}
