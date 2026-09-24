/**
 * `AdministrationPort` sobre PocketBase (ver su cabecera en `port.ts`): cuentas de `vega_editors`
 * y copias de seguridad. Solo se construye con sesión de superuser (`capabilities.administration`):
 * PocketBase reserva `/api/settings`, `/api/backups` y `/api/files/token` para gestionar copias a
 * superusers (medido contra 0.39.6: un editor recibe 403 en las dos primeras).
 *
 * Comportamiento de PocketBase 0.39.6 medido para este módulo (no supuesto):
 * - Una colección `auth` creada por API sin campos propios NO trae `created`/`updated`: el alta
 *   llega como `null` (`EditorAccount.created`). Las creadas desde el Admin de PB sí los traen.
 * - `request-password-reset` responde 204 aunque el SMTP no acepte la conexión: el correo sale en
 *   segundo plano, así que la invitación nunca puede confirmar la entrega.
 * - `confirm-password-reset` marca `verified: true` en la cuenta (con un SMTP de prueba).
 * - La plantilla `resetPasswordTemplate` de una `auth` nueva enlaza una vez a
 *   `{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}` (el Admin de PB) y es idéntica a la de
 *   `GET /api/collections/meta/scaffolds`; `{APP_URL}` es `settings.meta.appURL`. Se puede
 *   reescribir con un `PATCH` de la colección (`ensureInvitationLink`).
 * - Cambiar la contraseña de una cuenta invalida su token: `auth-refresh` responde 401 después.
 * - `POST /api/backups` con otra copia en marcha responde 400 sin errores por campo y el mensaje
 *   "Try again later - another backup/restore process has already been started.".
 * - El nombre generado (`pb_backup_<app>_<AAAAMMDDhhmmss>.zip`) tiene resolución de segundos: dos
 *   copias hechas en el mismo segundo comparten nombre y la segunda sustituye a la primera.
 * - La descarga exige `?token=` (sin él, 403) y sirve `application/zip` como adjunto.
 */

import PocketBase, { ClientResponseError } from 'pocketbase';
import type { AdministrationPort } from '../../port';
import type { BackupFile, EditorAccount, NewEditorAccess } from '../../types';
import type { FieldError } from '../../errors';
import { VegaError } from '../../errors';
import { VEGA_EDITORS_COLLECTION_NAME } from '../../administration';
import {
	DEFAULT_PASSWORD_MIN_LENGTH,
	invitationTemplateBody,
	sortBackups,
	sortEditors,
	toIsoDate
} from '../../administration-rules';
import { mapPocketBaseError } from './errors';

interface AdministrationOptions {
	pb: PocketBase;
	/** El `guarded()` del adaptador: chequeo de sesión, mapeo de errores y latch de expiración. */
	guarded<T>(op: () => Promise<T>): Promise<T>;
}

/** Longitud de la contraseña aleatoria de una invitación: nadie la conoce ni la teclea, y bcrypt
 *  (PB) solo usa los primeros 72 bytes. */
const INVITE_PASSWORD_BYTES = 32;

