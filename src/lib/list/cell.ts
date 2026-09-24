/**
 * Descriptor de celda de listado (Parte 4, Fase 4a del contrato P4, tabla §4). Módulo 100%
 * puro: sin Svelte, sin el puerto, sin `pocketbase`, sin `fileUrl` (eso lo compone el `.svelte`
 * de 4c a partir de las `FileRef` que aquí solo se transportan). `describeCell` traduce un
 * valor normalizado (§2.1 del contrato P1) a la mínima información que 4c necesita para pintar
 * la celda, sin decidir el widget concreto (eso es de 4c, que además conoce `capabilities` para
 * elegir miniatura vs nombre de fichero, cosa que este módulo no conoce).
 *
 * La ruta caliente v1 (title + status + text/number/bool/date) es trivial y sin red: son los
 * primeros `case` del switch y no hacen más que formatear con `Intl`.
 *
 * **Fechas relativas (M5, mockup `aquelarre-dark.html` "hace 2 h"/"ayer")**: el `case 'date'`
 * pinta con `Intl.RelativeTimeFormat` (`formatDateCell`) cuando el valor está a menos de una
 * semana de "ahora"; más allá de ese umbral cae al `Intl.DateTimeFormat` absoluto de siempre.
 * "Ahora" es el parámetro `now` de `describeCell` (default `Date.now()`, NUNCA leído dentro del
 * switch): puro y testeable sin mockear el reloj global.
 */

import { isEmptyValue } from '$lib/backend/normalize';
import type { FieldValue, FileRef } from '$lib/backend/types';
import type { Locale } from '$lib/i18n';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';

/** Longitud máxima (en caracteres) del texto plano extraído de un campo `richtext`. Evita que
 *  un documento enorme llegue entero a la fila de una tabla; el truncado fino (ellipsis CSS)
 *  sigue siendo cosa de 4c, esto es solo una cota defensiva sobre el TAMAÑO del descriptor. */
const RICHTEXT_MAX_CHARS = 200;

/**
 * Descriptor de celda, discriminado por `kind`. Cada variante lleva SOLO lo que 4c necesita
 * para pintar; nunca un valor crudo peligroso (HTML, id opaco de relación, objeto JSON entero).
 */
export type CellDescriptor =
	| { kind: 'empty' } // null/''/[] uniformes (§4): 4c pinta "—"
	| { kind: 'text'; text: string } // text/email/url/select simple: texto completo (tooltip vía title en 4c)
	| { kind: 'number'; text: string } // ya formateado por locale (respeta `integer`)
	| { kind: 'bool'; value: boolean } // 4c traduce a Sí/No (i18n es cosa de 4c, no de aquí)
	| { kind: 'date'; text: string } // ya formateado por locale
	| { kind: 'select-multi'; values: string[] } // valores tal cual; 4c decide contador vs chips
	| { kind: 'relation'; count: number } // NUNCA el id crudo (Audit H5): solo cardinalidad
	| { kind: 'file'; refs: FileRef[] } // 4c decide miniatura (capabilities.thumbs) vs nombre
	// HTML→texto plano, YA truncado, NUNCA el HTML (XSS). `text` es texto de DOMINIO: 4c DEBE
	// pintarlo con interpolación normal de Svelte (`{descriptor.text}`, auto-escapado), JAMÁS
	// con `{@html}` — reinyectar esto como HTML anularía el trabajo de `stripHtmlToPlainText`.
	| { kind: 'richtext'; text: string }
	| { kind: 'mono'; text: string }; // json/unsupported: marcador corto, nunca el valor crudo

/**
 * Traduce `value` (ya normalizado por el puerto, §2.1) a un `CellDescriptor` según el tipo real
 * del campo (`field.schema.type`). Vacío uniforme primero (null/''/[] → `'empty'`, misma noción
 * que `isEmptyValue` usa para `required`/`empty` en el resto del contrato), luego una rama por
 * tipo siguiendo la tabla §4.
 *
 * `now` (M5, default `Date.now()`): instante de referencia para el `case 'date'` relativo
 * (`formatDateCell`) — parámetro explícito en vez de leer el reloj global dentro del switch, así
 * los tests pueden fijar "ahora" sin mockear `Date`.
 */
