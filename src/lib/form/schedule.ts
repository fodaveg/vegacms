/**
 * Piezas PURAS de «Programar…» (lote 12, lámina 2): qué control de programación toca para un
 * registro, qué fecha se propone y cómo se dice una fecha. Sin Svelte ni red: las comparten
 * `RecordForm.svelte` (junto al campo Estado) y `ScheduleDialog.svelte` (que el editor visual
 * montará igual).
 *
 * La lógica del servidor vive en `extensions/vegaschedule` (un cron que publica cada borrador con
 * fecha vencida y VACÍA la fecha). Cuál es el estado del servidor lo decide
 * `$lib/backend/scheduled-publishing`; aquí solo se consume (`ScheduledPublishingState`).
 */
import type { ScheduledPublishingState } from '$lib/backend/types';
import type { Locale } from '$lib/i18n';
import { OVERDUE_GRACE_MS } from '$lib/list/cell';
import type { ResolvedContentType } from '$lib/model/types';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Lo que se pinta junto al campo Estado (lámina 2, estados 2.5 a 2.9):
 * - `none`: nada. Sin `statusField`/`publishAtField`, registro de solo lectura, ya publicado
 *   (2.7) o servidor comprobado SIN `vegaschedule` (2.9: «Programar…» prometería algo que no va a
 *   pasar, así que no se ofrece, no se deshabilita).
 * - `draft`: borrador sin fecha vigente (2.5): botón «Programar…».
 * - `scheduled`: borrador con fecha futura (2.6): «Cambiar fecha…» y la línea con «Quitar
 *   programación». `at` es la fecha (ms).
 * - `overdue`: borrador cuya fecha pasó hace más de `OVERDUE_GRACE_MS` y sigue en borrador (2.8):
 *   aviso con «Publicar ahora» y «Cambiar fecha…».
 * `unconfirmed` es `true` cuando el servidor no se ha podido comprobar (`'unknown'`): se puede
 * programar, pero se avisa (2.3).
 */
export type ScheduleControl =
	| { kind: 'none' }
	| { kind: 'draft'; unconfirmed: boolean }
	| { kind: 'scheduled'; at: number; unconfirmed: boolean }
	| { kind: 'overdue'; at: number; unconfirmed: boolean };

/**
 * Decide el control a partir de lo que MUESTRA el formulario (`values`: estado y «Publicar el» en
 * edición), no de lo guardado: el botón desaparece en cuanto se elige «Publicado» y vuelve al
 * volver a «Borrador». `now` es parámetro (mismo criterio que `describeStatusBadge`).
 *
 * El plazo de «no se publicó» es el MISMO que el de la etiqueta de la barra y el del listado
 * (`OVERDUE_GRACE_MS`, 5 min): dentro de ese margen el borrador sigue siendo un borrador normal
 * y se ofrece «Programar…», sin alarmar en el minuto en que el cron aún no ha pasado.
 */
export function describeScheduleControl(
	type: Pick<ResolvedContentType, 'statusField' | 'publishAtField'>,
	values: Record<string, unknown>,
	scheduling: ScheduledPublishingState,
	locked: boolean,
	now: number = Date.now()
): ScheduleControl {
	if (locked || !type.statusField || !type.publishAtField) return { kind: 'none' };
	if (scheduling === 'inactive') return { kind: 'none' };
	if (values[type.statusField] !== 'draft') return { kind: 'none' };
	const unconfirmed = scheduling === 'unknown';
	const raw = values[type.publishAtField];
	const at = typeof raw === 'string' && raw !== '' ? Date.parse(raw) : NaN;
	if (!Number.isNaN(at)) {
		if (at > now) return { kind: 'scheduled', at, unconfirmed };
		if (at <= now - OVERDUE_GRACE_MS) return { kind: 'overdue', at, unconfirmed };
	}
	return { kind: 'draft', unconfirmed };
}

/**
 * Hora de pared (`YYYY-MM-DDTHH:mm`, la de un `<input type="datetime-local">`) de mañana a las 09:00
 * en la zona del equipo: la fecha que el diálogo propone cuando no hay una puesta.
 */
export function proposeScheduleLocal(now: number = Date.now()): string {
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:00`;
}

/**
 * «2 oct a las 09:00» (es) / «Oct 2 at 09:00 AM» (en), en el idioma activo y la hora local. El año
 * solo aparece si no es el de `now`.
 */
export function formatScheduleMoment(
	ms: number,
	locale: Locale,
	t: Translate,
	now: number = Date.now()
): string {
	const date = new Date(ms);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	return t('editor.schedule.when', {
		date: new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'short',
			...(sameYear ? {} : { year: 'numeric' })
		}).format(date),
		time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
	});
}
