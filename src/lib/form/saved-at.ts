/**
 * Texto del «último guardado» de la barra del editor: solo la hora si el guardado es de HOY y
 * fecha + hora si es de otro día (un «12:00» a secas, sin día, engaña con un registro viejo).
 */

/** ¿Es el mismo día natural (en la zona horaria local)? */
function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * «12:00» si `savedAt` es de hoy (respecto a `now`); «24/9/26, 12:00» (formato corto del locale)
 * si es de otro día. Puro: `now` se inyecta para poder probarlo.
 */
export function formatSavedAt(savedAt: Date, now: Date, locale: string): string {
	if (isSameDay(savedAt, now)) {
		return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(savedAt);
	}
	return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
		savedAt
	);
}
