/**
 * Formatos de fecha y de tiempo transcurrido de las pantallas de superusuario. Puros: el locale y,
 * donde hace falta, el reloj llegan como parámetro.
 */

import type { Locale } from '$lib/i18n';

/** «3 feb 2026»: la fecha de alta de un editor (mismo formato medio que la tabla de registros). */
export function formatDay(iso: string, locale: Locale): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return '';
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(ms));
}

/** «24 sep 2026, 10:15»: la fecha de una copia, con hora porque puede haber varias en un día. */
export function formatDayTime(iso: string, locale: Locale): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return '';
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(ms)
	);
}

/** «0:42», «12:05», «1:02:09»: tiempo real transcurrido de una copia en curso. */
export function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = String(total % 60).padStart(2, '0');
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
		: `${minutes}:${seconds}`;
}
