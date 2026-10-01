/**
 * `isTrashAvailable(model)` (`#lote-integridad`, Fase B §4/§10.3): la señal SÍNCRONA y PURA que
 * consultan los 4 diálogos de borrado (`DeleteConfirm`/`MediaDeleteConfirm`) ANTES de prometer
 * "recuperable" — §4 del contrato: "el diálogo de borrado consulta ANTES si la papelera está
 * disponible… prometer papelera y no tenerla es peor que no tenerla".
 *
 * Dos condiciones, las MISMAS que decide `shouldSnapshot`/`snapshotBeforeDelete` en
 * `with-revisions.ts` (para que la UI nunca prometa algo que el decorador no va a cumplir):
 * 1. `revisions.enabled` en el manifiesto (default `true`, `ResolvedRevisionsConfig`).
 * 2. `vega_revisions` YA existe como colección — comprobable SIN red porque `ContentModel.types`
 *    (P2) trae TODOS los tipos que P1 descubrió, incluidos los ocultos (`vega_revisions` es
 *    reservada, `hidden: true`, pero sigue en la lista si el backend la tiene creada; si no está
 *    bootstrapeada todavía, sencillamente no aparece — P1 solo lista lo que existe de verdad).
 *
 * Deliberadamente SÍNCRONO (a diferencia de `RevisionsPanel`, que sí hace un `list()` real para
 * pintar el historial): un diálogo de confirmación no puede permitirse un parpadeo de "cargando"
 * antes de decidir su copy, y `ctx.model` ya tiene esta respuesta sin tocar la red.
 */

import type { Field } from '$lib/backend/types';
import { requiredFileFieldName } from './restore';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';

/** Forma MÍNIMA que necesita esta función de `ContentModel` (P2) — estructural a propósito, para
 *  que un test pueda pasar un objeto plano sin construir un `ContentModel` completo, y para que
 *  `ctx.model` (que sí lo es) siga encajando sin ningún cast. */
export interface TrashAvailabilityModel {
	revisions: { enabled: boolean };
	/** `schema` es opcional a propósito: solo lo necesita `isDeleteRecoverable` (los campos de la
	 *  colección), y `ResolvedContentType` ya lo trae. */
	types: readonly { name: string; schema?: { fields: readonly Field[] } }[];
}

export function isTrashAvailable(model: TrashAvailabilityModel): boolean {
	if (!model.revisions.enabled) return false;
	return model.types.some((type) => type.name === VEGA_REVISIONS_COLLECTION.name);
}

/**
 * `true` si borrar un registro de `collection` se puede PROMETER como recuperable: la papelera
 * está disponible (`isTrashAvailable`) Y la colección no tiene un campo `file` obligatorio
 * (`requiredFileFieldName`). PB destruye el binario al borrar y la papelera no lo restaura (§0.3),
 * así que con un `file` `required` el registro nunca se puede recrear completo y "Restaurar" queda
 * bloqueado (ver `/papelera`): prometer "podrás recuperarla" ahí sería mentir. Una colección que no
 * aparece en `model.types` no aporta esquema y cuenta como sin fichero obligatorio.
 */
export function isDeleteRecoverable(model: TrashAvailabilityModel, collection: string): boolean {
	if (!isTrashAvailable(model)) return false;
	const fields = model.types.find((type) => type.name === collection)?.schema?.fields;
	return !fields || requiredFileFieldName(fields) === null;
}
