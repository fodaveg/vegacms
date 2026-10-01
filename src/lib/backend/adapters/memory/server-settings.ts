/**
 * `ServerSettingsPort` en memoria (demo y tests): los ajustes del servidor sin servidor. Emula lo
 * que se midió contra PocketBase 0.39.9 (ver `pocketbase/server-settings.ts` y el contrato en
 * `../../server-settings.ts`) sin fingir lo que no puede hacer:
 * - Los secretos se guardan aparte, nunca salen por `get()` y se tratan como en PB: omitir los
 *   conserva, `""` los borra. Solo se leen con `MemoryServerSettings.secrets()`, para los tests.
 * - El PATCH es atómico: si algún campo es inválido no se aplica nada. Las reglas imitan las
 *   medidas: `appURL` obligatoria y URL; `cron` vacío o macro o cinco segmentos; `cronMaxKeep` ≥ 1
 *   SOLO si hay `cron` (con `cron` vacío PB acepta 0, medido); con el almacén activado, endpoint,
 *   bucket, región, clave de acceso y clave secreta son obligatorios.
 * - No habla con ningún almacén ni envía correo. `testS3` falla como PB con el almacén desactivado
 *   y, para poder ver el estado de fallo en la demo, también cuando el servidor del almacén es
 *   `unreachable.test` (como un DNS que no resuelve); en cualquier otro caso responde que sí.
 *   `testEmail` falla con el correo desactivado y, si no, responde que sí.
 */

import type { ServerSettingsPort } from '../../port';
import type { FieldError } from '../../errors';
import { PB_VALIDATION_CODES, VegaError } from '../../errors';
import type { ServerSettings, ServerSettingsPatch } from '../../server-settings';
import { DEFAULT_CRON_MAX_KEEP } from '../../server-settings-rules';

interface MemoryServerSettingsOptions {
	/** Exige sesión viva, como el resto de operaciones del adaptador (§7). */
	checkSessionAlive(): void;
}

/** Los dos secretos guardados, solo para los tests (el puerto no los devuelve nunca). */
export interface MemoryServerSecrets {
	smtpPassword: string;
	backupsS3Secret: string;
}

/** La sección y la lectura de secretos sobre el MISMO estado. */
export interface MemoryServerSettings {
	serverSettings: ServerSettingsPort;
	secrets(): MemoryServerSecrets;
}

/** Host del almacén con el que la prueba de `memory` falla, como un DNS que no resuelve. */
export const MEMORY_UNREACHABLE_S3_HOST = 'unreachable.test';

const CRON_MACRO = /^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/;

/** Como el `is.URL` de PB (medido): `https://s3.x.test` y `s3.x.test` valen, `e` no. */
function looksLikeUrl(value: string): boolean {
	return URL.canParse(value) || /^[^\s/:]+\.[^\s/]+/.test(value);
}

function required(): FieldError {
	return { code: PB_VALIDATION_CODES.required, message: 'Cannot be blank.' };
}

