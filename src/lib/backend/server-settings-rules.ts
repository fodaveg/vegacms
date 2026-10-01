/**
 * Reglas puras de los ajustes del servidor (`server-settings.ts`): el parche que solo lleva lo que
 * cambió, las frecuencias de copia en llano y la validación local mínima. Van en su propio módulo,
 * que solo importan las implementaciones y las pantallas, para que la carga inicial solo cargue los
 * tipos y la sección diferida.
 */

import type {
	SecretChange,
	ServerBackups,
	ServerS3,
	ServerSettings,
	ServerSettingsDraft,
	ServerSettingsPatch
} from './server-settings';

/** Cada día a las 00:00 UTC. PocketBase ejecuta el cron en UTC. */
export const CRON_DAILY = '0 0 * * *';
/** Cada domingo a las 00:00 UTC (día 0 de la semana). */
export const CRON_WEEKLY = '0 0 * * 0';
/** Copias que PocketBase conserva de fábrica (`backups.cronMaxKeep`). */
export const DEFAULT_CRON_MAX_KEEP = 3;

/** Las cuatro opciones en llano de la frecuencia; `custom` enseña la expresión literal. */
export type BackupFrequency = 'never' | 'daily' | 'weekly' | 'custom';

/**
 * La frecuencia en llano de una expresión guardada. Solo las dos expresiones exactas de la lista se
 * reconocen (comparadas sin espacios de más); cualquier otra, por válida que sea, es `custom` y se
 * enseña literal: traducirla a palabras exige un intérprete de cron que, si falla, afirma un
 * horario falso.
 */
export function frequencyOf(cron: string): BackupFrequency {
	const normalized = cron.trim().replace(/\s+/g, ' ');
	if (normalized === '') return 'never';
	if (normalized === CRON_DAILY) return 'daily';
	if (normalized === CRON_WEEKLY) return 'weekly';
	return 'custom';
}

/** La expresión que guarda una frecuencia: «Nunca» es la cadena vacía, que PocketBase entiende. */
export function cronFor(frequency: BackupFrequency, custom: string): string {
	switch (frequency) {
		case 'never':
			return '';
		case 'daily':
			return CRON_DAILY;
		case 'weekly':
			return CRON_WEEKLY;
		case 'custom':
			return custom.trim().replace(/\s+/g, ' ');
	}
}

/** `true` si `n` es un entero que PocketBase acepta como `cronMaxKeep` (1 o más). */
export function isValidMaxKeep(n: number): boolean {
	return Number.isInteger(n) && n >= 1;
}

/** `true` si el destino S3 de las copias está activado. */
export function usesExternalStore(backups: ServerBackups): boolean {
	return backups.s3.enabled;
}

/** El secreto que viaja: solo un valor nuevo no vacío o el `""` explícito de «quitar». */
function secretValue(change: SecretChange | undefined): string | undefined {
	if (!change) return undefined;
	if (change.kind === 'clear') return '';
	return change.value === '' ? undefined : change.value;
}

/** Solo las claves de `next` cuyo valor difiere de `current`; `undefined` en `next` = sin cambio. */
function changedKeys<T extends object>(current: T, next: Partial<T> | undefined): Partial<T> {
	const out: Partial<T> = {};
	if (!next) return out;
	for (const key of Object.keys(next) as Array<keyof T>) {
		const value = next[key];
		if (value !== undefined && value !== current[key]) out[key] = value;
	}
	return out;
}

/**
 * El parche para pasar de `current` a lo que pide `draft`: SOLO lo que cambia, y los bloques que no
 * cambian ni aparecen. Un secreto solo viaja si hay uno nuevo (`set` con valor) o `clear`; un
 * `set` vacío se ignora, porque mandar `""` borraría el guardado en PocketBase (medido).
 */
export function buildServerSettingsPatch(
	current: ServerSettings,
	draft: ServerSettingsDraft
): ServerSettingsPatch {
	const patch: ServerSettingsPatch = {};

	const meta = changedKeys(current.meta, draft.meta);
	if (Object.keys(meta).length > 0) patch.meta = meta;

	const smtp: NonNullable<ServerSettingsPatch['smtp']> = changedKeys(current.smtp, draft.smtp);
	const smtpPassword = secretValue(draft.secrets?.smtpPassword);
	if (smtpPassword !== undefined) smtp.password = smtpPassword;
	if (Object.keys(smtp).length > 0) patch.smtp = smtp;

	const backups: NonNullable<ServerSettingsPatch['backups']> = {};
	if (draft.backups?.cron !== undefined && draft.backups.cron !== current.backups.cron) {
		backups.cron = draft.backups.cron;
	}
	if (
		draft.backups?.cronMaxKeep !== undefined &&
		draft.backups.cronMaxKeep !== current.backups.cronMaxKeep
	) {
		backups.cronMaxKeep = draft.backups.cronMaxKeep;
	}
	const s3: Partial<ServerS3> & { secret?: string } = changedKeys(
		current.backups.s3,
		draft.backups?.s3
	);
	const s3Secret = secretValue(draft.secrets?.backupsS3Secret);
	if (s3Secret !== undefined) s3.secret = s3Secret;
	if (Object.keys(s3).length > 0) backups.s3 = s3;
	if (Object.keys(backups).length > 0) patch.backups = backups;

	return patch;
}

/** `true` si el parche no cambia nada (no hace falta ninguna petición). */
export function isEmptyPatch(patch: ServerSettingsPatch): boolean {
	return Object.keys(patch).length === 0;
}
