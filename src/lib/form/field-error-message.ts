/**
 * Traduce un `TranslatedError` (de `field-errors.ts`/`validation.ts`) al texto final que pinta
 * `FieldRow.svelte`/`RecordForm.svelte` (Fase F5-a, L-P5.4). Un código CONOCIDO
 * (`error.known`) intenta la clave `form.errorCode.<code>` del diccionario del chrome
 * (`editor.*`/`form.*`, i18n de P5); si esa clave no está traducida todavía (`t()` la devuelve
 * cruda, política de "clave ausente" de `$lib/i18n`) o el código es desconocido, cae al
 * `message` del backend/puerto — el mismo fallback honesto que ya documenta `field-errors.ts`.
 * Nunca deja una clave `form.errorCode.…` cruda en pantalla.
 */

import type { TranslatedError } from './field-errors';

/** Firma de `VegaAppContext.t` (evita importar Svelte/contexto en este módulo puro). */
type Translate = (key: string, params?: Record<string, string | number>) => string;

export function fieldErrorMessage(t: Translate, error: TranslatedError): string {
	if (!error.known) return error.message;
	const key = `form.errorCode.${error.code}`;
	const translated = t(key);
	return translated === key ? error.message : translated;
}
