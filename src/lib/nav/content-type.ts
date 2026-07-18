/**
 * Helper PURO de resolución del tipo de contenido de una ruta `/c/[type]*` (§2.4/§6.5 del
 * contrato P3). Fuente ÚNICA para las tres rutas de contenido: así un cambio futuro del criterio
 * de visibilidad no se aplica en dos y se olvida en la tercera (evita la triplicación señalada en
 * la review de 3a).
 */
import type { ContentModel, ResolvedContentType } from '$lib/model/types';

/**
 * Devuelve el `ResolvedContentType` VISIBLE cuyo `name` coincide con el param `[type]` de la
 * ruta, o `null` si no existe o está oculto (⇒ la ruta pinta `not-found`). Un tipo `hidden`
 * —incluidas `vega`/`vega_*`, que P2 fuerza a `hidden` y no es anulable (P2-L7)— NUNCA es
 * navegable: un deep-link a él cae en `not-found`, nunca expone el tipo interno.
 */
export function resolveVisibleContentType(
	model: ContentModel,
	typeParam: string
): ResolvedContentType | null {
	return model.types.find((candidate) => candidate.name === typeParam && !candidate.hidden) ?? null;
}