/** Crea el estado de ajustes del servidor de `memory`. */
export function createMemoryServerSettings({
	checkSessionAlive
}: MemoryServerSettingsOptions): MemoryServerSettings {
	let settings: ServerSettings = {
		meta: {
			appURL: 'http://localhost:8090',
			senderName: 'Support',
			senderAddress: 'support@example.com'
		},
		smtp: { enabled: false, host: 'smtp.example.com', port: 587, username: '', tls: false },
		backups: {
			cron: '',
			cronMaxKeep: DEFAULT_CRON_MAX_KEEP,
			s3: {
				enabled: false,
				endpoint: '',
				bucket: '',
				region: '',
				accessKey: '',
				forcePathStyle: false
			}
		}
	};
	let secrets: MemoryServerSecrets = { smtpPassword: '', backupsS3Secret: '' };

	function validate(next: ServerSettings, nextSecrets: MemoryServerSecrets): void {
		const errors: Record<string, FieldError> = {};
		const appURL = next.meta.appURL;
		if (appURL === '') errors['meta.appURL'] = required();
		else if (!URL.canParse(appURL)) {
			errors['meta.appURL'] = { code: 'validation_is_url', message: 'Must be a valid url.' };
		}
		if (next.meta.senderAddress === '') errors['meta.senderAddress'] = required();
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.meta.senderAddress)) {
			errors['meta.senderAddress'] = {
				code: 'validation_is_email',
				message: 'Must be a valid email address.'
			};
		}
		if (next.smtp.enabled) {
			if (next.smtp.host === '') errors['smtp.host'] = required();
			if (!(next.smtp.port >= 1 && next.smtp.port <= 65535)) {
				errors['smtp.port'] = {
					code: 'validation_min_number_constraint',
					message: 'Must be between 1 and 65535.'
				};
			}
		}
		const { cron, cronMaxKeep, s3 } = next.backups;
		if (cron !== '' && !CRON_MACRO.test(cron)) {
			const segments = cron.split(/\s+/).length;
			if (segments !== 5) {
				errors['backups.cron'] = {
					code: 'validation_invalid_cron',
					message:
						'Invalid cron expression - must be a valid macro or to have exactly 5 space separated segments.'
				};
			}
		}
		if (cron !== '' && !(cronMaxKeep >= 1)) errors['backups.cronMaxKeep'] = required();
		if (s3.enabled) {
			if (s3.endpoint === '') errors['backups.s3.endpoint'] = required();
			else if (!looksLikeUrl(s3.endpoint)) {
				errors['backups.s3.endpoint'] = {
					code: 'validation_is_url',
					message: 'Must be a valid URL.'
				};
			}
			if (s3.bucket === '') errors['backups.s3.bucket'] = required();
			if (s3.region === '') errors['backups.s3.region'] = required();
			if (s3.accessKey === '') errors['backups.s3.accessKey'] = required();
			if (nextSecrets.backupsS3Secret === '') errors['backups.s3.secret'] = required();
		}
		if (Object.keys(errors).length > 0) {
			throw VegaError.validation(errors, 'An error occurred while saving the new settings.');
		}
	}

	const serverSettings: ServerSettingsPort = {
		async get() {
			checkSessionAlive();
			return structuredClone(settings);
		},

		async update(patch: ServerSettingsPatch) {
			checkSessionAlive();
			const { password, ...smtp } = patch.smtp ?? {};
			const { secret, ...s3 } = patch.backups?.s3 ?? {};
			const next: ServerSettings = {
				meta: { ...settings.meta, ...patch.meta },
				smtp: { ...settings.smtp, ...smtp },
				backups: {
					cron: patch.backups?.cron ?? settings.backups.cron,
					cronMaxKeep: patch.backups?.cronMaxKeep ?? settings.backups.cronMaxKeep,
					s3: { ...settings.backups.s3, ...s3 }
				}
			};
			const nextSecrets: MemoryServerSecrets = {
				smtpPassword: password ?? secrets.smtpPassword,
				backupsS3Secret: secret ?? secrets.backupsS3Secret
			};
			validate(next, nextSecrets);
			settings = next;
			secrets = nextSecrets;
			return structuredClone(settings);
		},

		async testS3() {
			checkSessionAlive();
			const s3 = settings.backups.s3;
			if (!s3.enabled) {
				return {
					ok: false,
					message:
						'Failed to test the S3 filesystem. Raw error: \nS3 storage filesystem is not enabled.'
				};
			}
			const host = URL.canParse(s3.endpoint) ? new URL(s3.endpoint).hostname : s3.endpoint;
			if (host === MEMORY_UNREACHABLE_S3_HOST) {
				return {
					ok: false,
					message: `Failed to test the S3 filesystem. Raw error: \nfailed to upload a test file: dial tcp: lookup ${s3.bucket}.${host}: no such host.`
				};
			}
			return { ok: true };
		},

		async testEmail() {
			checkSessionAlive();
			if (!settings.smtp.enabled) {
				return {
					ok: false,
					message: 'Failed to send the test email. Raw error: \nSMTP is not enabled.'
				};
			}
			if (settings.smtp.host === MEMORY_UNREACHABLE_S3_HOST) {
				return {
					ok: false,
					message: `Failed to send the test email. Raw error: \ndial tcp: lookup ${settings.smtp.host}: no such host.`
				};
			}
			return { ok: true };
		}
	};

	return { serverSettings, secrets: () => ({ ...secrets }) };
}
