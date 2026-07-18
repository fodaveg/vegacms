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
	/**
	 * Nombres de `Field.name` válidos para el `ContentType` de la operación en curso (solo
	 * create/update lo conocen; el resto de operaciones no lo necesitan). Sin esto, una clave de
	 * `data` que Vega no reconoce se atribuiría tal cual (comportamiento previo a la corrección
	 * de §5 "campos anidados"); con esto, se puede degradar a nivel de registro (`''`).
	 */
	knownFields?: string[];
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
			const known = ctx.knownFields ? new Set(ctx.knownFields) : null;
			const fieldErrors: Record<string, FieldError> = {};
			for (const [field, fe] of entries) {
				// Una clave de `data` cuenta como error de CAMPO solo si (a) es un `Field.name`
				// Vega conocido —cuando lo sabemos— y (b) su valor tiene la forma plana
				// `{code?, message?}`. PB puede devolver, para el mismo campo, un mapa anidado
				// POR ÍNDICE (p.ej. `{ "0": { code, message } }`, violaciones por ítem en un
				// array) que NO es un `FieldError` plano; y en teoría puede llegar una clave que
				// no corresponda a ningún campo Vega. Ninguno de los dos casos es seguro de
				// atribuir "tal cual" (induciría a P5 a pintar el error bajo un campo que no
				// existe en el formulario): van a nivel de REGISTRO, clave `''` (§5).
				if ((known === null || known.has(field)) && isDirectFieldError(fe)) {
					fieldErrors[field] = {
						code: fe.code ?? 'validation_error',
						message: fe.message ?? 'Valor no válido'
					};
				} else {
					appendRecordLevelError(fieldErrors, field, fe);
				}
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

/**
 * `true` si `fe` es la forma de un `FieldError` de PB de verdad: un `code` y/o `message` STRING
 * en el nivel superior (PB añade a veces más claves, p.ej. `params`, que no invalidan la forma —
 * ver `errors.test.ts`, verificado contra PB real). `false` si es un mapa anidado (p.ej. claves
 * numéricas `"0"`, `"1"`… para errores por ítem dentro de un array, sin `code`/`message` propios
 * al nivel superior) o cualquier otra cosa que no sea directamente un error de campo.
 */
function isDirectFieldError(fe: unknown): fe is { code?: string; message?: string } {
	if (fe === null || typeof fe !== 'object') return false;
	const obj = fe as Record<string, unknown>;
	return typeof obj.message === 'string' || typeof obj.code === 'string';
}

/**
 * Acumula un error de `data` que NO se pudo atribuir a un campo Vega conocido bajo la clave de
 * REGISTRO (`''`, §5). Si ya hay un error de registro previo (varias claves colapsan a la vez),
 * concatena los mensajes en vez de descartar información.
 */
function appendRecordLevelError(
	fieldErrors: Record<string, FieldError>,
	sourceField: string,
	fe: unknown
): void {
	const raw = fe as { code?: string; message?: string } | null | undefined;
	const detail = raw?.message ?? `Valor no válido en "${sourceField}"`;
	const prior = fieldErrors[''];
	fieldErrors[''] = prior
		? { code: prior.code, message: `${prior.message}; ${detail}` }
		: { code: raw?.code ?? 'validation_error', message: detail };
}