export function describeCell(
	field: ResolvedField,
	value: FieldValue,
	locale: Locale,
	now: number = Date.now()
): CellDescriptor {
	if (isEmptyValue(field.schema, value)) return { kind: 'empty' };

	switch (field.schema.type) {
		case 'text':
		case 'email':
		case 'url':
			return { kind: 'text', text: typeof value === 'string' ? value : '' };

		case 'richtext': {
			const plain = stripHtmlToPlainText(typeof value === 'string' ? value : '');
			return plain === ''
				? { kind: 'empty' }
				: { kind: 'richtext', text: truncate(plain, RICHTEXT_MAX_CHARS) };
		}

		case 'number': {
			if (typeof value !== 'number' || Number.isNaN(value)) return { kind: 'empty' };
			const formatter = new Intl.NumberFormat(
				locale,
				field.schema.integer ? { maximumFractionDigits: 0 } : undefined
			);
			return { kind: 'number', text: formatter.format(value) };
		}

		case 'bool':
			return { kind: 'bool', value: typeof value === 'boolean' ? value : false };

		case 'date': {
			if (typeof value !== 'string') return { kind: 'empty' };
			const ms = Date.parse(value);
			if (Number.isNaN(ms)) return { kind: 'empty' };
			return { kind: 'date', text: formatDateCell(ms, locale, now) };
		}

		case 'select':
			if (field.schema.multiple) {
				return Array.isArray(value)
					? { kind: 'select-multi', values: value as string[] }
					: { kind: 'empty' };
			}
			return typeof value === 'string' ? { kind: 'text', text: value } : { kind: 'empty' };

		case 'relation':
			// Nunca el id crudo (Audit H5: la UI no interpreta ids). Sin `expand` (el puerto no
			// expande relaciones en v1): aquí solo cabe una marca de presencia/cardinalidad.
			if (field.schema.multiple) {
				return Array.isArray(value) ? { kind: 'relation', count: value.length } : { kind: 'empty' };
			}
			return { kind: 'relation', count: 1 };

		case 'file':
			if (field.schema.multiple) {
				return Array.isArray(value)
					? { kind: 'file', refs: [...(value as FileRef[])] }
					: { kind: 'empty' };
			}
			return typeof value === 'string' ? { kind: 'file', refs: [value] } : { kind: 'empty' };

		case 'json':
			return { kind: 'mono', text: '{…}' };

		case 'unsupported':
			return { kind: 'mono', text: field.schema.backendType };
	}
}

/** Umbral de fechas relativas (M5): por debajo de una semana de diferencia con `now`, la celda
 *  se pinta en relativo; a partir de ahí cae al absoluto (una fecha de hace meses en relativo
 *  sería ruido, no información — "hace 214 días" no orienta como "18 jul 2026"). */
const RELATIVE_DATE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formatea una fecha de celda (M5, mockup `aquelarre-dark.html` "hace 2 h"/"ayer"): relativo a
 * `now` con `Intl.RelativeTimeFormat` (`numeric:'auto'`, que da "ayer"/"hoy"/"mañana" en vez de
 * "hace 1 día") cuando la diferencia es menor que `RELATIVE_DATE_THRESHOLD_MS`; si no, el
 * `Intl.DateTimeFormat` absoluto — SOLO fecha, sin hora (match 1:1 con el mockup, "18 jul 2026":
 * `dateStyle:'medium'`, ya sin `timeStyle`; antes llevaba también la hora). La unidad
 * (segundo/minuto/hora/día) se elige por la magnitud de la diferencia, redondeando al entero más
 * cercano — nunca trunca hacia cero (evitaría que 89 minutos se lea "hace 1 hora" en vez de "hace
 * 2 horas"). Pura: `now` es un parámetro explícito, nunca `Date.now()` leído aquí dentro.
 *
 * **La unidad se decide DESPUÉS de redondear** (fix de code-review): si se eligiera por la
 * magnitud CRUDA y se redondeara luego, el ~1% final de cada ventana daría texto raro — 59.6 s
 * elegiría `second` pero `Math.round` lo sube a 60 → "hace 60 segundos" en vez de "hace 1 minuto"
 * (igual con "60 minutos" y "24 horas"). Redondeando en cada unidad de menor a mayor y saltando a
 * la siguiente cuando el valor llega a su tope (60 s, 60 min, 24 h), el borde promociona limpio.
 */
function formatDateCell(ms: number, locale: Locale, now: number): string {
	const diffMs = ms - now;
	const absDiffMs = Math.abs(diffMs);

	if (absDiffMs >= RELATIVE_DATE_THRESHOLD_MS) {
		return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(ms));
	}

	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	let value = Math.round(diffMs / 1000);
	let unit: Intl.RelativeTimeFormatUnit = 'second';
	if (Math.abs(value) >= 60) {
		value = Math.round(diffMs / MINUTE_MS);
		unit = 'minute';
	}
	if (unit === 'minute' && Math.abs(value) >= 60) {
		value = Math.round(diffMs / HOUR_MS);
		unit = 'hour';
	}
	if (unit === 'hour' && Math.abs(value) >= 24) {
		value = Math.round(diffMs / DAY_MS);
		unit = 'day';
	}
	return rtf.format(value, unit);
}

/**
 * Clasifica el valor CRUDO de una columna de estado en una de las tres insignias del mockup C2
 * (R3 del rediseño, `.tag.pub`/`.tag.draft`/`.tag.other`): los dos literales de la convención
 * (`published`/`draft`) más un cajón "other" para CUALQUIER otro valor (p.ej. `archived`, o
 * cualquier opción que un manifiesto añada a su `select` de estado).
 *
 * **Desviación consciente de D-P4.8** (documentada para el code-review): D-P4.8 solo pintaba
 * insignia para `draft`/`published` y dejaba el resto como texto plano; el mockup 1:1 pinta
 * TODO valor de una columna de estado como insignia (con `.tag.other` de respaldo) — David pidió
 * fidelidad 1:1, así que `RecordTable.svelte` amplía la insignia a cualquier valor y usa esta
 * función para decidir el color. Pura: solo mapea un string, sin conocer Svelte ni el DOM.
 */
