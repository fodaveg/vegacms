/**
 * ¿Tiene este servidor la publicación programada (`extensions/vegaschedule`)? Piezas PURAS que
 * comparten el adaptador PocketBase (que lo pregunta) y `model/load.ts` (que lo deja escrito para
 * los editores). Sin red, sin Svelte.
 *
 * Por qué hace falta saberlo: Vega es una SPA y la fecha «Publicar el» solo la cumple un cron del
 * servidor. La imagen de Vega usa el binario oficial de PocketBase, sin extensiones, así que
 * anunciar «Programada» sin comprobarlo sería prometer una publicación que nunca llega.
 *
 * Cómo se sabe:
 * - Superusuario: `GET /api/crons` (PocketBase 0.23+, reservada a superusuarios; medido en 0.39.6:
 *   anónimo 401, registro `auth` normal 403, superusuario 200 con `[{ id, expression }]`). El
 *   binario oficial solo lista sus crons internos (`__pbDBOptimize__`, `__pbMFACleanup__`,
 *   `__pbOTPCleanup__`, `__pbLogsCleanup__`).
 * - Editor: no puede llamar a esa ruta. Lee lo que dejó un superusuario en `vega.schemaSnapshot`,
 *   en `serverFeatures` de la entrada `vega` (ver `ContentType.serverFeatures`).
 */

import type { ContentType, ScheduledPublishingState } from './types';

/** Id del job que registra `extensions/vegaschedule` con su configuración por defecto. */
export const VEGASCHEDULE_JOB_ID = 'vegaschedule';

/** Colección del registro de proyecto (duplicada a propósito, ver `collections.ts#VEGA_COLLECTION`). */
const VEGA_COLLECTION_NAME = 'vega';

/**
 * Estado a partir de la respuesta cruda de `GET /api/crons`. Una forma inesperada es `'unknown'`,
 * nunca `'inactive'`: no se afirma lo que no se ha podido leer.
 */
export function scheduledPublishingFromCrons(raw: unknown): ScheduledPublishingState {
	if (!Array.isArray(raw)) return 'unknown';
	const found = raw.some(
		(job) =>
			job !== null &&
			typeof job === 'object' &&
			(job as { id?: unknown }).id === VEGASCHEDULE_JOB_ID
	);
	return found ? 'active' : 'inactive';
}

/** Estado a partir del esquema servido desde el snapshot (modo editor). */
export function scheduledPublishingFromSnapshot(types: ContentType[]): ScheduledPublishingState {
	const value = types.find((type) => type.name === VEGA_COLLECTION_NAME)?.serverFeatures
		?.scheduledPublishing;
	if (typeof value !== 'boolean') return 'unknown';
	return value ? 'active' : 'inactive';
}

/**
 * Lo que se escribe en `vega.schemaSnapshot`: `types` con `serverFeatures` en la entrada `vega`
 * si el estado se conoce. Con `'unknown'` no se anota nada (y se quita cualquier anotación que
 * `types` trajera): el editor verá «sin confirmar» en vez de un dato viejo presentado como bueno.
 * No muta `types`.
 */
export function withServerFeatures(
	types: ContentType[],
	state: ScheduledPublishingState
): ContentType[] {
	return types.map((type) => {
		if (type.name !== VEGA_COLLECTION_NAME) return type;
		const { serverFeatures: _previous, ...rest } = type;
		void _previous;
		if (state === 'unknown') return rest;
		return { ...rest, serverFeatures: { scheduledPublishing: state === 'active' } };
	});
}
