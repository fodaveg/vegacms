/**
 * Reglas puras de `AdministrationPort` (`port.ts`) que comparten los dos adaptadores y las
 * pantallas: el mínimo de contraseña de fábrica, el orden de las dos listas y la lectura de fechas
 * de PocketBase. Vivir aquí evita que `memory` y `pocketbase` ordenen distinto la misma lista y
 * que la suite de contrato tenga que tolerar las dos cosas. Nada de la carga inicial importa este
 * módulo (ver `administration.ts`).
 */

import type { BackupFile, EditorAccount } from './types';

/**
 * Mínimo de contraseña de una colección `auth` recién creada en PocketBase (campo `password`,
 * `min: 8`, medido contra 0.39.6). `memory` lo usa como regla propia y `pocketbase` como respaldo si
 * la colección no declara un `min` positivo.
 */
export const DEFAULT_PASSWORD_MIN_LENGTH = 8;

/** Alta más antigua primero; sin fecha, detrás y por email (orden estable en los dos adaptadores). */
export function sortEditors(editors: EditorAccount[]): EditorAccount[] {
	return [...editors].sort((a, b) => {
		if (a.created !== null && b.created !== null && a.created !== b.created) {
			return a.created < b.created ? -1 : 1;
		}
		if (a.created !== null && b.created === null) return -1;
		if (a.created === null && b.created !== null) return 1;
		return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
	});
}

/** La copia más reciente primero; a igual fecha, por clave. */
export function sortBackups(backups: BackupFile[]): BackupFile[] {
	return [...backups].sort((a, b) => {
		if (a.modified !== b.modified) return a.modified < b.modified ? 1 : -1;
		return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
	});
}

/**
 * El enlace del correo de restablecimiento de fábrica en PocketBase 0.39.6 (medido: aparece una
 * vez en `resetPasswordTemplate.body` de una colección `auth` nueva, y es la misma plantilla que
 * sirve `GET /api/collections/meta/scaffolds`). Lleva al Admin de PB (`/_/`).
 */
export const FACTORY_RESET_LINK = '{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}';

/**
 * Cuerpo de la plantilla de restablecimiento con el enlace cambiado a la ruta pública de Vega:
 * `resetUrl` (absoluta, sin query) más `?token={TOKEN}`. Si `resetUrl` cuelga de la URL de la
 * aplicación de PocketBase (`settings.meta.appURL`, lo que PB sustituye por `{APP_URL}`), se
 * escribe relativa a `{APP_URL}`: así sigue valiendo si el dueño cambia ahí el dominio. `null` si
 * `factoryBody` no contiene el enlace de fábrica (plantilla de otra versión de PB).
 */
export function invitationTemplateBody(
	factoryBody: string,
	resetUrl: string,
	appUrl: string
): string | null {
	if (!factoryBody.includes(FACTORY_RESET_LINK)) return null;
	const app = appUrl.trim().replace(/\/+$/, '');
	const target =
		app !== '' && resetUrl.startsWith(`${app}/`)
			? `{APP_URL}${resetUrl.slice(app.length)}`
			: resetUrl;
	return factoryBody.replace(FACTORY_RESET_LINK, `${target}?token={TOKEN}`);
}

/**
 * Convierte la fecha que sirve PocketBase (`2026-09-24 06:28:36.690Z`, con espacio) a ISO 8601
 * (`2026-09-24T06:28:36.690Z`). Una cadena que no se deja leer como fecha devuelve `null`.
 */
export function toIsoDate(raw: unknown): string | null {
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const ms = Date.parse(raw.trim().replace(' ', 'T'));
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
