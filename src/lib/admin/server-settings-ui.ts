/**
 * Piezas puras de las tarjetas de ajustes del servidor (copias hoy, correo después): la hora local
 * de una hora UTC y la lectura de los errores de campo que devuelve `ServerSettingsPort`. El locale
 * y el reloj llegan como parámetro.
 */

import type { Locale } from '$lib/i18n';
import { VegaError } from '$lib/backend';

/** «2:00», «14:05»: hora del día sin segundos, en el formato del locale. */
export function formatClock(date: Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export interface LocalClock {
	/** La hora local equivalente, ya formateada («2:00»). */
	time: string;
	/** `true` si la hora local es la misma que la UTC: entonces «las 2:00 aquí» sobra. */
	sameAsUtc: boolean;
	/** `true` si a esa hora el día local ya no es el día UTC (ajustes semanales: «domingo» cambiaría). */
	dayShifted: boolean;
}

/**
 * La hora local de las 00:00 UTC. Se calcula sobre la fecha de `now` y no con un desfase fijo, para
 * que el cambio de hora de verano cuente: PocketBase ejecuta el cron en UTC todo el año.
 */
export function localClockOfUtcMidnight(now: Date, locale: Locale): LocalClock {
	const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	return {
		time: formatClock(utcMidnight, locale),
		sameAsUtc: utcMidnight.getHours() === 0 && utcMidnight.getMinutes() === 0,
		dayShifted: utcMidnight.getDate() !== now.getUTCDate()
	};
}

/** El mensaje que el servidor dio para un campo (`backups.cron`, `backups.s3.bucket`…), si lo dio. */
export function fieldMessage(err: unknown, path: string): string | undefined {
	return err instanceof VegaError && err.kind === 'validation'
		? err.fieldErrors?.[path]?.message
		: undefined;
}

/** `true` si el error de validación trae algún campo fuera de `known` (hay que enseñar el mensaje general). */
export function hasUnattributedFields(err: unknown, known: readonly string[]): boolean {
	if (!(err instanceof VegaError) || err.kind !== 'validation') return false;
	return Object.keys(err.fieldErrors ?? {}).some((path) => !known.includes(path));
}
