/**
 * Quién guardó la versión que choca con la tuya, para la línea «Guardó X a las HH:MM» del aviso de
 * edición concurrente (`form/ConflictNotice.svelte`). Sale de `vega_revisions` si el historial está
 * activo y es legible; si no, `null` y el aviso cae a «Se guardó otra versión a las HH:MM» con el
 * `updated` del servidor (o sin hora, si la colección no tiene `updated`).
 *
 * **Solo se cree a una revisión que ENCADENA con tu versión.** Cada revisión de `update` guarda la
 * PRE-IMAGEN del guardado que la creó y su `author` es quien guardó (`with-revisions.ts`); desde el
 * lote de concurrencia, además, solo existe si ese guardado se hizo. Así que si entre las últimas
 * revisiones del registro hay una cuya pre-imagen tiene TU versión (`recordVersion`), la cadena de
 * guardados desde que abriste el formulario pasó entera por Vega, y la más reciente dice quién y
 * cuándo guardó lo último. Si ninguna encadena —el cambio llegó por el panel de PocketBase, por un
 * script, o con el historial desactivado—, la última revisión podría ser de un guardado anterior
 * (incluso tuyo): se descarta antes que atribuir el cambio a quien no fue.
 */

import type { BackendPort } from '$lib/backend/port';
import type { RecordId } from '$lib/backend/types';
import { recordVersion, type RecordVersion } from '$lib/backend/version';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
import { parseRevisionRecord } from './revision';

/** Cuántas revisiones recientes se miran buscando la que encadena con tu versión. */
const CHAIN_LOOKBACK = 10;

export interface ConflictAuthor {
	/** Correo de quien guardó lo último; `null` si no consta. */
	author: string | null;
	/** Cuándo (el `created` de esa revisión); `null` si no consta. */
	at: Date | null;
}

const UNKNOWN: ConflictAuthor = { author: null, at: null };

/** Nunca rechaza: cualquier fallo (sin historial, sin permiso, red) es "no consta". */
export async function resolveConflictAuthor(
	port: BackendPort,
	collection: string,
	recordId: RecordId,
	openedVersion: RecordVersion
): Promise<ConflictAuthor> {
	try {
		const page = await port.list(VEGA_REVISIONS_COLLECTION.name, {
			filter: {
				kind: 'group',
				combinator: 'and',
				nodes: [
					{ kind: 'cond', field: 'collection', op: 'eq', value: collection },
					{ kind: 'cond', field: 'recordId', op: 'eq', value: recordId },
					{ kind: 'cond', field: 'kind', op: 'eq', value: 'update' }
				]
			},
			sort: [{ field: 'created', dir: 'desc' }],
			perPage: CHAIN_LOOKBACK
		});
		const revisions = page.items
			.map(parseRevisionRecord)
			.filter((r): r is NonNullable<typeof r> => r !== null);
		const chained = revisions.some((r) => recordVersion({ values: r.values }) === openedVersion);
		if (!chained || revisions.length === 0) return UNKNOWN;

		const latest = revisions[0];
		const ms = latest.created === null ? Number.NaN : Date.parse(latest.created);
		return {
			author: latest.author === '' ? null : latest.author,
			at: Number.isNaN(ms) ? null : new Date(ms)
		};
	} catch {
		return UNKNOWN;
	}
}
