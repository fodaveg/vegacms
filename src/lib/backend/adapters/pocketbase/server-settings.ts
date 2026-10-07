/**
 * `ServerSettingsPort` sobre PocketBase (contrato en la cabecera de `../../server-settings.ts`):
 * `GET`/`PATCH /api/settings` y `POST /api/settings/test/{s3,email}`. Solo se construye con sesión
 * de superuser (`capabilities.serverSettings`).
 *
 * Medido contra PocketBase 0.39.9 (`tests/contract/pocketbase.server-settings.contract.test.ts`):
 * - `GET` no trae los secretos y el `PATCH` fusiona por campo: este módulo manda el parche tal cual
 *   lo construye `buildServerSettingsPatch` y no añade ni quita nada.
 * - Un 400 de validación trae `data.<bloque>.<campo>` ANIDADO (`data.backups.cron`,
 *   `data.backups.s3.endpoint`). `mapPocketBaseError` solo entiende `data.<campo>` plano y
 *   degradaría esto a un error de registro, así que aquí se aplana a rutas punteadas.
 * - Las pruebas (`/test/s3`, `/test/email`) fallan con 400, `data` vacío y el error crudo en
 *   `message`: es un resultado (`ok: false`), no una excepción. Si `data` trae errores de campo
 *   (p. ej. `filesystem` desconocido) sí es una petición mal formada y se deja pasar al mapeo común.
 */

import PocketBase, { ClientResponseError } from 'pocketbase';
import type { ServerSettingsPort } from '../../port';
import type {
	ConnectionTestOutcome,
	ServerS3,
	ServerSettings,
	ServerSettingsPatch
} from '../../server-settings';
import type { FieldError } from '../../errors';
import { VegaError } from '../../errors';
import { DEFAULT_CRON_MAX_KEEP } from '../../server-settings-rules';
import { SETTINGS_READ_KEY, coalesce } from './shared-reads';

interface ServerSettingsOptions {
	pb: PocketBase;
	/** El `guarded()` del adaptador: chequeo de sesión, mapeo de errores y latch de expiración. */
	guarded<T>(op: () => Promise<T>): Promise<T>;
}

/** Crea la sección de ajustes del servidor sobre el cliente ya autenticado del adaptador. */
export function createPocketBaseServerSettings({
	pb,
	guarded
}: ServerSettingsOptions): ServerSettingsPort {
	async function runTest(route: string, body: Record<string, unknown>) {
		try {
			await pb.send(route, { method: 'POST', body });
			return { ok: true } as const;
		} catch (err) {
			const failure = testFailure(err);
			if (failure) return failure;
			throw err;
		}
	}

	return {
		get() {
			return guarded(async () =>
				toServerSettings(
					await coalesce(pb, SETTINGS_READ_KEY, () => pb.send('/api/settings', { method: 'GET' }))
				)
			);
		},

		update(patch: ServerSettingsPatch) {
			return guarded(async () => {
				try {
					return toServerSettings(await pb.send('/api/settings', { method: 'PATCH', body: patch }));
				} catch (err) {
					throw mapSettingsWriteError(err);
				}
			});
		},

		testS3() {
			return guarded(() => runTest('/api/settings/test/s3', { filesystem: 'backups' }));
		},

		testEmail(to, template) {
			return guarded(() => runTest('/api/settings/test/email', { email: to, template }));
		}
	};
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const str = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback;
const bool = (value: unknown): boolean => value === true;

function toS3(raw: unknown): ServerS3 {
	const s3 = record(raw);
	return {
		enabled: bool(s3.enabled),
		endpoint: str(s3.endpoint),
		bucket: str(s3.bucket),
		region: str(s3.region),
		accessKey: str(s3.accessKey),
		forcePathStyle: bool(s3.forcePathStyle)
	};
}

/** Lee la respuesta cruda de `/api/settings` a los tipos del puerto (sin ningún secreto). */
function toServerSettings(raw: unknown): ServerSettings {
	const body = record(raw);
	const smtp = record(body.smtp);
	const backups = record(body.backups);
	if (!('backups' in body) || !('meta' in body)) {
		throw VegaError.backend('Respuesta de ajustes del servidor con forma inesperada.');
	}
	const maxKeep = backups.cronMaxKeep;
	return {
		meta: {
			appURL: str(record(body.meta).appURL),
			senderName: str(record(body.meta).senderName),
			senderAddress: str(record(body.meta).senderAddress)
		},
		smtp: {
			enabled: bool(smtp.enabled),
			host: str(smtp.host),
			port: typeof smtp.port === 'number' ? smtp.port : 0,
			username: str(smtp.username),
			tls: bool(smtp.tls),
			authMethod: typeof smtp.authMethod === 'string' ? smtp.authMethod : undefined,
			localName: typeof smtp.localName === 'string' ? smtp.localName : undefined
		},
		backups: {
			cron: str(backups.cron),
			cronMaxKeep: typeof maxKeep === 'number' ? maxKeep : DEFAULT_CRON_MAX_KEEP,
			s3: toS3(backups.s3)
		}
	};
}

/** Aplana `data.<bloque>.<campo>` anidado a `{ 'bloque.campo': FieldError }`. */
function flattenFieldErrors(
	data: unknown,
	prefix = '',
	out: Record<string, FieldError> = {}
): Record<string, FieldError> {
	for (const [key, value] of Object.entries(record(data))) {
		const path = prefix === '' ? key : `${prefix}.${key}`;
		const entry = record(value);
		if (typeof entry.code === 'string' || typeof entry.message === 'string') {
			out[path] = {
				code: str(entry.code, 'validation_error'),
				message: str(entry.message, 'Valor no válido')
			};
		} else {
			flattenFieldErrors(entry, path, out);
		}
	}
	return out;
}

/** 400 con errores por campo ⇒ `validation` con rutas punteadas; el resto, al mapeo común. */
function mapSettingsWriteError(err: unknown): unknown {
	if (err instanceof ClientResponseError && err.status === 400) {
		const body = record(err.response);
		const fieldErrors = flattenFieldErrors(body.data);
		if (Object.keys(fieldErrors).length > 0) {
			return VegaError.validation(fieldErrors, str(body.message, 'Datos no válidos'));
		}
	}
	return err;
}

/** El fallo de una prueba como resultado, o `null` si no es un fallo de la prueba. */
function testFailure(err: unknown): ConnectionTestOutcome | null {
	if (!(err instanceof ClientResponseError) || err.status !== 400) return null;
	const body = record(err.response);
	if (Object.keys(record(body.data)).length > 0) return null;
	return { ok: false, message: str(body.message, 'El servidor no ha dado ningún detalle.') };
}
