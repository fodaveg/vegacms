/**
 * Metadatos de PROCEDENCIA de un registro (mockup `aquelarre-detalle-post.html`, tarjeta
 * "Registro" del aside: `id` / Creado / Actualizado) más el "último guardado" de la barra
 * pegajosa. Módulo PURO (sin Svelte, sin el puerto): solo lee `type.fields` + el `baseline` del
 * formulario y decide QUÉ se puede afirmar de verdad.
 *
 * **Por qué `created`/`updated` por NOMBRE y no una capacidad de manifiesto**: son los dos campos
 * de sistema que PocketBase hornea en toda colección (`autodate`), no una convención inventada por
 * Vega — el backend real siempre los trae con ESE nombre. Aun así no basta con el nombre: se exige
 * además que el campo sea `date` **y** `readonly`, exactamente la forma de un autodate. Vega es un
 * CMS generalista y un proyecto puede tener un campo `updated` de dominio, editable, que signifique
 * cualquier otra cosa: pintarlo como "Actualizado (automático)" sería mentir sobre la procedencia
 * del dato. Sin campo que cumpla las tres condiciones, la fila simplemente NO se pinta (nunca una
 * fecha inventada) — mismo criterio que ya aplicaba `RecordForm.svelte` con "último guardado",
 * cuya lógica se extrajo aquí para no tener dos copias de la misma regla.
 */

import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import type { Locale } from '$lib/i18n';
import { describeCell } from '$lib/list/cell';
import type { FormValues } from './form-model';

/** Los dos campos de sistema que este módulo reconoce (ver cabecera). */
export type AutodateName = 'created' | 'updated';

/**
 * El `ResolvedField` autodate llamado `name` (`date` + `readonly`), o `null` si el tipo no lo
 * declara o el campo con ese nombre no es un autodate de verdad (ver cabecera).
 */
export function autodateField(type: ResolvedContentType, name: AutodateName): ResolvedField | null {
	const field = type.fields.find((f) => f.name === name);
	if (!field || field.schema.type !== 'date' || !field.schema.readonly) return null;
	return field;
}

/**
 * El instante del autodate `name` en `values`, o `null` si no hay campo autodate o su valor no es
 * una fecha parseable. Lo usa la barra pegajosa para sembrar "último guardado".
 */
export function autodateInstant(
	type: ResolvedContentType,
	values: FormValues,
	name: AutodateName
): Date | null {
	if (!autodateField(type, name)) return null;
	const raw = values[name];
	if (typeof raw !== 'string') return null;
	const ms = Date.parse(raw);
	return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * El autodate `name` YA formateado para la tarjeta "Registro" del aside, o `null` si no hay nada
 * honesto que pintar. Formatea con `describeCell` (`$lib/list/cell`, la MISMA función que da las
 * fechas de la tabla y del raíl): relativo por debajo de una semana ("hace 1 min", como el
 * mockup), absoluto a partir de ahí — sin una segunda regla de formato de fecha en el repo.
 *
 * `now` (default `Date.now()`) es el instante de referencia de ese relativo, parámetro explícito
 * por el mismo motivo que en `describeCell`: mantiene la función testeable sin mockear el reloj.
 */
export function autodateText(
	type: ResolvedContentType,
	values: FormValues,
	name: AutodateName,
	locale: Locale,
	now: number = Date.now()
): string | null {
	const field = autodateField(type, name);
	if (!field) return null;
	const descriptor = describeCell(field, values[name] ?? null, locale, now);
	return descriptor.kind === 'date' ? descriptor.text : null;
}