/** Crea la sección de administración sobre el cliente ya autenticado del adaptador. */
export function createPocketBaseAdministration({
	pb,
	guarded
}: AdministrationOptions): AdministrationPort {
	const editors = () => pb.collection(VEGA_EDITORS_COLLECTION_NAME);

	async function findEditor(id: string): Promise<EditorAccount> {
		return toEditorAccount(await editors().getOne(id));
	}

	return {
		listEditors() {
			return guarded(async () => {
				// `getOne` de la colección antes que sus registros: da el `min` real de la contraseña y
				// distingue "no existe la colección" (404) de cualquier otro fallo.
				const collection = await pb.collections.getOne(VEGA_EDITORS_COLLECTION_NAME);
				if (collection.type !== 'auth') {
					throw VegaError.backend(
						`La colección "${VEGA_EDITORS_COLLECTION_NAME}" existe pero no es de autenticación.`
					);
				}
				const records = await editors().getFullList({ batch: 200 });
				return {
					editors: sortEditors(records.map(toEditorAccount)),
					passwordMinLength: passwordMinLength(collection.fields)
				};
			});
		},

		mailEnabled() {
			return guarded(async () => {
				const settings = (await pb.settings.getAll()) as { smtp?: { enabled?: unknown } };
				return settings.smtp?.enabled === true;
			});
		},

		createEditor(email, access: NewEditorAccess) {
			return guarded(async () => {
				const password = access.kind === 'password' ? access.password : randomPassword();
				let created: EditorAccount;
				try {
					created = toEditorAccount(
						await editors().create({
							email,
							password,
							passwordConfirm: password,
							verified: access.kind === 'password'
						})
					);
				} catch (err) {
					throw mapAccountWriteError(err);
				}
				if (access.kind === 'invite') await editors().requestPasswordReset(created.email);
				return created;
			});
		},

		setEditorPassword(id, password) {
			return guarded(async () => {
				try {
					await editors().update(id, { password, passwordConfirm: password, verified: true });
				} catch (err) {
					throw mapAccountWriteError(err);
				}
			});
		},

		sendEditorInvitation(id) {
			return guarded(async () => {
				const account = await findEditor(id);
				await editors().requestPasswordReset(account.email);
			});
		},

		removeEditor(id) {
			return guarded(async () => {
				await editors().delete(id);
			});
		},

		listBackups() {
			return guarded(async () => {
				const raw: unknown = await pb.send('/api/backups', { method: 'GET' });
				if (!Array.isArray(raw)) {
					throw VegaError.backend('Respuesta de copias de seguridad con forma inesperada.');
				}
				return sortBackups(raw.map(toBackupFile));
			});
		},

		createBackup() {
			return guarded(async () => {
				try {
					// Sin `name`: el servidor lo genera (`pb_backup_<app>_<fecha>.zip`). La petición
					// queda abierta hasta que la copia termina.
					await pb.send('/api/backups', { method: 'POST', body: {} });
					return 'created' as const;
				} catch (err) {
					if (isBackupBusyError(err)) return 'busy' as const;
					throw err;
				}
			});
		},

		backupDownloadUrl(key) {
			return guarded(async () => {
				const token = await pb.files.getToken();
				return pb.backups.getDownloadURL(token, key);
			});
		},

		ensureInvitationLink(resetUrl) {
			return guarded(async () => {
				// La plantilla de fábrica sale de los scaffolds del propio servidor, no de una copia en
				// Vega: así "sigue siendo la de fábrica" significa lo mismo en cualquier versión de PB.
				const [collection, scaffolds, settings] = await Promise.all([
					pb.collections.getOne(VEGA_EDITORS_COLLECTION_NAME),
					pb.send('/api/collections/meta/scaffolds', { method: 'GET' }) as Promise<{
						auth?: { resetPasswordTemplate?: EmailTemplate };
					}>,
					pb.settings.getAll() as Promise<{ meta?: { appURL?: unknown } }>
				]);
				const current = (collection as { resetPasswordTemplate?: EmailTemplate })
					.resetPasswordTemplate;
				const factory = scaffolds.auth?.resetPasswordTemplate;
				if (!current || !factory) return 'custom';
				const appUrl = typeof settings.meta?.appURL === 'string' ? settings.meta.appURL : '';
				const target = invitationTemplateBody(factory.body, resetUrl, appUrl);
				if (target === null) return 'custom';
				if (current.body === target) return 'current';
				if (current.body !== factory.body) return 'custom';
				await pb.collections.update(VEGA_EDITORS_COLLECTION_NAME, {
					resetPasswordTemplate: { subject: current.subject, body: target }
				});
				return 'updated';
			});
		}
	};
}

interface EmailTemplate {
	subject: string;
	body: string;
}

/**
 * `EditorPasswordResetPort.confirm` sobre PocketBase: endpoint PÚBLICO de la colección, así que no
 * pasa por `guarded()` (no hay sesión que vigilar, y un 401/403 aquí no significa "sesión
 * caducada"). Medido en 0.39.6: token malo, caducado o ya usado ⇒ 400 con `data.token`
 * (`validation_invalid_token`); contraseña fuera de rango ⇒ `data.password`
 * (`validation_length_out_of_range`), y a veces los dos a la vez.
 */
