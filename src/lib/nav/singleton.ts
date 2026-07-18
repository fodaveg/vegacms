/**
 * Resolutor PURO de la regla runtime de singleton (P2 §4.6, contrato P3 §3.3): decide a dónde
 * navega un `NavItem` marcado `singleton: true`. Sin red — recibe `totalItems`/`firstId` YA
 * consultados por la Fase 2 (`port.list(type, { perPage: 1 })`); este módulo solo interpreta el
 * resultado y compone la URL con `nav/routes.ts`.
 */

import type { RecordId } from '$lib/backend';
import { newRoute, recordRoute } from './routes';

/**
 * Destino resuelto de un singleton:
 * - `0` registros → `kind: 'new'` (crear).
 * - `1` registro → `kind: 'edit'` sobre ese id.
 * - `>1` registros → `kind: 'edit'` sobre el PRIMERO + `warnManyRecords: true` (P3 pinta el
 *   aviso "marcada como Ajustes pero tiene N registros", §3.3).
 */
export type SingletonTarget =
	| { kind: 'new'; url: string; warnManyRecords: false }
	| { kind: 'edit'; url: string; warnManyRecords: boolean };

/**
 * `totalItems`/`firstId` ya consultados (§3.3). Contrato de llamada: `totalItems` es el
 * `page.totalItems` de `list(type, { perPage: 1 })`, nunca negativo; si `totalItems > 0`,
 * `firstId` DEBE venir informado (es el id del primer registro de esa misma consulta). Ambas
 * violaciones son errores de programación de la Fase 2 (no fallos de transporte), así que se
 * lanza un `Error` local (no un `VegaError`) en vez de enmascarar el caso o fingir un destino.
 */
export function resolveSingletonTarget(
	type: string,
	totalItems: number,
	firstId?: RecordId
): SingletonTarget {
	if (totalItems < 0) {
		throw new Error(`resolveSingletonTarget: totalItems=${totalItems} negativo para "${type}"`);
	}
	if (totalItems === 0) {
		return { kind: 'new', url: newRoute(type), warnManyRecords: false };
	}
	if (!firstId) {
		throw new Error(
			`resolveSingletonTarget: totalItems=${totalItems} pero falta firstId para "${type}"`
		);
	}
	return { kind: 'edit', url: recordRoute(type, firstId), warnManyRecords: totalItems > 1 };
}
