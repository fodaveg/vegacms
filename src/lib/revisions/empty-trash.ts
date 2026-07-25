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
 * el bucle en el acto (mismo criterio de "abortar en el primer fallo" que el borrado múltiple de
 * `/media`, nunca reintentos sin techo).
 *
 * Devuelve `deleted`/`remaining`/`failure` en vez de un booleano: el llamante necesita los DOS
 * números para componer un mensaje honesto ("borradas N, quedan M") cuando un fallo corta el
 * bucle a mitad — `failure === null` es la única señal de "de verdad no queda nada".
 */
import type { BackendPort } from '$lib/backend/port';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';

export interface EmptyTrashResult {
	/** Entradas borradas de verdad (con éxito), sumadas a través de TODAS las páginas. */
	deleted: number;
	/** Entradas `kind:'delete'` que quedan según el último recuento fiable del backend — `0` solo
	 *  si la papelera quedó de verdad vacía. */
	remaining: number;
	/** `null` = ninguna vuelta falló. Si no, el error que cortó el bucle (de `list` o `delete`). */
	failure: unknown;
}

export async function emptyTrash(port: BackendPort): Promise<EmptyTrashResult> {
	let deleted = 0;
	let remaining = 0;
	let failure: unknown = null;
	try {
		for (;;) {
			const batch = await port.list(VEGA_REVISIONS_COLLECTION.name, {
				filter: { kind: 'cond', field: 'kind', op: 'eq', value: 'delete' },
				perPage: MAX_PER_PAGE
			});
			remaining = batch.totalItems;
			if (batch.items.length === 0) break;
			for (const item of batch.items) {
				try {
					await port.delete(VEGA_REVISIONS_COLLECTION.name, item.id);
					deleted++;
					remaining--;
				} catch (err) {
					failure = err;
					break;
				}
			}
			if (failure !== null) break;
		}
	} catch (err) {
		failure = err;
	}
	return { deleted, remaining, failure };
}
