/**
 * Texto que la interfaz pinta para un `VegaError`. El adaptador no tiene catálogo de idiomas: da
 * el `backendCode` de las causas conocidas de un `'backend'` y el texto vive en `errors.backendCode.*`.
 * Un error sin código (o con uno que aquí no se conoce) sigue pintando su `message`.
 */

import type { BackendErrorCode, VegaError } from '$lib/backend';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const MESSAGE_KEYS: Record<BackendErrorCode, string> = {
	'record-in-use': 'errors.backendCode.recordInUse',
	'bad-request': 'errors.backendCode.badRequest',
	'server-error': 'errors.backendCode.serverError'
};

/** Mensaje traducido de `err` si trae un `backendCode` conocido; si no, su `message` tal cual. */
export function vegaErrorMessage(err: VegaError, t: Translate): string {
	const key = err.backendCode ? MESSAGE_KEYS[err.backendCode] : undefined;
	return key ? t(key) : err.message;
}
