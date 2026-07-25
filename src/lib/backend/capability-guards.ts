/**
 * Guardarraíles de `capabilities` (ley L8 del contrato: capability ausente ⇒ `VegaError
 * 'backend'` inmediato, ANTES de tocar red). Vive aquí, compartido, por el mismo motivo que
 * `write-guards.ts`: `memory` y `pocketbase` deben rechazar EXACTAMENTE igual, y eso solo se
 * garantiza por construcción si los dos llaman a la MISMA función en vez de reimplementar el
 * `if` cada uno por su lado — el `git blame` de este fichero es la prueba de que no divergen.
 */

import type { Capabilities } from './types';
import { VegaError } from './errors';

/**
 * `create(type, data, { id })` con `id` explícito (§8·B2, la papelera restaurando con el id
 * original) exige `capabilities.explicitRecordId`. `hasExplicitId` es `opts?.id !== undefined`
 * en el llamante — este guard no conoce `RecordId`, solo si el llamante PIDIÓ uno explícito.
 * Sin `id` explícito, nunca rechaza: es el `create` de siempre, bit a bit idéntico.
 *
 * En v1 los dos adaptadores fijan `explicitRecordId: true` incondicionalmente, así que ningún
 * adaptador real ejercita la rama que rechaza — cubierta por `capability-guards.test.ts` con
 * unas `capabilities` fabricadas a mano (`explicitRecordId: false`), no por el contrato contra
 * un backend real.
 */
export function assertExplicitRecordIdCapability(
	capabilities: Pick<Capabilities, 'explicitRecordId'>,
	hasExplicitId: boolean
): void {
	if (hasExplicitId && !capabilities.explicitRecordId) {
		throw VegaError.backend('explicitRecordId no disponible (ley L8)');
	}
}