export async function confirmEditorPasswordResetOnPocketBase(
	pb: PocketBase,
	token: string,
	password: string
): Promise<void> {
	try {
		await pb
			.collection(VEGA_EDITORS_COLLECTION_NAME)
			.confirmPasswordReset(token, password, password);
	} catch (err) {
		if (err instanceof ClientResponseError && err.status === 400) {
			const data =
				(err.response as { data?: Record<string, { code?: string; message?: string }> })?.data ??
				{};
			const fieldErrors: Record<string, FieldError> = {};
			for (const [key, value] of Object.entries(data)) {
				const target = key === 'token' ? 'token' : key.startsWith('password') ? 'password' : '';
				if (fieldErrors[target]) continue;
				fieldErrors[target] = {
					code: value?.code ?? 'validation_error',
					message: value?.message ?? 'Valor no válido'
				};
			}
			if (Object.keys(fieldErrors).length > 0) throw VegaError.validation(fieldErrors);
		}
		throw mapPocketBaseError(err, { hadSession: false });
	}
}

function toEditorAccount(raw: Record<string, unknown>): EditorAccount {
	return {
		id: String(raw.id),
		email: String(raw.email ?? ''),
		verified: raw.verified === true,
		created: toIsoDate(raw.created)
	};
}

function toBackupFile(raw: unknown): BackupFile {
	const item = raw as { key?: unknown; size?: unknown; modified?: unknown } | null;
	const modified = toIsoDate(item?.modified);
	if (!item || typeof item.key !== 'string' || typeof item.size !== 'number' || modified === null) {
		throw VegaError.backend('Respuesta de copias de seguridad con forma inesperada.');
	}
	return { key: item.key, size: item.size, modified };
}

function passwordMinLength(fields: Array<{ name?: string; type?: string; min?: unknown }>): number {
	const field = fields.find((f) => f.name === 'password' && f.type === 'password');
	const min = typeof field?.min === 'number' ? field.min : 0;
	return min > 0 ? min : DEFAULT_PASSWORD_MIN_LENGTH;
}

/** Contraseña que nadie conoce para una invitación: la persona elige la suya con el correo. */
function randomPassword(): string {
	const bytes = new Uint8Array(INVITE_PASSWORD_BYTES);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ver cabecera: la señal de "otra copia en marcha" es un 400 sin errores por campo. */
function isBackupBusyError(err: unknown): boolean {
	if (!(err instanceof ClientResponseError) || err.status !== 400) return false;
	const data = (err.response as { data?: Record<string, unknown> } | undefined)?.data;
	return !data || Object.keys(data).length === 0;
}

/**
 * Un 400 al crear una cuenta o cambiar su contraseña se traduce a los dos campos que la UI pinta:
 * `email` y `password`. `passwordConfirm` va a `password` (el puerto lo manda igual que `password`,
 * así que un error ahí solo puede venir de la contraseña misma); cualquier otra clave, a `''`.
 * El resto de errores pasan tal cual y los mapea `guarded()`.
 */
function mapAccountWriteError(err: unknown): unknown {
	if (!(err instanceof ClientResponseError) || err.status !== 400) return err;
	const body = err.response as
		{ message?: string; data?: Record<string, { code?: string; message?: string }> } | undefined;
	const entries = Object.entries(body?.data ?? {});
	if (entries.length === 0) return err;
	const fieldErrors: Record<string, FieldError> = {};
	for (const [key, value] of entries) {
		const target = key === 'email' ? 'email' : key.startsWith('password') ? 'password' : '';
		if (fieldErrors[target]) continue;
		fieldErrors[target] = {
			code: value?.code ?? 'validation_error',
			message: value?.message ?? 'Valor no válido'
		};
	}
	return VegaError.validation(fieldErrors, body?.message ?? 'Datos no válidos');
}
