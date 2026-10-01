/**
 * Puente entre el plan puro de redirecciones (`$lib/model/redirect-plan`) y el puerto: lee las
 * redirecciones que tocan una ruta y ejecuta las escrituras del plan. Lo usa `RecordForm.svelte`
 * (carga para pintar el banner, y de nuevo justo tras guardar la página para no actuar sobre una
 * foto vieja).
 *
 * Todas las escrituras pasan por `ctx.port`. Se hacen en serie y en el orden de
 * `RedirectOps` (borrar, actualizar, crear): si una falla, las anteriores ya están hechas y el
 * resto no; reintentar recalcula el plan desde el estado real, así que es idempotente.
 */

import type { BackendPort } from '$lib/backend/port';
import type { FilterNode } from '$lib/backend/query';
import type { VegaRecord } from '$lib/backend/types';
import type { ContentModel } from '$lib/model/types';
import type { RedirectOps, RedirectPlanInput, RedirectRef } from '$lib/model/redirect-plan';

/** Nombre de la colección de redirecciones del sitio sembrado. */
export const REDIRECTS_COLLECTION = 'redirects';

/** Cota de páginas leídas (200 por página): una cadena de más de 1000 no se reapunta entera. */
const MAX_PAGES = 5;

/** Si el proyecto tiene `redirects` con los campos `from`/`to`/`code` y qué puede hacer quien edita. */
export function redirectsAvailability(
	model: ContentModel
): Pick<RedirectPlanInput, 'hasRedirects' | 'access'> {
	const type = model.types.find((t) => t.name === REDIRECTS_COLLECTION);
	const names = new Set(type?.schema.fields.map((f) => f.name));
	const usable = type !== undefined && ['from', 'to', 'code'].every((n) => names.has(n));
	return {
		hasRedirects: usable,
		access: usable
			? {
					create: type.permissions.create,
					update: type.permissions.update,
					delete: type.permissions.delete
				}
			: { create: false, update: false, delete: false }
	};
}

function toRef(record: VegaRecord): RedirectRef | null {
	const from = record.values.from;
	const to = record.values.to;
	return typeof from === 'string' && typeof to === 'string' ? { id: record.id, from, to } : null;
}

/** Redirecciones que salen de la ruta vieja o de la nueva, o que llevan a la vieja. */
export async function loadRelevantRedirects(
	port: BackendPort,
	oldPath: string,
	newPath: string
): Promise<RedirectRef[]> {
	const filter: FilterNode = {
		kind: 'group',
		combinator: 'or',
		nodes: [
			{ kind: 'cond', field: 'from', op: 'eq', value: oldPath },
			{ kind: 'cond', field: 'from', op: 'eq', value: newPath },
			{ kind: 'cond', field: 'to', op: 'eq', value: oldPath }
		]
	};
	const found: RedirectRef[] = [];
	for (let page = 1; page <= MAX_PAGES; page += 1) {
		const result = await port.list(REDIRECTS_COLLECTION, { filter, page, perPage: 200 });
		for (const record of result.items) {
			const ref = toRef(record);
			if (ref) found.push(ref);
		}
		if (page >= result.totalPages) break;
	}
	return found;
}

/** Ejecuta las escrituras en serie. Rechaza con el primer error del puerto. */
export async function applyRedirectOps(port: BackendPort, ops: RedirectOps): Promise<void> {
	for (const ref of ops.remove) await port.delete(REDIRECTS_COLLECTION, ref.id);
	for (const { ref, to } of ops.update) await port.update(REDIRECTS_COLLECTION, ref.id, { to });
	if (ops.create) await port.create(REDIRECTS_COLLECTION, ops.create);
}
