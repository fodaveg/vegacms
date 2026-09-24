/**
 * Piezas puras de `AdministrationPort` (`port.ts`) que comparten los dos adaptadores: el nombre de
 * la colección de editores, el mínimo de contraseña de fábrica y el orden de las dos listas. Vivir
 * aquí evita que `memory` y `pocketbase` ordenen distinto la misma lista y que la suite de
 * contrato tenga que tolerar las dos cosas.
 */

import type { BackupFile, EditorAccount } from './types';

/**
 * La colección `auth` de los editores. Es la única `auth` que Vega gestiona (reapertura acotada de
 * D-P1.1, ver `AdministrationPort`); el sembrado del sitio la crea con este nombre
 * (`site-seeding.ts`) y las reglas que siembra la citan literalmente.
 */
export const VEGA_EDITORS_COLLECTION_NAME = 'vega_editors';

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
 * Convierte la fecha que sirve PocketBase (`2026-09-24 06:28:36.690Z`, con espacio) a ISO 8601
 * (`2026-09-24T06:28:36.690Z`). Una cadena que no se deja leer como fecha devuelve `null`.
 */
export function toIsoDate(raw: unknown): string | null {
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const ms = Date.parse(raw.trim().replace(' ', 'T'));
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