export type StatusBadgeKind = 'pub' | 'draft' | 'other' | 'scheduled';

export function classifyStatusBadge(value: string): Exclude<StatusBadgeKind, 'scheduled'> {
	if (value === 'published') return 'pub';
	if (value === 'draft') return 'draft';
	return 'other';
}

/** Insignia de estado ya decidida: `raw` va a `data-status` (valor crudo, estable para tests y
 *  selectores), `kind` a `data-status-kind` (color) y `label` es el TEXTO visible. */
export interface StatusBadge {
	raw: string;
	kind: StatusBadgeKind;
	label: string;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Insignia de estado de un registro, la MISMA en listado, raíl y cabecera del formulario.
 * `null` si el tipo no tiene `statusField` o el registro lo tiene vacío.
 *
 * Publicación programada (`publishAtField`, extensión `vegaschedule`): un `draft` cuya fecha
 * «Publicar el» está en el FUTURO respecto a `now` se pinta «Programada · 12 oct 10:00» con
 * `kind: 'scheduled'` — el texto lo dice, no solo el color. `raw` sigue siendo `draft`, que es lo
 * que ES el registro hasta que el servidor lo publique. Con la fecha ya pasada vuelve a ser un
 * «Borrador» normal: o el cron está a punto de publicarlo (lo hace cada minuto y vacía la fecha),
 * o el servidor no tiene `vegaschedule` y anunciar «Programada» sería mentir.
 *
 * `now` es parámetro (default `Date.now()`), mismo criterio que `describeCell`.
 */
export function describeStatusBadge(
	type: Pick<ResolvedContentType, 'statusField' | 'statusLabels' | 'publishAtField'>,
	values: Record<string, unknown>,
	locale: Locale,
	t: Translate,
	now: number = Date.now()
): StatusBadge | null {
	if (type.statusField === null) return null;
	const raw = values[type.statusField];
	if (typeof raw !== 'string' || raw === '') return null;

	if (raw === 'draft' && type.publishAtField) {
		const scheduled = values[type.publishAtField];
		const ms = typeof scheduled === 'string' && scheduled !== '' ? Date.parse(scheduled) : NaN;
		if (!Number.isNaN(ms) && ms > now) {
			return {
				raw,
				kind: 'scheduled',
				label: t('list.status.scheduled', { date: formatScheduledDate(ms, locale, now) })
			};
		}
	}

	return { raw, kind: classifyStatusBadge(raw), label: type.statusLabels?.[raw] ?? raw };
}

/** «12 oct 10:00» (es) / «Oct 12 10:00 AM» (en): día, mes corto y hora local, sin coma entre
 *  fecha y hora. El año solo aparece si no es el de `now` («12 oct 2027 10:00»). */
function formatScheduledDate(ms: number, locale: Locale, now: number): string {
	const date = new Date(ms);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	const day = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' })
	}).format(date);
	const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
	return `${day} ${time}`;
}

/**
 * Extrae texto plano de un fragmento HTML de forma segura: NUNCA `innerHTML`/parseo DOM (que
 * en un contexto no confiable abriría la puerta a interpretar markup del backend). Es un
 * strip de etiquetas por regex conservador — suficiente para una celda de tabla, no un
 * renderer de HTML — más el desescapado de las entidades más comunes.
 *
 * Orden DELIBERADO (fix de code review): stripear → desescapar → volver a stripear. Si se
 * desescapara antes del primer strip, una entidad como `&lt;script&gt;` se convertiría en el
 * tag literal `<script>` justo ANTES de la pasada que lo elimina y sobreviviría intacta si esa
 * pasada no se repitiera; con un segundo strip tras desescapar, cualquier secuencia con forma de
 * tag que las entidades "revelen" se vuelve a limpiar — el resultado nunca contiene `<...>` con
 * apariencia de markup activo, aunque el desescapado la haya generado.
 */
function stripHtmlToPlainText(html: string): string {
	const firstStrip = html.replace(/<[^>]*>/g, ' ');
	const unescaped = firstStrip.replace(
		/&(nbsp|amp|lt|gt|quot|#39);/g,
		(_match, name: string) => HTML_ENTITIES[name]
	);
	const secondStrip = unescaped.replace(/<[^>]*>/g, ' ');
	return secondStrip.replace(/\s+/g, ' ').trim();
}

const HTML_ENTITIES: Record<string, string> = {
	nbsp: ' ',
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	'#39': "'"
};

/**
 * Trunca `text` a `max` caracteres, añadiendo una elipsis si se ha recortado algo. Corte
 * emoji-safe (fix de code review): `text.slice(0, max)` opera en unidades UTF-16 y puede
 * partir un par sustituto (emoji, algunos CJK) por la mitad, dejando un carácter de reemplazo
 * corrupto; `Array.from` itera por code point, así el corte cae siempre entre caracteres
 * completos.
 */
function truncate(text: string, max: number): string {
	const chars = Array.from(text);
	if (chars.length <= max) return text;
	return `${chars.slice(0, max).join('').trimEnd()}…`;
}
