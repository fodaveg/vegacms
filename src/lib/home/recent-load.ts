/**
 * Resuelve contra el servidor la lista local de «lo último que editaste» (`recent-edits.ts`) para
 * pintar el título, el tipo y el estado ACTUALES de cada registro. Sin Svelte: recibe el puerto y
 * el modelo.
 *
 * Coste: UNA `list` por colección distinta de la lista (filtrando por ids), no un `get` por
 * registro. `fetchRecordsByIds` añade un `get` solo para los ids que esa `list` no devuelve,
 * porque en PocketBase la regla de listar y la de ver pueden diferir y un id ausente del listado
 * no prueba que el registro no exista.
 */

import type { BackendPort } from '$lib/backend/port';
import type { VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { fetchRecordsByIds } from '$lib/form/widgets/relation-search';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import type { RecentEdit, RecentEditRef } from './recent-edits';

/** Una fila de la tabla de la portada: el registro tal como está ahora y cuándo lo guardaste. */
export interface RecentRow {
	type: ResolvedContentType;
	record: VegaRecord;
	savedAt: number;
}

interface RecentRowsResult {
	/** Filas a pintar, el guardado más reciente primero. */
	rows: RecentRow[];
	/** Entradas que hay que quitar de la lista local: el registro ya no existe o esta sesión ya
	 *  no puede verlo (tipo desaparecido u oculto, o sin permiso de listar o de ver). */
	gone: RecentEditRef[];
}

/** Campos que la tabla necesita de `type` (título, estado y fecha de publicación programada). */
function projectionFor(type: ResolvedContentType): string[] {
	return [type.titleField, type.statusField, type.publishAtField ?? null].filter(
		(name): name is string => typeof name === 'string'
	);
}

/** El tipo de `collection` si la portada puede enseñar sus registros a esta sesión. */
function visibleType(model: ContentModel, collection: string): ResolvedContentType | null {
	const type = model.types.find((candidate) => candidate.name === collection);
	if (!type || type.hidden) return null;
	return type.permissions.list && type.permissions.view ? type : null;
}

/**
 * Trae los registros de `edits`. Un registro que ya no existe o que ya no se puede ver no se
 * pinta y va a `gone`. Un registro cuya lectura suelta falla por otro motivo (un `get` que da
 * error de servidor) tampoco se pinta, pero NO va a `gone`: no se sabe si existe.
 *
 * Rechaza si la `list` de alguna colección falla por algo que no sea «no existe» o «prohibido»
 * (red, error del servidor): la portada enseña entonces su caja de error con «Reintentar». Esos
 * dos casos no son un fallo, son la respuesta: la colección ya no está al alcance de la sesión.
 */
export async function loadRecentRows(
	port: Pick<BackendPort, 'list' | 'get'>,
	model: ContentModel,
	edits: readonly RecentEdit[]
): Promise<RecentRowsResult> {
	const rows: RecentRow[] = [];
	const gone: RecentEditRef[] = [];

	const byCollection = new Map<string, RecentEdit[]>();
	for (const edit of edits) {
		const group = byCollection.get(edit.collection);
		if (group) group.push(edit);
		else byCollection.set(edit.collection, [edit]);
	}

	await Promise.all(
		[...byCollection].map(async ([collection, group]) => {
			const type = visibleType(model, collection);
			if (!type) {
				gone.push(...group);
				return;
			}
			let fetched;
			try {
				fetched = await fetchRecordsByIds(
					port,
					collection,
					group.map((edit) => edit.id),
					projectionFor(type)
				);
			} catch (err) {
				if (err instanceof VegaError && (err.kind === 'not-found' || err.kind === 'forbidden')) {
					gone.push(...group);
					return;
				}
				throw err;
			}
			for (const edit of group) {
				const record = fetched.records.get(edit.id);
				if (record) rows.push({ type, record, savedAt: edit.savedAt });
				else if (fetched.notFound.has(edit.id)) gone.push(edit);
			}
		})
	);

	rows.sort((a, b) => b.savedAt - a.savedAt);
	return { rows, gone: gone.map(({ collection, id }) => ({ collection, id })) };
}
