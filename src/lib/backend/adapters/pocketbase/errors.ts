/**
 * Mapeo de errores de PocketBase → `VegaError` (§5 del contrato).
 *
 * Hallazgo de Fase 2 (verificado contra PocketBase 0.39.6 real, no en la documentación): en
 * los endpoints de REGISTROS (list/get/create/update/delete/subscribe), un token de superuser
 * caducado o inválido responde **403** "Only superusers can perform this action" — el MISMO
 * código que un cliente anónimo. El contrato asumía 401 para expiración (§5); PB real no
 * distingue "nunca hubo sesión" de "la hubo y ya no vale" por código HTTP en esos endpoints
 * (sí lo hace `authRefresh`, que **si** da 401 — por eso `restoreSession` funciona tal cual).
 * Como v1 solo modela sesión de superuser (D1), la distinción la hacemos con nuestro propio
 * estado: si creíamos tener sesión, un 401/403 en cualquier operación (salvo `login`) es
 * `auth-expired` (L7); si no, es `forbidden`. `login` tiene su propio mapeo, siempre neutro.
 */

import { ClientResponseError } from 'pocketbase';
import type { FieldError } from '../../errors';
import { VegaError } from '../../errors';

export interface ErrorMapContext {
	/** `true` si, según nuestro propio estado (no el del servidor), creíamos tener sesión activa. */
	hadSession: boolean;
}

interface PbErrorBody {
	message?: string;
	data?: Record<string, { code?: string; message?: string } | undefined>;
}

/** Mapea cualquier error capturado de una llamada al SDK a `VegaError` (ley L2: nunca se deja escapar el crudo). */
export function mapPocketBaseError(err: unknown, ctx: ErrorMapContext): VegaError {
	if (err instanceof VegaError) return err;

	if (!(err instanceof ClientResponseError)) {
		// No debería ocurrir si todas las llamadas al SDK pasan por este mapeo, pero degradar
		// aquí (en vez de dejarlo escapar) es lo que exige L2.
		return VegaError.backend('Error inesperado del adaptador PocketBase', err);
	}

	if (err.isAbort || err.status === 0) {
		// Sin respuesta HTTP: caído/DNS/timeout/offline, o abort (incl. la autocancelación del
		// SDK si se colase pese a estar desactivada — ver README del adaptador).
		return VegaError.network(err);
	}

	const body = err.response as PbErrorBody | undefined;

	if (err.status === 400) {
		const data = body?.data;
		const entries = data ? Object.entries(data).filter(([, fe]) => fe !== undefined) : [];
		if (entries.length > 0) {
			const fieldErrors: Record<string, FieldError> = {};
			for (const [field, fe] of entries) {
				fieldErrors[field] = {
					code: fe?.code ?? 'validation_error',
					message: fe?.message ?? 'Valor no válido'
				};
			}
			return VegaError.validation(fieldErrors, body?.message ?? 'Datos no válidos');
		}
		// 400 sin data por campo = petición malformada = bug del adaptador; que se vea (§5).
		return VegaError.backend(body?.message ?? 'Petición inválida al backend', err);
	}

	if (err.status === 401 || err.status === 403) {
		return ctx.hadSession
			? VegaError.authExpired()
			: VegaError.forbidden(body?.message ?? 'No autorizado');
	}

	if (err.status === 404) {
		return VegaError.notFound(body?.message ?? 'Recurso no encontrado');
	}

	if (err.status >= 500) {
		return VegaError.backend(body?.message ?? 'Error del servidor', err);
	}

	// 2xx con forma inesperada llega aquí solo si el propio SDK lo convierte en error; el resto
	// de la "forma inesperada" (§9.5) se guarda en schema.ts/query.ts con comprobaciones propias.
	return VegaError.backend(
		body?.message ?? `Respuesta inesperada del backend (status ${err.status})`,
		err
	);
}
